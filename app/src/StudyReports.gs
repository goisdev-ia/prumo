/**
 * Estudos — indicadores e relatórios (fonte única para a tela Desempenho, o Telegram e o PDF).
 *
 * Definições (também mostradas na tela):
 *  - Tempo líquido: soma de est_sessoes.liquido_s encerradas (pausas descontadas).
 *  - Precisão nas respondidas = acertos ÷ (acertos + erros). Brancos, anuladas e questões sem gabarito ficam fora.
 *  - Amostra pequena: menos de 30 respondidas válidas (o número aparece junto).
 *  - Cobertura simples = assuntos-folha do edital ativo com teoria concluída ÷ assuntos-folha (itens retirados e
 *    itens-pai que têm subitens não contam). Ponderada usa o peso/quantidade de questões de cada item.
 *  - Sem dados: divisão por zero vira "sem dados", nunca 0 % ou 100 % inventado.
 */
var StudyReports = (function () {
  function T(n) { return Db.table(n); }
  var AMOSTRA_MIN = 30;

  function res_(t) { return t.resultado_atual || t.resultado; }
  function pct_(a, b) { return b > 0 ? Math.round(a / b * 1000) / 10 : null; }

  /** Cobertura do edital ativo do concurso (ou do principal). */
  function coverage(concursoId, editalId) {
    var conc = concursoId ? T('est_concursos').get(concursoId) : T('est_concursos').list().filter(function (c) { return c.principal && !c.arquivado; })[0];
    if (!conc && !editalId) return { pct: null, ponderada: null, total: 0, concluidos: 0, motivo: 'Escolha um concurso principal com edital cadastrado.' };
    var ed = editalId ? T('est_editais').get(editalId) : T('est_editais').list().filter(function (e) { return e.concurso_id === conc.id && e.ativo; }).sort(function (a, b) { return b.versao - a.versao; })[0];
    if (!ed) return { pct: null, ponderada: null, total: 0, concluidos: 0, concurso_id: conc && conc.id, motivo: 'Este concurso ainda não tem edital verticalizado.' };
    var itens = T('est_edital_itens').list().filter(function (x) { return x.edital_id === ed.id && x.alteracao !== 'retirado'; });
    var ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a; });
    var inEd = {}; itens.forEach(function (x) { inEd[x.assunto_id] = 1; });
    var folhas = itens.filter(function (x) { return !itens.some(function (y) { return ass[y.assunto_id] && ass[y.assunto_id].pai_id === x.assunto_id; }); });
    var w = function (x) { return Number(x.qtd_questoes) || Number(x.peso) || 1; };
    var feitos = folhas.filter(function (x) { return ass[x.assunto_id] && ass[x.assunto_id].teoria === 'concluida'; });
    var andamento = folhas.filter(function (x) { return ass[x.assunto_id] && ass[x.assunto_id].teoria === 'em_andamento'; });
    var pesoTot = folhas.reduce(function (s, x) { return s + w(x); }, 0), pesoFeito = feitos.reduce(function (s, x) { return s + w(x); }, 0);
    return { concurso_id: conc ? conc.id : ed.concurso_id, edital_id: ed.id, versao: ed.versao, total: folhas.length, concluidos: feitos.length, em_andamento: andamento.length, pct: pct_(feitos.length, folhas.length), ponderada: pct_(pesoFeito, pesoTot), ids_pendentes: folhas.filter(function (x) { return !ass[x.assunto_id] || ass[x.assunto_id].teoria !== 'concluida'; }).map(function (x) { return x.assunto_id; }).slice(0, 500) };
  }

  /** Domínio do assunto (critério visível): precisão nas últimas 20 respondidas, mínimo 10. */
  function mastery(tentativas) {
    var v = tentativas.filter(function (t) { var r = res_(t); return r === 'certa' || r === 'errada'; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 20);
    if (v.length < 10) return { nivel: 'sem_dados', n: v.length, pct: null };
    var p = v.filter(function (t) { return res_(t) === 'certa'; }).length / v.length * 100;
    return { nivel: p >= 80 ? 'alto' : p >= 60 ? 'medio' : 'baixo', n: v.length, pct: Math.round(p) };
  }

  /**
   * Indicadores com filtros. p: {de, ate, concurso_id, disciplina_id, assunto_id, banca, tipo}
   * Devolve também os ids que compõem cada número, para a tela abrir os registros de origem.
   */
  function stats(p) {
    p = p || {};
    var hoje = Utils.today(), de = p.de || Utils.addDays(hoje, -29), ate = p.ate || hoje;
    if (de > ate) throw Utils.error('VALIDATION', 'A data inicial é depois da final.');
    var qs = {}; T('est_questoes').list().forEach(function (q) { qs[q.id] = q; });
    var assById = {}; T('est_assuntos').list().forEach(function (a) { assById[a.id] = a; });
    var discById = {}; T('est_disciplinas').list().forEach(function (d) { discById[d.id] = d; });
    var inDate = function (iso) { var d = String(iso || '').slice(0, 10); return d >= de && d <= ate; };
    var matchCtx = function (o) { return (!p.concurso_id || o.concurso_id === p.concurso_id || o.concurso_id == null) && (!p.disciplina_id || o.disciplina_id === p.disciplina_id) && (!p.assunto_id || o.assunto_id === p.assunto_id); };

    // tempo
    var sess = T('est_sessoes').list().filter(function (s) { return s.status === 'encerrada' && inDate(s.inicio) && matchCtx(s) && (!p.tipo || s.tipo === p.tipo); });
    var tempo = sess.reduce(function (a, s) { return a + (Number(s.liquido_s) || 0); }, 0);
    var porDia = {}, porDisc = {}, porTipo = {};
    sess.forEach(function (s) {
      var d = String(s.inicio).slice(0, 10), m = Number(s.liquido_s) || 0;
      porDia[d] = (porDia[d] || 0) + m;
      var dn = s.disciplina_id && discById[s.disciplina_id] ? discById[s.disciplina_id].nome : 'Sem disciplina';
      porDisc[dn] = (porDisc[dn] || 0) + m;
      var grp = s.tipo === 'questoes' ? 'pratica' : s.tipo === 'revisao' ? 'revisao' : s.tipo === 'simulado' ? 'simulados' : s.tipo === 'discursiva' ? 'discursivas' : 'teoria';
      porTipo[grp] = (porTipo[grp] || 0) + m;
    });
    var dias = Utils.diffDays(de, ate) + 1, diasEstudo = Object.keys(porDia).length;

    // planejado × realizado (tarefas de estudo com data no período)
    var plan = T('tar_tarefas').list().filter(function (t) { return t.status !== 'cancelada' && (t.est_tipo || t.est_disciplina_id) && t.data_vencimento >= de && t.data_vencimento <= ate && (!p.disciplina_id || t.est_disciplina_id === p.disciplina_id) && (!p.concurso_id || !t.est_concurso_id || t.est_concurso_id === p.concurso_id); });
    var planMin = plan.reduce(function (a, t) { return a + (Number(t.duracao_estimada_min) || 0); }, 0);

    // questões
    var tent = T('est_tentativas').list().filter(function (t) {
      var q = qs[t.questao_id]; if (!q || !inDate(t.created_at)) return false;
      return matchCtx(q) && (!p.banca || Utils.norm(q.banca) === Utils.norm(p.banca)) && (!p.tipo || p.tipo === 'questoes' || (p.tipo === 'simulado' && t.modo === 'simulado'));
    });
    var cnt = function (arr) {
      var o = { total: arr.length, certas: 0, erradas: 0, brancos: 0, anuladas: 0, sem_gabarito: 0, tempo_s: 0, com_tempo: 0 };
      arr.forEach(function (t) { var r = res_(t); if (r === 'certa') o.certas++; else if (r === 'errada') o.erradas++; else if (r === 'branco') o.brancos++; else if (r === 'anulada') o.anuladas++; else o.sem_gabarito++; if (t.tempo_s) { o.tempo_s += Number(t.tempo_s); o.com_tempo++; } });
      o.respondidas = o.certas + o.erradas; o.precisao = pct_(o.certas, o.respondidas); o.amostra_pequena = o.respondidas < AMOSTRA_MIN;
      o.tempo_medio_s = o.com_tempo ? Math.round(o.tempo_s / o.com_tempo) : null; return o;
    };
    var qAll = cnt(tent), qPrim = cnt(tent.filter(function (t) { return t.primeira; })), qRep = cnt(tent.filter(function (t) { return !t.primeira; }));
    // dificuldades por assunto
    var porAss = Utils.groupBy(tent.filter(function (t) { return qs[t.questao_id].assunto_id; }), function (t) { return qs[t.questao_id].assunto_id; });
    var dificuldades = Object.keys(porAss).map(function (aid) { var c = cnt(porAss[aid]); return { assunto_id: aid, titulo: assById[aid] ? assById[aid].titulo : '?', disciplina: assById[aid] && discById[assById[aid].disciplina_id] ? discById[assById[aid].disciplina_id].nome : '', respondidas: c.respondidas, precisao: c.precisao }; })
      .filter(function (x) { return x.respondidas >= 5 && x.precisao != null && x.precisao < 60; }).sort(function (a, b) { return a.precisao - b.precisao; }).slice(0, 15);
    var porDiscQ = {};
    tent.forEach(function (t) { var q = qs[t.questao_id], dn = q.disciplina_id && discById[q.disciplina_id] ? discById[q.disciplina_id].nome : 'Sem disciplina'; (porDiscQ[dn] = porDiscQ[dn] || []).push(t); });
    var questoesPorDisc = Object.keys(porDiscQ).map(function (k) { var c = cnt(porDiscQ[k]); return { disciplina: k, respondidas: c.respondidas, precisao: c.precisao, amostra_pequena: c.amostra_pequena }; }).sort(function (a, b) { return b.respondidas - a.respondidas; });

    // revisões
    var revs = T('est_revisoes').list().filter(function (r) { return matchCtx(r); });
    var feitas = revs.filter(function (r) { return r.status === 'feita' && inDate(r.feita_em); });
    var noPrazo = feitas.filter(function (r) { return String(r.feita_em).slice(0, 10) <= r.vencimento; });
    var atrasadasAgora = revs.filter(function (r) { return r.status === 'pendente' && r.vencimento < hoje; });
    var hojeRev = revs.filter(function (r) { return r.status === 'pendente' && r.vencimento <= hoje; });

    // simulados e discursivas
    var sims = T('est_simulados').list().filter(function (s) { return s.status === 'finalizado' && inDate(s.fim) && (!p.concurso_id || s.concurso_id === p.concurso_id); })
      .sort(function (a, b) { return a.fim < b.fim ? -1 : 1; }).map(function (s) { var r = s.resultado_json || {}; var t = r.total || {}; return { id: s.id, titulo: s.titulo, tipo: s.tipo, fim: s.fim, nota: t.nota, max: t.max, pct: t.pct, acertos: t.acertos, erros: t.erros, brancos: t.brancos, anuladas: t.anuladas }; });
    var disc = T('est_discursivas').list().filter(function (d) { return (d.avaliacoes_json || []).length && (!p.concurso_id || d.concurso_id === p.concurso_id); }).map(function (d) {
      return { id: d.id, titulo: d.titulo, avaliacoes: (d.avaliacoes_json || []).filter(function (a) { return inDate(a.em); }).map(function (a) { return { tipo: a.tipo, total: a.total, max: a.max, pct: pct_(a.total, a.max), em: a.em, versao: a.versao }; }) };
    }).filter(function (d) { return d.avaliacoes.length; });

    // erros recorrentes e metas
    var errosAbertos = T('est_erros').list().filter(function (e) { return e.status !== 'resolvida' && matchCtx(e); });
    var recorrentes = errosAbertos.filter(function (e) { return Number(e.recorrencias) > 1; });
    var metas = T('met_metas').list().filter(function (m) { return m.status === 'ativa' && /^est_/.test(m.origem_metrica || ''); }).map(function (m) { var v = Goals.currentValue(m); return { id: m.id, titulo: m.titulo, atual: v, alvo: m.valor_alvo, unidade: m.unidade, ritmo: Goals.pace(m, v) }; });
    var cards = T('est_flashcards').list().filter(function (c) { return !c.suspenso && matchCtx(c); });

    return {
      periodo: { de: de, ate: ate, dias: dias }, filtros: p, gerado_em: Utils.nowIso(),
      tempo: { total_s: tempo, sessoes: sess.length, dias_com_estudo: diasEstudo, consistencia_pct: pct_(diasEstudo, dias), media_dia_s: dias ? Math.round(tempo / dias) : 0, por_dia: porDia, por_disciplina: porDisc, por_tipo: porTipo, ids: sess.map(function (s) { return s.id; }).slice(0, 500) },
      plano: { planejado_min: planMin, realizado_min: Math.round(tempo / 60), tarefas: plan.length, concluidas: plan.filter(function (t) { return t.status === 'feito'; }).length, pct: pct_(Math.round(tempo / 60), planMin), ids: plan.map(function (t) { return t.id; }).slice(0, 500) },
      cobertura: coverage(p.concurso_id || null),
      questoes: { geral: qAll, primeira: qPrim, repeticoes: qRep, por_disciplina: questoesPorDisc, amostra_min: AMOSTRA_MIN, ids: tent.map(function (t) { return t.id; }).slice(0, 500) },
      revisoes: { feitas: feitas.length, no_prazo: noPrazo.length, no_prazo_pct: pct_(noPrazo.length, feitas.length), atrasadas_pendentes: atrasadasAgora.length, para_hoje: hojeRev.length, ids_atrasadas: atrasadasAgora.map(function (r) { return r.id; }).slice(0, 300) },
      dificuldades: dificuldades, erros: { abertos: errosAbertos.length, recorrentes: recorrentes.length, ids: recorrentes.map(function (e) { return e.id; }).slice(0, 200) },
      simulados: sims, discursivas: disc, metas: metas,
      flashcards: { ativos: cards.length, vencidos: cards.filter(function (c) { return !c.novo && c.vencimento && c.vencimento <= hoje; }).length, novos: cards.filter(function (c) { return c.novo; }).length }
    };
  }

  function hm_(s) { s = Math.round(Number(s) || 0); var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? h + ' h ' + (m < 10 ? '0' : '') + m + ' min' : m + ' min'; }
  function p_(v, n) { return v == null ? 'sem dados' : String(v).replace('.', ',') + ' %' + (n != null ? ' (' + n + ' resp.)' : ''); }

  /** Linhas de texto do relatório (usadas no Telegram e no PDF). */
  function lines(st, titulo) {
    var q = st.questoes.geral, out = [];
    out.push({ h: titulo || 'Relatório de estudos' });
    out.push({ t: 'Período: ' + Utils.brDate(st.periodo.de) + ' a ' + Utils.brDate(st.periodo.ate) + ' · gerado em ' + Utils.fmt(new Date(st.gerado_em), 'dd/MM/yyyy HH:mm') });
    out.push({ s: 'Tempo' });
    out.push({ t: 'Tempo líquido: ' + hm_(st.tempo.total_s) + ' em ' + st.tempo.sessoes + ' sessão(ões); estudou em ' + st.tempo.dias_com_estudo + ' de ' + st.periodo.dias + ' dias (' + p_(st.tempo.consistencia_pct) + ').' });
    if (st.plano.planejado_min) out.push({ t: 'Planejado × realizado: ' + hm_(st.plano.planejado_min * 60) + ' planejadas, ' + hm_(st.plano.realizado_min * 60) + ' realizadas; ' + st.plano.concluidas + ' de ' + st.plano.tarefas + ' tarefas concluídas.' });
    var disc = Object.keys(st.tempo.por_disciplina).sort(function (a, b) { return st.tempo.por_disciplina[b] - st.tempo.por_disciplina[a]; });
    if (disc.length) out.push({ tab: [['Disciplina', 'Tempo']].concat(disc.slice(0, 12).map(function (d) { return [d, hm_(st.tempo.por_disciplina[d])]; })) });
    out.push({ s: 'Questões' });
    out.push({ t: q.total ? (q.total + ' tentativa(s): ' + q.certas + ' certas, ' + q.erradas + ' erradas, ' + q.brancos + ' em branco, ' + q.anuladas + ' anuladas, ' + q.sem_gabarito + ' sem gabarito.') : 'Nenhuma questão no período.' });
    if (q.total) out.push({ t: 'Precisão nas respondidas: ' + p_(q.precisao, q.respondidas) + (q.amostra_pequena ? ' — amostra pequena (menos de ' + st.questoes.amostra_min + ')' : '') + '. Primeira tentativa: ' + p_(st.questoes.primeira.precisao, st.questoes.primeira.respondidas) + '; repetições: ' + p_(st.questoes.repeticoes.precisao, st.questoes.repeticoes.respondidas) + '.' + (q.tempo_medio_s ? ' Tempo médio: ' + q.tempo_medio_s + ' s por questão.' : '') });
    if (st.questoes.por_disciplina.length) out.push({ tab: [['Disciplina', 'Respondidas', 'Precisão']].concat(st.questoes.por_disciplina.slice(0, 12).map(function (d) { return [d.disciplina, String(d.respondidas), p_(d.precisao) + (d.amostra_pequena ? ' *' : '')]; })) });
    out.push({ s: 'Revisões e erros' });
    out.push({ t: st.revisoes.feitas + ' revisão(ões) feitas (' + p_(st.revisoes.no_prazo_pct) + ' no prazo); ' + st.revisoes.atrasadas_pendentes + ' atrasada(s) pendente(s); ' + st.erros.abertos + ' erro(s) em aberto, ' + st.erros.recorrentes + ' recorrente(s).' });
    if (st.dificuldades.length) out.push({ t: 'Assuntos com dificuldade (menos de 60 %, mínimo 5 respostas): ' + st.dificuldades.slice(0, 8).map(function (d) { return d.titulo + ' (' + p_(d.precisao, d.respondidas) + ')'; }).join('; ') + '.' });
    var cv = st.cobertura;
    out.push({ s: 'Edital' });
    out.push({ t: cv.total ? ('Cobertura (teoria concluída): ' + p_(cv.pct) + ' — ' + cv.concluidos + ' de ' + cv.total + ' assuntos; ponderada pelo peso: ' + p_(cv.ponderada) + '.') : (cv.motivo || 'Sem edital cadastrado.') });
    if (st.simulados.length) { out.push({ s: 'Simulados' }); out.push({ tab: [['Simulado', 'Data', 'Nota', '%']].concat(st.simulados.slice(-10).map(function (s) { return [s.titulo + (s.tipo === 'prova_real' ? ' (prova real)' : ''), Utils.brDate(String(s.fim).slice(0, 10)), (s.nota != null ? String(Math.round(s.nota * 100) / 100).replace('.', ',') : '—') + ' / ' + (s.max != null ? s.max : '—'), p_(s.pct)]; })) }); }
    if (st.metas.length) { out.push({ s: 'Metas' }); st.metas.forEach(function (m) { out.push({ t: m.titulo + ': ' + String(m.atual).replace('.', ',') + (m.unidade ? ' ' + m.unidade : '') + ' de ' + (m.alvo != null ? m.alvo : '—') }); }); }
    out.push({ t: 'Definições: precisão = acertos ÷ (acertos + erros); brancos, anuladas e sem gabarito ficam fora. Cobertura conta assuntos-folha do edital ativo; itens retirados não contam.' });
    return out;
  }

  /** Texto HTML curto para o Telegram. */
  function telegramText(st, titulo) {
    var esc = Utils.escapeHtml;
    return lines(st, titulo).map(function (l) {
      if (l.h) return '<b>' + esc(l.h) + '</b>';
      if (l.s) return '\n<b>' + esc(l.s) + '</b>';
      if (l.tab) return l.tab.slice(1).map(function (r) { return '• ' + esc(r.join(' — ')); }).join('\n');
      return esc(l.t);
    }).join('\n');
  }

  /** Gera PDF no servidor (Google Docs temporário → PDF), sem navegador. Devolve o registro em arquivos. */
  function buildPdf(st, titulo) {
    var nome = (titulo || 'Relatório de estudos') + ' ' + Utils.fmt(new Date(), 'yyyy-MM-dd HHmm');
    var doc = DocumentApp.create(nome), body = doc.getBody(), docId = doc.getId();
    try {
      lines(st, titulo).forEach(function (l) {
        if (l.h) body.appendParagraph(l.h).setHeading(DocumentApp.ParagraphHeading.HEADING1);
        else if (l.s) body.appendParagraph(l.s).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        else if (l.tab) body.appendTable(l.tab);
        else body.appendParagraph(l.t);
      });
      doc.saveAndClose();
      var pdf = DriveApp.getFileById(docId).getAs('application/pdf').setName(nome + '.pdf');
      var bytes = pdf.getBytes();
      var file = StudyFiles.folder_('exportacoes').createFile(pdf);
      var arq = Db.table('arquivos').insert({ drive_id: file.getId(), nome: nome + '.pdf', mime: 'application/pdf', tamanho_bytes: bytes.length, modulo: 'estudos', entidade: 'est_exportacoes', tipo: 'outro', hash: Utils.sha256Bytes(bytes) });
      Db.table('est_exportacoes').insert({ tipo: 'relatorio', arquivo_id: arq.id, hash: arq.hash, tamanho_bytes: arq.tamanho_bytes, titulo: arq.nome });
      return arq;
    } finally {
      try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* temporário já removido */ }
    }
  }

  function csv_(st) {
    var q = function (v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var discs = {}; T('est_disciplinas').list().forEach(function (d) { discs[d.id] = d.nome; });
    var ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a.titulo; });
    var rows = [['# Relatório de estudos', st.periodo.de + ' a ' + st.periodo.ate, 'gerado ' + st.gerado_em], ['tipo', 'data', 'disciplina', 'assunto', 'atividade', 'minutos_liquidos', 'questoes', 'acertos', 'resultado']];
    var ids = {}; st.tempo.ids.forEach(function (id) { ids[id] = 1; });
    T('est_sessoes').list().filter(function (s) { return ids[s.id]; }).forEach(function (s) { rows.push(['sessao', String(s.inicio).slice(0, 10), discs[s.disciplina_id] || '', ass[s.assunto_id] || '', s.tipo, Math.round((s.liquido_s || 0) / 60), s.questoes_n || '', s.acertos_n || '', '']); });
    var qs = {}; T('est_questoes').list().forEach(function (x) { qs[x.id] = x; });
    var tid = {}; st.questoes.ids.forEach(function (id) { tid[id] = 1; });
    T('est_tentativas').list().filter(function (t) { return tid[t.id]; }).forEach(function (t) { var x = qs[t.questao_id] || {}; rows.push(['questao', String(t.created_at).slice(0, 10), discs[x.disciplina_id] || '', ass[x.assunto_id] || '', t.modo, '', x.codigo || '', '', res_(t)]); });
    return rows.map(function (r) { return r.map(q).join(';'); }).join('\n');
  }

  /** Rota: relatório em PDF (servidor) ou CSV, salvo em exportacoes. */
  function reportRoute(p) {
    var st = stats(p || {});
    if (p.formato === 'csv') {
      var bytes = Utilities.newBlob('﻿' + csv_(st), 'text/csv', 'estudos.csv').getBytes();
      var nome = 'estudos_' + st.periodo.de + '_' + st.periodo.ate + '.csv';
      var file = StudyFiles.folder_('exportacoes').createFile(Utilities.newBlob(bytes, 'text/csv', nome));
      var arq = Db.table('arquivos').insert({ drive_id: file.getId(), nome: nome, mime: 'text/csv', tamanho_bytes: bytes.length, modulo: 'estudos', entidade: 'est_exportacoes', tipo: 'outro', hash: Utils.sha256Bytes(bytes) });
      return { arquivo: arq, url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
    }
    var a = buildPdf(st, p.titulo || 'Relatório de estudos');
    return { arquivo: a, url: 'https://drive.google.com/file/d/' + a.drive_id + '/view' };
  }

  return { stats: stats, coverage: coverage, mastery: mastery, lines: lines, telegramText: telegramText, buildPdf: buildPdf, reportRoute: reportRoute, hm_: hm_ };
})();
