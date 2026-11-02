/**
 * Estudos no Telegram: comandos, menus numerados, envio de arquivos (sendDocument), recebimento de arquivos
 * e fila de pedidos (est_jobs) que funciona com o app fechado.
 *
 *  - Usa o mesmo bot, vínculo e histórico de Telegram.gs. O destinatário é sempre o chat vinculado no servidor.
 *  - Leitura por getUpdates a cada 5 min (ou "Verificar" no app): as respostas não são instantâneas.
 *  - Escolhas por número ("responda 1, 2…"): nada depende de botões que expiram.
 *  - Pedidos pesados viram jobs: registrados antes de processar, com estado, tentativas e chave anti-duplicação.
 *  - "Enviado" quer dizer que o Telegram aceitou a mensagem. O bot não sabe se a pessoa leu.
 *  - Cópia anotada só é enviada se corresponder à revisão atual das anotações; senão o bot diz a situação.
 */
var StudyTelegram = (function () {
  function X() { return Telegram._x; }
  function T(n) { return Db.table(n); }
  var esc = function (s) { return X().esc_(s); };
  var CTX_MIN = 30, PEDIDOS_DIA = 60, AVISOS_DIA = 6;

  function routes() {
    return {
      'est.tgSend': tgSend,
      'est.jobs': function () { return { jobs: T('est_jobs').list().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 40) }; },
      'est.jobCancel': function (p) { return cancel_(p.id || null, p.codigo || null); },
      'est.checkFiles': function (p) { return StudyFiles.checkFiles(p); }
    };
  }


  // ================= contexto da conversa =================
  function ctxGet_() {
    var c = Auth.setting('tg.ctx', null);
    if (!c || !c.expira || new Date(c.expira) < new Date()) return null;
    return c;
  }
  function ctxSet_(c) { X().saveVals_({ 'tg.ctx': c ? Object.assign({ expira: new Date(Date.now() + CTX_MIN * 60000).toISOString() }, c) : null }); }

  function reply_(up, texto) { return X().enviar_(texto, 'resp:' + up.update_id + ':' + Utils.sha256(texto).slice(0, 8), 'resposta', []); }
  function replyParts_(up, texto) {
    var parts = splitHtml_(texto, 3800);
    parts.forEach(function (t, i) { X().enviar_(t + (parts.length > 1 ? '\n<i>(' + (i + 1) + '/' + parts.length + ')</i>' : ''), 'resp:' + up.update_id + ':p' + i, 'resposta', []); });
  }
  /** Divide em partes sem cortar tags HTML no meio (quebra por linha). */
  function splitHtml_(s, max) {
    var out = [], cur = '';
    String(s).split('\n').forEach(function (line) {
      while (line.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(line.slice(0, max).replace(/<[^>]*$/, '')); line = line.slice(max); }
      if ((cur + '\n' + line).length > max) { out.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line;
    });
    if (cur) out.push(cur);
    return out;
  }

  // ================= roteamento das mensagens =================
  /** Devolve true quando a mensagem foi tratada por Estudos (senão Telegram.gs segue com /hoje, /parar, ajuda). */
  function handle(up, m, chatId, texto) {
    if (m.document || (m.photo && m.photo.length)) { receive_(up, m); return true; }
    var t = String(texto || '').trim(), low = Utils.norm(t);
    var parts = t.replace(/@\w+/, '').split(/\s+/), cmd = Telegram.canon(t) || parts[0].toLowerCase(), arg = parts.slice(1).join(' ').trim();
    var ctx = ctxGet_();
    if (ctx && /^\d{1,2}[a-z]?$/i.test(t)) { choose_(up, ctx, t.toLowerCase()); return true; }
    if (ctx && ctx.tipo === 'questao' && /^[a-e]$|^(certo|errado|c|e)$/i.test(t)) { answerQ_(up, ctx, t); return true; }
    if (ctx && /^(cancelar|sair|parar sessao)$/.test(low)) { ctxSet_(null); reply_(up, 'Ok, escolha cancelada.'); return true; }
    if (ctx && ctx.tipo === 'variante' && /^(o|a|original|anotad[oa])$/.test(low)) { choose_(up, ctx, /^o|original/.test(low) ? '1' : '2'); return true; }
    switch (cmd) {
      case '/estudos': menu_(up); return true;
      case '/estudos_hoje': reply_(up, todayText_()); return true;
      case '/concursos': concursos_(up); return true;
      case '/plano': reply_(up, planText_(/semana/.test(low))); return true;
      case '/progresso': reply_(up, StudyReports.telegramText(StudyReports.stats(Object.assign({ de: Utils.addDays(Utils.today(), -6) }, ctxConc_())), 'Progresso · últimos 7 dias')); return true;
      case '/revisoes': reply_(up, reviewsText_()); return true;
      case '/materiais': materials_(up, arg, null); return true;
      case '/pdf': pdf_(up, arg); return true;
      case '/resumo': notes_(up, arg); return true;
      case '/resumir': summarize_(up, arg); return true;
      case '/relatorio': report_(up, arg); return true;
      case '/erros': reply_(up, errorsText_(arg)); return true;
      case '/flashcards': cards_(up, arg); return true;
      case '/questoes': questions_(up, arg); return true;
      case '/ia': if (!arg) { reply_(up, 'Use: /ia sua pergunta. Ex.: /ia qual a diferença entre aval e fiança?'); return true; } enqueue_(up, 'ia_chat', { pergunta: arg.slice(0, 2000) }); return true;
      case '/gerar_questoes': { var mq = arg.match(/^(.*?)(?:\s+(\d{1,2}))?$/); var tema = (mq && mq[1] || '').trim(), nq = Utils.clamp(Number(mq && mq[2]) || 5, 1, 10); if (!tema) { reply_(up, 'Use: /gerar_questoes tema [quantidade]. Ex.: /gerar_questoes crase 5'); return true; } enqueue_(up, 'ia_questoes', { tema: tema.slice(0, 200), n: nq }); return true; }
      case '/resumo_ia': if (!arg) { reply_(up, 'Use: /resumo_ia tema. Ex.: /resumo_ia sistema financeiro nacional'); return true; } enqueue_(up, 'ia_resumo', { tema: arg.slice(0, 200) }); return true;
      case '/status': reply_(up, jobStatusText_(arg)); return true;
      case '/cancelar': { var r = cancel_(null, arg.toUpperCase()); reply_(up, r.mensagem); return true; }
      case '/parar_estudos': X().saveVals_({ 'est.tg_avisos': false }); reply_(up, 'Avisos automáticos de Estudos desligados. Os pedidos que você fizer aqui continuam funcionando. Para ligar de novo: Estudos › Preferências no app.'); return true;
      case '/ajuda': case '/start': replyParts_(up, Telegram.ajudaText()); return true;
      case '/funcoes': replyParts_(up, Telegram.funcoesText()); return true;
    }
    // intenções simples em português
    var mm;
    if ((mm = low.match(/(?:envi[ae]|mand[ae]|quero|preciso)\b.*\b(?:pdf|material|apostila|arquivo)\s+(?:de|da|do|sobre)\s+(.+)$/))) { materials_(up, mm[1], null); return true; }
    if ((mm = low.match(/relatorio(?:.*\b(semana|mes|hoje))?(.*\bpdf\b)?/)) && /relatorio/.test(low)) { report_(up, (mm[1] || 'semana') + (mm[2] ? ' pdf' : '')); return true; }
    if ((mm = low.match(/resumo\s+(?:de|da|do|sobre)\s+(.+)$/))) { notes_(up, mm[1]); return true; }
    if ((mm = low.match(/\berros?\s+(?:de|da|do|em)\s+(.+)$/))) { reply_(up, errorsText_(mm[1])); return true; }
    if (/\brevis(ao|oes)\b/.test(low)) { reply_(up, reviewsText_()); return true; }
    if (/\b(progresso|desempenho)\b/.test(low)) { reply_(up, StudyReports.telegramText(StudyReports.stats(Object.assign({ de: Utils.addDays(Utils.today(), -6) }, ctxConc_())), 'Progresso · últimos 7 dias')); return true; }
    if (/\b(estudar hoje|estudos de hoje|o que estudar)\b/.test(low)) { reply_(up, todayText_()); return true; }
    return false;
  }

  function ctxConc_() { var c = Auth.setting('est.tg_concurso', null); return c ? { concurso_id: c } : {}; }

  function menu_(up) {
    ctxSet_({ tipo: 'menu', opcoes: ['hoje', 'progresso', 'revisoes', 'plano', 'relatorio', 'concursos'] });
    reply_(up, '<b>Estudos</b> — responda com o número:\n1. Atividades de hoje\n2. Progresso (7 dias)\n3. Revisões pendentes\n4. Plano da semana\n5. Relatório da semana em PDF\n6. Escolher concurso\n\nOu use /materiais termo, /pdf código, /resumo assunto.');
  }

  var CATS_ = ['questoes', 'revisoes', 'teoria', 'flashcards', 'outros'];
  function choose_(up, ctx, t) {
    var n = parseInt(t, 10), op = ctx.opcoes && ctx.opcoes[n - 1];
    if (!op) { reply_(up, 'Número fora da lista. Responda de 1 a ' + (ctx.opcoes || []).length + ' ou "cancelar".'); return; }
    if (ctx.tipo === 'menu') {
      ctxSet_(null);
      if (op === 'hoje') reply_(up, todayText_()); else if (op === 'progresso') reply_(up, StudyReports.telegramText(StudyReports.stats(Object.assign({ de: Utils.addDays(Utils.today(), -6) }, ctxConc_())), 'Progresso · últimos 7 dias'));
      else if (op === 'revisoes') reply_(up, reviewsText_()); else if (op === 'plano') reply_(up, planText_(true)); else if (op === 'relatorio') report_(up, 'semana pdf'); else concursos_(up);
      return;
    }
    if (ctx.tipo === 'concurso') { var c = T('est_concursos').get(op); ctxSet_(null); if (!c) { reply_(up, 'Concurso não encontrado.'); return; } X().saveVals_({ 'est.tg_concurso': c.id }); reply_(up, 'Contexto: <b>' + esc(c.nome) + '</b>. Progresso e relatórios agora usam este concurso. Para ver todos, /concursos e escolha 0.'); return; }
    if (ctx.tipo === 'material') { var mat = T('est_materiais').get(op); if (!mat) { ctxSet_(null); reply_(up, 'Material não encontrado.'); return; } offerVariant_(up, mat, ctx.variante); return; }
    if (ctx.tipo === 'variante') { ctxSet_(null); enqueue_(up, 'enviar_material', { material_id: ctx.material_id, variante: op }); return; }
    if (ctx.tipo === 'variante_antiga') { ctxSet_(null); if (op === 'antiga') enqueue_(up, 'enviar_exportacao', { exportacao_id: ctx.exportacao_id, aviso_antiga: true }); else enqueue_(up, 'enviar_material', { material_id: ctx.material_id, variante: 'original' }); return; }
    if (ctx.tipo === 'nota') { ctxSet_(null); enqueue_(up, 'enviar_nota', { nota_id: op }); return; }
    if (ctx.tipo === 'categoria') {
      ctxSet_(null);
      var mc = T('est_materiais').get(ctx.material_id);
      if (!mc) { reply_(up, 'Material não encontrado.'); return; }
      mc = Studies.routes()['est.materialSave']({ id: mc.id, categoria: op }).material;
      var txtC = 'Pronto: ' + esc(mc.codigo) + ' em <b>' + esc(StudyFiles.CATEGORIAS[op]) + '</b>' + (mc.pasta ? ' (pasta ' + esc(mc.pasta) + ')' : '') + '.';
      if (mc.tipo === 'xlsx' && (op === 'questoes' || op === 'flashcards')) txtC += '\nPara importar as ' + (op === 'questoes' ? 'questões' : 'cartões') + ' desta planilha, abra Estudos › Biblioteca no app e use "Importar" no material (conferência linha por linha).';
      var discs2 = T('est_disciplinas').list().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); }).slice(0, 15);
      if (discs2.length) { ctxSet_({ tipo: 'disciplina', material_id: mc.id, opcoes: discs2.map(function (d) { return d.id; }).concat(['_nenhuma']) }); txtC += '\n\nDe qual disciplina? Responda com o número:\n' + discs2.map(function (d, i) { return (i + 1) + '. ' + esc(d.nome); }).join('\n') + '\n' + (discs2.length + 1) + '. Nenhuma'; }
      reply_(up, txtC);
      return;
    }
    if (ctx.tipo === 'disciplina') {
      ctxSet_(null);
      var mt = T('est_materiais').get(ctx.material_id), d = op === '_nenhuma' ? null : T('est_disciplinas').get(op);
      if (!mt) { reply_(up, 'Material não encontrado.'); return; }
      T('est_materiais').update(mt.id, { disciplina_id: d ? d.id : null });
      reply_(up, 'Pronto: ' + esc(mt.codigo) + (d ? ' em <b>' + esc(d.nome) + '</b>.' : ' sem disciplina.'));
      return;
    }
    if (ctx.tipo === 'cards') { gradeCard_(up, ctx, n); return; }
    reply_(up, 'Não entendi a escolha. Mande /estudos para recomeçar.');
  }

  // ================= consultas em texto =================
  function todayText_() {
    var hoje = Utils.today(), discs = {}; T('est_disciplinas').list().forEach(function (d) { discs[d.id] = d.nome; });
    var tk = T('tar_tarefas').list().filter(function (t) { return (t.est_tipo || t.est_disciplina_id) && t.status !== 'feito' && t.status !== 'cancelada' && t.data_vencimento && t.data_vencimento <= hoje; });
    var rv = T('est_revisoes').list().filter(function (r) { return r.status === 'pendente' && r.vencimento <= hoje; });
    var aberta = Studies.openSession_();
    var etapas = T('est_etapas').list().filter(function (e) { return e.status === 'pendente' && e.data && e.data >= hoje && e.data <= Utils.addDays(hoje, 7); });
    var out = ['<b>Estudos · hoje, ' + Utils.brDate(hoje) + '</b>'];
    if (aberta) out.push('\n<b>Sessão aberta</b> desde ' + Utils.fmt(new Date(aberta.inicio), 'HH:mm') + (aberta.disciplina_id ? ' — ' + esc(discs[aberta.disciplina_id] || '') : ''));
    out.push('\n<b>Atividades</b>'); out.push(tk.length ? tk.slice(0, 10).map(function (t) { return '• ' + esc(t.titulo) + (t.data_vencimento < hoje ? ' <i>(atrasada)</i>' : '') + (t.duracao_estimada_min ? ' · ' + t.duracao_estimada_min + ' min' : ''); }).join('\n') : 'Nada planejado para hoje.');
    out.push('\n<b>Revisões</b>'); out.push(rv.length ? rv.length + ' pendente(s)' + (rv.filter(function (r) { return r.vencimento < hoje; }).length ? ', ' + rv.filter(function (r) { return r.vencimento < hoje; }).length + ' atrasada(s)' : '') + ':\n' + rv.slice(0, 8).map(function (r) { return '• ' + esc(r.titulo); }).join('\n') : 'Nenhuma revisão para hoje.');
    if (etapas.length) { out.push('\n<b>Prazos nos próximos 7 dias</b>'); out.push(etapas.map(function (e) { return '• ' + Utils.brDate(e.data).slice(0, 5) + ' — ' + esc(e.titulo) + (e.data_status !== 'confirmada' ? ' <i>(' + (e.data_status === 'estimada' ? 'estimada' : 'a confirmar') + ')</i>' : ''); }).join('\n')); }
    return out.join('\n');
  }

  function planText_(semana) {
    var hoje = Utils.today(), ate = semana ? Utils.addDays(hoje, 6) : hoje;
    var tk = T('tar_tarefas').list().filter(function (t) { return (t.est_tipo || t.est_disciplina_id) && t.status !== 'cancelada' && t.data_vencimento >= hoje && t.data_vencimento <= ate; }).sort(function (a, b) { return a.data_vencimento < b.data_vencimento ? -1 : 1; });
    if (!tk.length) return 'Nenhuma atividade de estudo planejada ' + (semana ? 'nesta semana' : 'para hoje') + '. Gere o cronograma em Estudos › Planejamento.';
    var g = Utils.groupBy(tk, 'data_vencimento');
    return '<b>Plano ' + (semana ? 'da semana' : 'de hoje') + '</b>\n' + Object.keys(g).sort().map(function (d) { return '\n<b>' + Utils.brDate(d).slice(0, 5) + '</b>\n' + g[d].map(function (t) { return (t.status === 'feito' ? '✓ ' : '• ') + esc(t.titulo) + (t.duracao_estimada_min ? ' · ' + t.duracao_estimada_min + ' min' : ''); }).join('\n'); }).join('\n');
  }

  function reviewsText_() {
    var hoje = Utils.today(), rv = T('est_revisoes').list().filter(function (r) { return r.status === 'pendente' && r.vencimento <= hoje; }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
    var prox = T('est_revisoes').list().filter(function (r) { return r.status === 'pendente' && r.vencimento > hoje && r.vencimento <= Utils.addDays(hoje, 7); }).length;
    if (!rv.length) return 'Nenhuma revisão pendente para hoje.' + (prox ? ' ' + prox + ' nos próximos 7 dias.' : '');
    return '<b>Revisões pendentes (' + rv.length + ')</b>\n' + rv.slice(0, 20).map(function (r) { return '• ' + esc(r.titulo) + (r.vencimento < hoje ? ' <i>(desde ' + Utils.brDate(r.vencimento).slice(0, 5) + ')</i>' : ''); }).join('\n') + (rv.length > 20 ? '\n… e mais ' + (rv.length - 20) + '.' : '') + '\n\nFaça as revisões em Estudos › Revisões no app.';
  }

  function concursos_(up) {
    var cs = T('est_concursos').list().filter(function (c) { return !c.arquivado; }).sort(function (a, b) { return (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || (a.prioridade || 2) - (b.prioridade || 2); });
    if (!cs.length) { reply_(up, 'Nenhum concurso cadastrado. Cadastre em Estudos › Concursos no app.'); return; }
    var atual = Auth.setting('est.tg_concurso', null);
    ctxSet_({ tipo: 'concurso', opcoes: cs.slice(0, 15).map(function (c) { return c.id; }) });
    reply_(up, '<b>Concursos</b> — responda com o número para usar como contexto:\n' + cs.slice(0, 15).map(function (c, i) { return (i + 1) + '. ' + esc(c.nome) + (c.cargo ? ' · ' + esc(c.cargo) : '') + (c.data_prova ? ' · prova ' + Utils.brDate(c.data_prova) + (c.data_prova_status !== 'confirmada' ? ' (' + (c.data_prova_status === 'estimada' ? 'estimada' : 'a confirmar') + ')' : '') : '') + (c.id === atual ? ' <b>(atual)</b>' : ''); }).join('\n'));
  }

  function errorsText_(termo) {
    var q = Utils.norm(termo || ''), ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a.titulo; });
    var es = T('est_erros').list().filter(function (e) { return e.status !== 'resolvida' && (!q || Utils.norm(e.titulo + ' ' + (ass[e.assunto_id] || '') + ' ' + (e.explicacao || '')).indexOf(q) >= 0); });
    if (!es.length) return q ? 'Nenhum erro em aberto sobre "' + esc(termo) + '".' : 'Nenhum erro em aberto no caderno.';
    return '<b>Caderno de erros' + (q ? ' · ' + esc(termo) : '') + '</b> (' + es.length + ')\n' + es.slice(0, 12).map(function (e) { return '\n• <b>' + esc(e.titulo) + '</b>' + (ass[e.assunto_id] ? ' — ' + esc(ass[e.assunto_id]) : '') + (Number(e.recorrencias) > 1 ? ' <i>(' + e.recorrencias + 'x)</i>' : '') + (e.explicacao ? '\n  ' + esc(String(e.explicacao).slice(0, 300)) : '') + (e.acao ? '\n  Ação: ' + esc(String(e.acao).slice(0, 200)) : ''); }).join('\n');
  }

  function jobStatusText_(arg) {
    var cod = String(arg || '').toUpperCase().trim();
    var j = T('est_jobs').list().filter(function (x) { return !cod || x.codigo === cod; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
    if (!j) return cod ? 'Pedido ' + esc(cod) + ' não encontrado.' : 'Você não tem pedidos recentes.';
    var S = { na_fila: 'na fila', processando: 'processando', pronto: 'pronto para envio', enviando: 'enviando', enviado: 'enviado (o Telegram aceitou)', falhou: 'falhou', entrega_incerta: 'entrega incerta (a rede caiu durante o envio; confira o chat antes de pedir de novo)', cancelado: 'cancelado' };
    return 'Pedido <b>' + esc(j.codigo) + '</b>: ' + (S[j.status] || j.status) + (j.erro ? '\n' + esc(j.erro) : '') + (j.status === 'falhou' && j.proxima ? '\nNova tentativa: ' + Utils.fmt(new Date(j.proxima), 'dd/MM HH:mm') : '');
  }

  // ================= materiais e PDFs =================
  function findMaterials_(termo) {
    var q = Utils.norm(termo || ''), discs = {}; T('est_disciplinas').list().forEach(function (d) { discs[d.id] = d.nome; });
    var ms = T('est_materiais').list().filter(function (m) { return m.situacao !== 'arquivado' || /^m\d+$/.test(q); });
    if (/^m\d+$/.test(q)) return ms.filter(function (m) { return Utils.norm(m.codigo) === q; });
    var hits = ms.filter(function (m) { return Utils.norm([m.titulo, m.codigo, m.tags, m.autor, discs[m.disciplina_id] || ''].join(' ')).indexOf(q) >= 0; });
    return hits.sort(function (a, b) { return (b.favorito ? 1 : 0) - (a.favorito ? 1 : 0) || (a.updated_at < b.updated_at ? 1 : -1); });
  }

  function materials_(up, termo, variante) {
    if (!String(termo || '').trim()) { reply_(up, 'Diga o que procurar: /materiais português'); return; }
    var hits = findMaterials_(termo);
    if (!hits.length) { reply_(up, 'Nada na sua biblioteca com "' + esc(termo) + '". A busca olha título, código, etiquetas, autor e disciplina.'); return; }
    if (hits.length === 1) { offerVariant_(up, hits[0], variante); return; }
    ctxSet_({ tipo: 'material', opcoes: hits.slice(0, 10).map(function (m) { return m.id; }), variante: variante || null });
    reply_(up, '<b>Encontrei ' + hits.length + '</b> — responda com o número:\n' + hits.slice(0, 10).map(function (m, i) { return (i + 1) + '. ' + esc(m.codigo) + ' · ' + esc(m.titulo) + (m.versao > 1 ? ' (v' + m.versao + ')' : '') + (m.tipo !== 'pdf' ? ' [' + m.tipo + ']' : ''); }).join('\n') + (hits.length > 10 ? '\n… refine a busca para ver os demais.' : ''));
  }

  function offerVariant_(up, mat, variante) {
    if (!mat.arquivo_id) { ctxSet_(null); reply_(up, esc(mat.codigo) + ' · ' + esc(mat.titulo) + (mat.url ? '\n' + esc(mat.url) : '\n(não tem arquivo, é um ' + esc(mat.tipo) + ')')); return; }
    var info = mat.tipo === 'pdf' ? StudyFiles.latestExport(mat) : null;
    if (!info || !info.tem_anotacoes) { ctxSet_(null); enqueue_(up, 'enviar_material', { material_id: mat.id, variante: 'original' }); return; }
    if (variante === 'original' || variante === 'anotado') { ctxSet_(null); enqueue_(up, 'enviar_material', { material_id: mat.id, variante: variante }); return; }
    ctxSet_({ tipo: 'variante', material_id: mat.id, opcoes: ['original', 'anotado'] });
    reply_(up, esc(mat.codigo) + ' · ' + esc(mat.titulo) + ' tem anotações.\n1. Original\n2. Cópia anotada' + (info.atualizada ? ' (revisão ' + info.revisao_atual + ', atual)' : info.exportacao ? ' (a última cópia é da revisão ' + info.exportacao.revisao + '; as anotações estão na ' + info.revisao_atual + ')' : ' (ainda não exportada)'));
  }

  function pdf_(up, arg) {
    var m = String(arg || '').match(/^(\S+)(?:\s+(original|anotad[oa]))?/i);
    if (!m) { reply_(up, 'Use: /pdf M12 ou /pdf M12 anotado'); return; }
    var v = m[2] ? (/^orig/i.test(m[2]) ? 'original' : 'anotado') : null;
    materials_(up, /^m\d+$/i.test(m[1]) ? m[1] : arg.replace(/\s+(original|anotad[oa])$/i, ''), v);
  }

  // ================= resumos e notas =================
  function notes_(up, termo) {
    if (!String(termo || '').trim()) { reply_(up, 'Diga o assunto: /resumo crase'); return; }
    var q = Utils.norm(termo), ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a.titulo; });
    var ns = T('est_anotacoes').list().filter(function (n) { return n.aprovado !== false && Utils.norm([n.titulo, n.tags, ass[n.assunto_id] || '', n.norma || ''].join(' ')).indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.favorito ? 1 : 0) - (a.favorito ? 1 : 0) || (a.updated_at < b.updated_at ? 1 : -1); });
    if (!ns.length) { reply_(up, 'Não achei anotações salvas sobre "' + esc(termo) + '". Para um resumo novo de um material: /resumir M12 10-20.'); return; }
    if (ns.length === 1) { enqueue_(up, 'enviar_nota', { nota_id: ns[0].id }); return; }
    ctxSet_({ tipo: 'nota', opcoes: ns.slice(0, 10).map(function (n) { return n.id; }) });
    reply_(up, '<b>Anotações salvas sobre "' + esc(termo) + '"</b> — responda com o número:\n' + ns.slice(0, 10).map(function (n, i) { return (i + 1) + '. ' + esc(n.titulo) + ' <i>(' + esc(n.tipo) + (n.gerado_ia ? ', gerado por IA' : '') + ')</i>'; }).join('\n'));
  }

  function summarize_(up, arg) {
    var m = String(arg || '').match(/^(m\d+)(?:\s+(\d+(?:\s*-\s*\d+)?))?/i);
    if (!m) { reply_(up, 'Use: /resumir M12 ou /resumir M12 10-20 (páginas).'); return; }
    var mat = findMaterials_(m[1])[0];
    if (!mat) { reply_(up, 'Material ' + esc(m[1].toUpperCase()) + ' não encontrado.'); return; }
    enqueue_(up, 'gerar_resumo', { material_id: mat.id, paginas: m[2] ? m[2].replace(/\s/g, '') : null });
  }

  function report_(up, arg) {
    var low = Utils.norm(arg || ''), hoje = Utils.today();
    var de = /mes/.test(low) ? Utils.addDays(hoje, -29) : /hoje/.test(low) ? hoje : Utils.addDays(hoje, -6);
    var titulo = /mes/.test(low) ? 'Relatório dos últimos 30 dias' : /hoje/.test(low) ? 'Relatório de hoje' : 'Relatório da semana';
    if (/pdf/.test(low)) { enqueue_(up, 'enviar_relatorio', Object.assign({ de: de, ate: hoje, titulo: titulo, formato: 'pdf' }, ctxConc_())); return; }
    replyParts_(up, StudyReports.telegramText(StudyReports.stats(Object.assign({ de: de, ate: hoje }, ctxConc_())), titulo) + '\n\nPara o PDF: /relatorio ' + (/mes/.test(low) ? 'mes' : 'semana') + ' pdf');
  }

  // ================= flashcards e questões (sessões curtas) =================
  function cards_(up, termo) {
    var q = Utils.norm(termo || ''), hoje = Utils.today(), ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a.titulo; });
    var cs = T('est_flashcards').list().filter(function (c) { return !c.suspenso && (!q || Utils.norm([c.baralho, c.frente, c.tags, ass[c.assunto_id] || ''].join(' ')).indexOf(q) >= 0); });
    var due = cs.filter(function (c) { return !c.novo && c.vencimento && c.vencimento <= hoje; }).concat(cs.filter(function (c) { return c.novo; })).slice(0, 10);
    if (!due.length) { reply_(up, cs.length ? 'Nenhum cartão vencido' + (q ? ' sobre "' + esc(termo) + '"' : '') + ' agora.' : 'Nenhum cartão' + (q ? ' sobre "' + esc(termo) + '"' : '') + '.'); return; }
    ctxSet_({ tipo: 'cards', fila: due.map(function (c) { return c.id; }), pos: 0, opcoes: ['errei', 'dificil', 'bom', 'facil'] });
    sendCard_(up, due[0], 1, due.length);
  }
  function sendCard_(up, c, i, n) {
    reply_(up, '<b>Cartão ' + i + '/' + n + '</b> · ' + esc(c.baralho) + '\n\n' + esc(c.frente) + '\n\nResposta: <tg-spoiler>' + esc(c.verso || '(sem verso)') + '</tg-spoiler>\n\nComo foi? 1 errei · 2 difícil · 3 bom · 4 fácil (ou "cancelar")');
  }
  function gradeCard_(up, ctx, n) {
    var id = ctx.fila[ctx.pos], nota = ['errei', 'dificil', 'bom', 'facil'][n - 1];
    if (!nota) { reply_(up, 'Responda 1, 2, 3 ou 4.'); return; }
    Studies.routes()['est.cardAnswer']({ card_id: id, nota: nota, op_key: 'tg:' + up.update_id });
    var pos = ctx.pos + 1;
    if (pos >= ctx.fila.length) { ctxSet_(null); reply_(up, 'Sessão curta concluída: ' + ctx.fila.length + ' cartão(ões) registrados. Bom trabalho!'); return; }
    ctxSet_(Object.assign({}, ctx, { pos: pos }));
    var c = T('est_flashcards').get(ctx.fila[pos]);
    if (c) sendCard_(up, c, pos + 1, ctx.fila.length);
  }

  function questions_(up, termo) {
    var q = Utils.norm(termo || ''), ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a.titulo; });
    var feitas = {}; T('est_tentativas').list().forEach(function (t) { feitas[t.questao_id] = (feitas[t.questao_id] || 0) + 1; });
    var qs = T('est_questoes').list().filter(function (x) { return (x.tipo === 'multipla' || x.tipo === 'certo_errado') && (!q || Utils.norm([x.enunciado, x.banca, x.tags, ass[x.assunto_id] || ''].join(' ')).indexOf(q) >= 0); })
      .sort(function (a, b) { return (feitas[a.id] || 0) - (feitas[b.id] || 0); });
    if (!qs.length) { reply_(up, 'Nenhuma questão' + (q ? ' sobre "' + esc(termo) + '"' : '') + ' no seu banco.'); return; }
    var ids = qs.slice(0, 5).map(function (x) { return x.id; });
    startQuiz_(ids, function (t) { reply_(up, t); });
  }
  /** Texto de uma questão para o Telegram. */
  function qText_(x, pos, total) {
    // limite do Telegram: 4.096 caracteres por mensagem (o texto de apoio é cortado com aviso; completo no app)
    var alts = x.tipo === 'certo_errado' ? '<b>C)</b> Certo\n<b>E)</b> Errado' : (x.alternativas_json || []).map(function (a) { return '<b>' + esc(a.letra) + ')</b> ' + esc(String(a.texto).slice(0, 600)); }).join('\n');
    var resto = 3700 - alts.length, enun = String(x.enunciado || ''), tb = String(x.texto_base || '');
    var enunMax = Math.max(400, Math.min(enun.length, tb ? Math.floor(resto * 0.45) : resto)), tbMax = Math.max(0, resto - Math.min(enun.length, enunMax) - 80);
    var tbTxt = tb ? '<i>Texto de apoio:</i>\n' + esc(tb.length > tbMax ? tb.slice(0, tbMax) + '… (texto completo no Prumo)' : tb) + '\n\n' : '';
    return '<b>Questão ' + esc(x.codigo || '') + '</b>' + (total > 1 ? ' (' + pos + '/' + total + ')' : '') + (x.banca ? ' · ' + esc(x.banca) : '') + (x.ano ? ' ' + x.ano : '') + (x.gerada_ia ? ' · <i>gerada por IA (gabarito sugerido)</i>' : '') + (x.imagem_arquivo_id ? ' · <i>tem imagem (veja no app)</i>' : '') + '\n\n' + tbTxt + esc(enun.length > enunMax ? enun.slice(0, enunMax) + '…' : enun) + '\n\n' + alts +
      '\n\nResponda com a letra' + (x.tipo === 'certo_errado' ? ' (C ou E)' : '') + ' para registrar a tentativa. Para parar: "cancelar".';
  }
  /** Começa uma série de questões no chat: a próxima vem depois de cada resposta. */
  function startQuiz_(ids, send) {
    ids = ids.filter(function (id) { var q = T('est_questoes').get(id); return q && !q.deleted_at && (q.tipo === 'multipla' || q.tipo === 'certo_errado'); });
    if (!ids.length) { send('Nenhuma questão de múltipla escolha ou certo/errado para treinar.'); return 0; }
    var x = T('est_questoes').get(ids[0]);
    ctxSet_({ tipo: 'questao', questao_id: x.id, enviada_em: Utils.nowIso(), opcoes: [], fila: ids.slice(1), serie: { total: ids.length, pos: 1, certas: 0, erradas: 0 } });
    send(qText_(x, 1, ids.length));
    return ids.length;
  }
  function answerQ_(up, ctx, t) {
    ctxSet_(null);
    var low = Utils.norm(t), resp = low === 'certo' ? 'C' : low === 'errado' ? 'E' : t.toUpperCase();
    var r = Studies.routes()['est.answer']({ questao_id: ctx.questao_id, resposta: resp, modo: 'telegram', op_key: 'tg:' + up.update_id, tempo_s: Math.round((Date.now() - new Date(ctx.enviada_em)) / 1000) });
    var res = r.tentativa.resultado, M = { certa: 'Certa!', errada: 'Errada.', branco: 'Em branco.', anulada: 'Questão anulada.', sem_gabarito: 'Registrei a resposta, mas a questão não tem gabarito cadastrado.' };
    var serie = ctx.serie || { total: 1, pos: 1, certas: 0, erradas: 0 };
    if (res === 'certa') serie.certas++; else if (res === 'errada') serie.erradas++;
    var fim = '<b>' + M[res] + '</b>' + (r.gabarito && res !== 'sem_gabarito' ? ' Gabarito: ' + esc(r.gabarito) + (r.gabarito_status === 'preliminar' ? ' (preliminar)' : '') : '') + (r.explicacao ? '\n\n' + esc(String(r.explicacao).slice(0, 1500)) : '');
    var fila = (ctx.fila || []).filter(function (id) { var q = T('est_questoes').get(id); return q && !q.deleted_at; });
    if (fila.length) {
      var nx = T('est_questoes').get(fila[0]);
      serie.pos++;
      ctxSet_({ tipo: 'questao', questao_id: nx.id, enviada_em: Utils.nowIso(), opcoes: [], fila: fila.slice(1), serie: serie });
      reply_(up, fim + '\n\n— — —\n' + qText_(nx, serie.pos, serie.total));
      return;
    }
    reply_(up, fim + '\n\nTentativa registrada.' + (serie.total > 1 ? '\n<b>Série concluída:</b> ' + serie.certas + ' certa(s) e ' + serie.erradas + ' errada(s) de ' + serie.total + '.' : '') + ' Outra série: /questoes tema ou /gerar_questoes tema.');
  }

  /** Fontes ligadas a um tema: anotações e materiais (com texto) cujo título/conteúdo cita o tema. */
  function fontesTema_(tema) {
    var q = Utils.norm(tema || ''), palavras = q.split(/\s+/).filter(function (w) { return w.length > 3; });
    if (!palavras.length) return {};
    var hit = function (s) { var n = Utils.norm(s || ''); return palavras.every(function (w) { return n.indexOf(w) >= 0; }); };
    var notas = T('est_anotacoes').list().filter(function (n) { return hit(n.titulo + ' ' + String(n.conteudo || '').slice(0, 4000)); }).slice(0, 6).map(function (n) { return n.id; });
    var mats = T('est_materiais').list().filter(function (m) { return m.tipo === 'pdf' && m.texto_json_id && hit(m.titulo + ' ' + (m.tags || '')); }).slice(0, 2).map(function (m) { return { id: m.id }; });
    var out = {}; if (notas.length) out.notas = notas; if (mats.length) out.materiais = mats;
    return out;
  }

  // ================= recebimento de arquivos =================
  function receive_(up, m) {
    var doc = m.document, foto = m.photo && m.photo.length ? m.photo[m.photo.length - 1] : null;
    var fileId = doc ? doc.file_id : foto.file_id, uniq = doc ? doc.file_unique_id : foto.file_unique_id, size = Number((doc || foto).file_size || 0);
    var nome = doc ? (doc.file_name || 'arquivo') : 'foto_' + Utils.fmt(new Date(), 'yyyyMMdd_HHmm') + '.jpg', mime = doc ? String(doc.mime_type || '').toLowerCase() : 'image/jpeg';
    if (CONFIG.EST.MIME.indexOf(mime) < 0) { reply_(up, 'Não guardei "' + esc(nome) + '": a biblioteca aceita PDF, planilha (XLSX/CSV), imagem e texto.'); return; }
    if (size > CONFIG.EST.TG_GET_MAX) { reply_(up, 'O Telegram só deixa bots baixarem arquivos de até 20 MB. Envie "' + esc(nome) + '" pelo app (Estudos › Biblioteca), que aceita até 50 MB.'); return; }
    var dupU = T('est_materiais').list().filter(function (x) { return uniq && x.tg_file_hash === 'in:' + uniq; })[0];
    if (dupU) { reply_(up, 'Esse arquivo já está na biblioteca como ' + esc(dupU.codigo) + '.'); return; }
    enqueue_(up, 'receber_arquivo', { file_id: fileId, file_unique_id: uniq, nome: nome, mime: mime, tamanho: size, legenda: String(m.caption || '').slice(0, 200) });
  }

  // ================= fila de pedidos =================
  function nextCode_() {
    var max = 0; T('est_jobs').list({ withDeleted: true }).forEach(function (j) { var mm = String(j.codigo || '').match(/^J(\d+)$/); if (mm) max = Math.max(max, Number(mm[1])); });
    return 'J' + (max + 1);
  }
  function pedidosHoje_() { var h = Utils.today(); return T('est_jobs').list().filter(function (j) { return String(j.created_at).slice(0, 10) === h && j.status !== 'cancelado'; }).length; }

  /** Registra o pedido (antes de processar) e tenta processar na hora. Dedupe pela chave. */
  function enqueue_(up, tipo, params, origem) {
    var chave = up ? 'tg:' + up.update_id + ':' + tipo : (params.chave || null);
    if (chave) { var ex = T('est_jobs').list().filter(function (j) { return j.chave === chave; })[0]; if (ex) return ex; }
    if (pedidosHoje_() >= Number(Auth.setting('est.tg_pedidos_dia', PEDIDOS_DIA))) {
      if (up) reply_(up, 'Limite de ' + PEDIDOS_DIA + ' pedidos por dia atingido. Tente amanhã.');
      throw Utils.error('VALIDATION', 'Limite diário de pedidos ao Telegram atingido.');
    }
    var job = T('est_jobs').insert({ codigo: nextCode_(), tipo: tipo, status: 'na_fila', origem: origem || (up ? 'telegram' : 'app'), params_json: params, chave: chave, tentativas: 0, proxima: Utils.nowIso() }, { silent: true });
    var r = process_(job.id);
    if (up && r && (r.status === 'na_fila' || (r.status === 'falhou' && r.proxima))) reply_(up, 'Pedido ' + job.codigo + ' na fila: ' + (r.erro || 'vou tentar de novo em alguns minutos.') + ' Acompanhe com /status ' + job.codigo + '.');
    return T('est_jobs').get(job.id);
  }

  /** Rota do app: "Enviar para meu Telegram". O destino é o chat vinculado no servidor. */
  function tgSend(p) {
    var u = X().user_();
    if (!u.chatId) throw Utils.error('VALIDATION', 'Conecte o seu Telegram em Configurações › Telegram.');
    if (!X().cfg_().token || !X().cfg_().ativo) throw Utils.error('VALIDATION', 'O bot do Telegram não está ativo.');
    var tipos = { material: 'enviar_material', exportacao: 'enviar_exportacao', nota: 'enviar_nota', relatorio: 'enviar_relatorio', erros: 'enviar_erros', texto: 'enviar_texto', quiz: 'enviar_quiz', arquivo: 'enviar_arquivo' };
    var tipo = tipos[p.tipo];
    if (!tipo) throw Utils.error('VALIDATION', 'Tipo de envio inválido.');
    var params = {};
    if (p.tipo === 'material') { Studies.own('est_materiais', p.id, 'Material'); params = { material_id: p.id, variante: p.variante === 'anotado' ? 'anotado' : 'original', revisao: p.revisao != null ? Number(p.revisao) : null }; }
    else if (p.tipo === 'exportacao') { Studies.own('est_exportacoes', p.id, 'Exportação'); params = { exportacao_id: p.id }; }
    else if (p.tipo === 'nota') { Studies.own('est_anotacoes', p.id, 'Anotação'); params = { nota_id: p.id, formato: p.formato || 'texto' }; }
    else if (p.tipo === 'relatorio') params = { de: p.de, ate: p.ate, concurso_id: p.concurso_id || null, disciplina_id: p.disciplina_id || null, titulo: p.titulo || 'Relatório de estudos', formato: p.formato === 'texto' ? 'texto' : 'pdf' };
    else if (p.tipo === 'erros') params = { termo: p.termo || '' };
    else if (p.tipo === 'arquivo') { var af = T('arquivos').get(p.id); if (!af || af.deleted_at) throw Utils.error('NOT_FOUND', 'Arquivo não encontrado.'); params = { arquivo_id: af.id, legenda: String(p.legenda || af.nome).slice(0, 300) }; }
    else if (p.tipo === 'quiz') { var qids = (p.ids || []).slice(0, 30); qids.forEach(function (id) { Studies.own('est_questoes', id, 'Questão'); }); if (!qids.length) throw Utils.error('VALIDATION', 'Escolha as questões.'); params = { ids: qids }; }
    else params = { texto: String(p.texto || '').slice(0, 12000), titulo: p.titulo || '' };
    params.chave = 'app:' + (p.op_key || Utilities.getUuid());
    var job = enqueue_(null, tipo, params, 'app');
    return { job: job };
  }

  function cancel_(id, codigo) {
    var j = T('est_jobs').list().filter(function (x) { return (id && x.id === id) || (codigo && x.codigo === codigo); })[0];
    if (!j) return { ok: false, mensagem: 'Pedido não encontrado.' };
    if (['na_fila', 'falhou', 'pronto'].indexOf(j.status) < 0) return { ok: false, job: j, mensagem: 'O pedido ' + j.codigo + ' não pode mais ser cancelado (' + j.status.replace('_', ' ') + ').' };
    var out = T('est_jobs').update(j.id, { status: 'cancelado' });
    return { ok: true, job: out, mensagem: 'Pedido ' + j.codigo + ' cancelado.' };
  }

  /** Há jobs para processar (qualquer pessoa)? Leitura barata da aba. */
  function anyPending_() {
    var sh = Db.ss().getSheetByName('est_jobs');
    if (!sh || sh.getLastRow() < 2) return false;
    var v = sh.getDataRange().getValues(), h = v[0].map(String), is = h.indexOf('status'), id = h.indexOf('deleted_at');
    for (var i = 1; i < v.length; i++) if (!v[i][id] && ['na_fila', 'falhou', 'processando', 'enviando'].indexOf(String(v[i][is])) >= 0) return true;
    return false;
  }

  /** Processa a fila da pessoa atual (gatilho de 5 min). */
  function processJobs() {
    var t0 = Date.now(), now = new Date(), n = 0;
    T('est_jobs').list().filter(function (j) { return ['na_fila', 'falhou', 'processando', 'enviando'].indexOf(j.status) >= 0; }).forEach(function (j) {
      if (Date.now() - t0 > 120000) return;
      if (j.status === 'processando' || j.status === 'enviando') {
        // preso há mais de 10 min: processando volta à fila; enviando vira entrega incerta (pode ter chegado)
        if (now - new Date(j.updated_at) > 10 * 60000) T('est_jobs').update(j.id, j.status === 'enviando' ? { status: 'entrega_incerta', erro: 'A execução parou durante o envio. Confira o chat antes de pedir de novo.' } : { status: 'na_fila' }, { silent: true });
        return;
      }
      if (j.status === 'falhou' && (!j.proxima || Number(j.tentativas) >= 3)) return;   // falha definitiva: só um novo pedido
      if (j.proxima && new Date(j.proxima) > now) return;
      process_(j.id); n++;
    });
    return n;
  }

  /** Reivindica o job com trava curta e processa sem trava (upload/geração podem demorar). */
  function process_(jobId) {
    var lock = LockService.getScriptLock(), job;
    if (!lock.tryLock(10000)) return { status: 'na_fila', erro: 'Servidor ocupado.' };
    try {
      Db.resetMemo();
      job = T('est_jobs').get(jobId);
      if (!job || ['na_fila', 'falhou'].indexOf(job.status) < 0) return job;
      if (job.status === 'falhou' && Number(job.tentativas) >= 3) return job;
      job = T('est_jobs').update(job.id, { status: 'processando', tentativas: Number(job.tentativas || 0) + 1 }, { silent: true });
    } finally { try { lock.releaseLock(); } catch (e) { /* ok */ } }
    try {
      var r = run_(job);
      return T('est_jobs').update(job.id, Object.assign({ status: 'enviado', erro: null }, r || {}), { silent: true });
    } catch (e) {
      var msg = X().scrub_(e.message || String(e)).slice(0, 480), incerto = e.incerto === true, retry = e.retry === true && Number(job.tentativas) < 3;
      AppLog.warn('estudos', 'job_' + job.tipo, job.codigo + ': ' + msg);
      var patch = incerto ? { status: 'entrega_incerta', erro: msg } : retry ? { status: 'falhou', erro: msg, proxima: new Date(Date.now() + (e.retryAfter || 300) * 1000).toISOString() } : { status: 'falhou', erro: msg, proxima: null, tentativas: 3 };
      var out = T('est_jobs').update(job.id, patch, { silent: true });
      if (!retry && !incerto && job.origem === 'telegram') { try { X().enviar_('Pedido ' + job.codigo + ' não foi concluído: ' + esc(msg), 'jobfail:' + job.id, 'resposta', []); } catch (x) { /* sem envio */ } }
      return out;
    }
  }

  function fail_(msg, opts) { var e = new Error(msg); Object.assign(e, opts || {}); return e; }

  /** Envia um arquivo do Drive como anexo (ou reaproveita o file_id do mesmo bot e mesmo conteúdo). */
  function sendFile_(arq, caption, reuse) {
    var c = X().cfg_(), u = X().user_();
    if (!c.token || !c.ativo) throw fail_('O bot do Telegram está desligado.');
    if (!u.chatId) throw fail_('Telegram não conectado.');
    if (Number(arq.tamanho_bytes) > CONFIG.EST.TG_SEND_MAX) throw fail_('O arquivo tem ' + Math.round(arq.tamanho_bytes / 1048576) + ' MB e o Telegram aceita até 50 MB por bot. Abra no app: Estudos › Biblioteca.');
    var marca = c.bot + ':' + arq.hash, resp, json, viaId = false;
    try {
      if (reuse && reuse.tg_file_id && reuse.tg_file_hash === marca) {
        viaId = true;
        resp = UrlFetchApp.fetch(X().API + c.token + '/sendDocument', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: u.chatId, document: reuse.tg_file_id, caption: caption, parse_mode: 'HTML' }), muteHttpExceptions: true });
      } else {
        var blob = DriveApp.getFileById(arq.drive_id).getBlob().setName(arq.nome);
        resp = UrlFetchApp.fetch(X().API + c.token + '/sendDocument', { method: 'post', payload: { chat_id: String(u.chatId), caption: caption, parse_mode: 'HTML', document: blob }, muteHttpExceptions: true });
      }
    } catch (e) { throw fail_('A conexão caiu durante o envio do arquivo. Pode ter chegado: confira o chat antes de pedir de novo.', { incerto: true }); }
    json = Utils.parseJson(resp.getContentText(), {});
    if (!json.ok) {
      var code = json.error_code || resp.getResponseCode();
      if (viaId && code === 400) return sendFile_(arq, caption, null);   // file_id não vale mais: manda o arquivo
      if (code === 429) throw fail_('Limite de velocidade do Telegram.', { retry: true, retryAfter: (json.parameters && json.parameters.retry_after) || 60 });
      if (code === 403) { X().saveVals_({ 'tg.ativo': false }); throw fail_('O bot foi bloqueado no Telegram. Desbloqueie e conecte de novo.'); }
      if (code === 401) throw fail_('Token do bot inválido.');
      if (code >= 500) throw fail_('Telegram indisponível agora.', { retry: true });
      throw fail_('O Telegram recusou o arquivo: ' + (json.description || code));
    }
    var doc = json.result && json.result.document;
    X().tabela_().insert({ direcao: 'saida', status: 'enviado', origem: 'estudos', chave: 'doc:' + arq.id + ':' + Utilities.getUuid().slice(0, 8), chat_id: u.chatId, corpo: '[arquivo] ' + arq.nome, msg_id: String(json.result && json.result.message_id || '') }, { silent: true });
    return { file_id: doc ? doc.file_id : null, marca: marca };
  }

  function sendText_(texto, chave) {
    var parts = splitHtml_(texto, 3800), ok = 0;
    parts.forEach(function (t, i) {
      var r = X().enviar_(t + (parts.length > 1 ? '\n<i>(' + (i + 1) + '/' + parts.length + ')</i>' : ''), chave + ':' + i, 'resposta', []);
      if (r.status === 'enviado' || r.status === 'duplicado') ok++;
      else if (r.status === 'falhou' && r.erro && r.erro.codigo === 'rede') throw fail_('A conexão caiu durante o envio.', { incerto: ok > 0, retry: ok === 0 });
      else if (r.status !== 'enviado') throw fail_((r.erro && r.erro.mensagem) || 'Envio recusado.', { retry: r.erro && r.erro.codigo === '429' });
    });
    return ok;
  }

  /** Executa o job (já reivindicado). Lança erro com retry/incerto para a fila decidir. */
  function run_(job) {
    var p = job.params_json || {}, upd = function (patch) { T('est_jobs').update(job.id, patch, { silent: true }); };
    switch (job.tipo) {
      case 'enviar_material': {
        var mat = T('est_materiais').get(p.material_id);
        if (!mat || mat.deleted_at) throw fail_('Material não encontrado (pode ter ido para a lixeira).');
        var arq = mat.arquivo_id ? T('arquivos').get(mat.arquivo_id) : null;
        if (!arq) throw fail_('Este material não tem arquivo.');
        if (p.variante === 'anotado') {
          var info = StudyFiles.latestExport(mat);
          var querRev = p.revisao != null ? Number(p.revisao) : info.revisao_atual;
          if (!info.exportacao || Number(info.exportacao.revisao) !== querRev) {
            // nunca manda uma cópia antiga como se fosse a atual
            var txt = esc(mat.codigo) + ' · ' + esc(mat.titulo) + ': ' + (info.exportacao
              ? 'a cópia anotada mais recente é da revisão ' + info.exportacao.revisao + ' (' + Utils.fmt(new Date(info.exportacao.created_at), 'dd/MM HH:mm') + '), mas as anotações estão na revisão ' + info.revisao_atual + '.'
              : 'as anotações (revisão ' + info.revisao_atual + ') ainda não foram exportadas.') + '\nA cópia anotada é gerada no app: abra o material e toque em "Disponibilizar no Telegram" (ou saia da sala de estudo, que exporta sozinho).';
            if (job.origem === 'telegram') {
              if (info.exportacao) { ctxSet_({ tipo: 'variante_antiga', material_id: mat.id, exportacao_id: info.exportacao.id, opcoes: ['antiga', 'original'] }); txt += '\n\nResponda 1 para receber a cópia antiga (revisão ' + info.exportacao.revisao + ') ou 2 para o original.'; }
              else { ctxSet_({ tipo: 'variante', material_id: mat.id, opcoes: ['original', 'anotado'] }); txt += '\n\nResponda 1 para receber o original.'; }
              sendText_(txt, 'job:' + job.id);
              return { status: 'enviado', resultado_json: { aviso: 'copia_desatualizada', revisao_atual: info.revisao_atual } };
            }
            throw fail_('A cópia anotada da revisão ' + querRev + ' ainda não foi exportada. Toque em "Disponibilizar no Telegram" no leitor.');
          }
          var ex = info.exportacao, earq = T('arquivos').get(ex.arquivo_id);
          if (!earq) throw fail_('O arquivo exportado não existe mais. Exporte de novo no app.');
          upd({ status: 'enviando', arquivo_id: earq.id, revisao: ex.revisao });
          var r1 = sendFile_(earq, '<b>' + esc(mat.codigo) + '</b> · ' + esc(mat.titulo) + '\nCópia anotada · revisão ' + ex.revisao + ' (atual) · exportada em ' + Utils.fmt(new Date(ex.created_at), 'dd/MM HH:mm'), ex);
          if (r1.file_id) T('est_exportacoes').update(ex.id, { tg_file_id: r1.file_id }, { silent: true });
          return { resultado_json: { variante: 'anotado', revisao: ex.revisao } };
        }
        upd({ status: 'enviando', arquivo_id: arq.id });
        var reuse = { tg_file_id: mat.tg_file_id, tg_file_hash: mat.tg_file_hash };
        var r0 = sendFile_(arq, '<b>' + esc(mat.codigo) + '</b> · ' + esc(mat.titulo) + (mat.versao > 1 ? ' (v' + mat.versao + ')' : '') + '\nOriginal', reuse);
        if (r0.file_id) T('est_materiais').update(mat.id, { tg_file_id: r0.file_id, tg_file_hash: r0.marca }, { silent: true });
        return { resultado_json: { variante: 'original' } };
      }
      case 'enviar_exportacao': {
        var e = T('est_exportacoes').get(p.exportacao_id);
        if (!e) throw fail_('Exportação não encontrada.');
        var a = T('arquivos').get(e.arquivo_id); if (!a) throw fail_('Arquivo exportado não encontrado.');
        var m2 = e.material_id ? T('est_materiais').get(e.material_id) : null, atual = m2 ? StudyFiles.latestExport(m2).revisao_atual : null;
        upd({ status: 'enviando', arquivo_id: a.id, revisao: e.revisao });
        var cap = esc(a.nome) + (e.tipo === 'anotado' ? '\nCópia anotada · revisão ' + e.revisao + (atual != null && Number(e.revisao) !== atual ? ' — <b>ANTIGA</b>: as anotações atuais estão na revisão ' + atual : ' (atual)') : '') + '\nExportada em ' + Utils.fmt(new Date(e.created_at), 'dd/MM/yyyy HH:mm');
        var r2 = sendFile_(a, cap, e);
        if (r2.file_id) T('est_exportacoes').update(e.id, { tg_file_id: r2.file_id }, { silent: true });
        return { resultado_json: { revisao: e.revisao, antiga: atual != null && Number(e.revisao) !== atual } };
      }
      case 'enviar_nota': {
        var n = T('est_anotacoes').get(p.nota_id);
        if (!n || n.deleted_at) throw fail_('Anotação não encontrada.');
        var head = '<b>' + esc(n.titulo) + '</b>\n<i>' + (n.gerado_ia ? 'Gerado por IA' + (n.aprovado === false ? ' — rascunho ainda não aprovado' : ' — aprovado por você') : 'Sua anotação salva') + ' · versão ' + (n.versao || 1) + ' · ' + Utils.fmt(new Date(n.updated_at), 'dd/MM/yyyy') + '</i>\n\n';
        var body = esc(String(n.conteudo || '(vazia)'));
        if (p.formato === 'pdf' || (head + body).length > 3800 * 3) {
          var arqN = noteToPdf_(n);
          upd({ status: 'enviando', arquivo_id: arqN.id });
          sendFile_(arqN, esc(n.titulo) + (n.gerado_ia ? ' · gerado por IA' : ' · sua anotação'), null);
        } else { upd({ status: 'enviando' }); sendText_(head + body, 'job:' + job.id); }
        return {};
      }
      case 'enviar_relatorio': {
        var st = StudyReports.stats({ de: p.de, ate: p.ate, concurso_id: p.concurso_id || null, disciplina_id: p.disciplina_id || null });
        if (p.formato === 'texto') { upd({ status: 'enviando' }); sendText_(StudyReports.telegramText(st, p.titulo), 'job:' + job.id); return {}; }
        var ra = StudyReports.buildPdf(st, p.titulo || 'Relatório de estudos');
        upd({ status: 'enviando', arquivo_id: ra.id });
        sendFile_(ra, '<b>' + esc(p.titulo || 'Relatório de estudos') + '</b>\n' + Utils.brDate(st.periodo.de) + ' a ' + Utils.brDate(st.periodo.ate), null);
        return {};
      }
      case 'enviar_arquivo': {
        var ax = T('arquivos').get(p.arquivo_id); if (!ax || ax.deleted_at) throw fail_('Arquivo não encontrado.');
        upd({ status: 'enviando', arquivo_id: ax.id });
        sendFile_(ax, '<b>' + esc(p.legenda || ax.nome) + '</b>\nGerado no Prumo em ' + Utils.fmt(new Date(ax.created_at), 'dd/MM/yyyy HH:mm'), null);
        return {};
      }
      case 'enviar_erros': upd({ status: 'enviando' }); sendText_(errorsText_(p.termo), 'job:' + job.id); return {};
      case 'enviar_texto': upd({ status: 'enviando' }); sendText_((p.titulo ? '<b>' + esc(p.titulo) + '</b>\n' : '') + esc(p.texto), 'job:' + job.id); return {};
      case 'gerar_resumo': {
        var mt = T('est_materiais').get(p.material_id);
        if (!mt) throw fail_('Material não encontrado.');
        if (StudyAI.status().configurado) {
          var out = StudyAI.run({ acao: 'resumir', material_id: mt.id, paginas: p.paginas });
          upd({ status: 'enviando' });
          sendText_('<b>' + esc(out.nota.titulo) + '</b>\n<i>Gerado por IA a partir de ' + esc(out.fonte.material) + ', p. ' + esc(out.fonte.paginas) + '. Rascunho salvo em Resumos para você revisar e aprovar.</i>\n\n' + esc(out.nota.conteudo), 'job:' + job.id);
          return { resultado_json: { nota_id: out.nota.id, ia: true } };
        }
        // sem IA: compila o que você já marcou e anotou (identificado como compilação)
        var comp = compile_(mt, p.paginas);
        upd({ status: 'enviando' });
        sendText_(comp, 'job:' + job.id);
        return { resultado_json: { ia: false } };
      }
      case 'ia_chat': {
        var fontesC = Object.assign({ desempenho: { dias: 30 } }, ctxConc_().concurso_id ? { edital: ctxConc_().concurso_id } : {}, fontesTema_(p.pergunta));
        var rc = StudyAI.run({ acao: 'chat', mensagens: [{ papel: 'user', texto: p.pergunta }], fontes: fontesC });
        upd({ status: 'enviando' });
        sendText_('<b>Assistente</b> <i>(' + esc(rc.ia ? rc.ia.modelo : 'IA') + ')</i>\n\n' + esc(rc.texto) + (rc.refs.length ? '\n\n<i>Fontes: ' + esc(rc.refs.join('; ').slice(0, 600)) + '</i>' : ''), 'job:' + job.id);
        return { resultado_json: { ia: true } };
      }
      case 'ia_resumo': {
        if (p.material_id) {
          var rf = StudyAI.resumoFila_(job);
          if (!rf.pronto) return { status: 'na_fila', resultado_json: rf.resultado, tentativas: 0 };
          if (job.origem !== 'telegram') return { status: 'pronto', resultado_json: rf.resultado };
          upd({ status: 'enviando', resultado_json: rf.resultado });
          sendText_('<b>' + esc(rf.nota.titulo) + '</b>\n<i>Rascunho salvo em Resumos para você revisar e aprovar.</i>\n\n' + esc(String(rf.nota.conteudo).slice(0, 3500)), 'job:' + job.id);
          return { resultado_json: rf.resultado };
        }
        var nprev = job.resultado_json && job.resultado_json.nota_id ? T('est_anotacoes').get(job.resultado_json.nota_id) : null;
        if (nprev) { upd({ status: 'enviando' }); sendText_('<b>' + esc(nprev.titulo) + '</b>\n\n' + esc(nprev.conteudo), 'job:' + job.id); return { resultado_json: { nota_id: nprev.id, ia: true } }; }
        var fr = fontesTema_(p.tema);
        var rr = StudyAI.run({ acao: 'gerar', tipo: 'resumo', tema: p.tema, fontes: fr });
        var nota = T('est_anotacoes').insert({ titulo: 'Resumo (IA) — ' + String(p.tema).slice(0, 150), tipo: 'resumo', conteudo: rr.texto + '\n\n— Gerado por IA (' + (rr.ia ? rr.ia.modelo : '') + ')' + (rr.refs.length ? ' com: ' + rr.refs.join('; ') : ' sem fontes anexadas (conhecimento do modelo)') + '. Confira antes de usar.', gerado_ia: true, aprovado: false });
        upd({ status: 'enviando', resultado_json: { nota_id: nota.id, ia: true } });
        sendText_('<b>' + esc(nota.titulo) + '</b>\n<i>Rascunho salvo em Resumos para você revisar.' + (rr.refs.length ? '' : ' Sem anotações ou materiais sobre o tema: baseado no conhecimento do modelo.') + '</i>\n\n' + esc(rr.texto), 'job:' + job.id);
        return { resultado_json: { nota_id: nota.id, ia: true } };
      }
      case 'ia_questoes': {
        var prev = job.resultado_json && job.resultado_json.questoes, ids, rq = { refs: [] };
        if (prev && prev.length) ids = prev;   // nova tentativa de envio: não gera de novo
        else {
          var fq = fontesTema_(p.tema), conc = ctxConc_().concurso_id || null;
          rq = StudyAI.run({ acao: 'gerar', tipo: 'questoes', tema: p.tema, n: p.n || 5, fontes: fq });
          var add = Studies.routes()['est.questionsAdd']({ questoes: rq.questoes, concurso_id: conc, fonte: 'IA (' + (rq.ia ? rq.ia.modelo : '') + ') · ' + p.tema });
          ids = add.questoes.map(function (q) { return q.id; });
          upd({ resultado_json: { questoes: ids, ia: true } });
        }
        upd({ status: 'enviando' });
        var envio = [];
        startQuiz_(ids, function (t) { envio.push(t); });
        sendText_('<b>' + ids.length + ' questão(ões) sobre "' + esc(p.tema) + '"</b> criadas pela IA e guardadas no banco (marcadas "a revisar"; gabarito sugerido pela IA).' + (rq.refs.length ? '' : ' <i>Sem materiais sobre o tema: baseadas no conhecimento do modelo.</i>') + '\n\n' + envio.join('\n'), 'job:' + job.id);
        return { resultado_json: { questoes: ids, ia: true } };
      }
      case 'enviar_quiz': {
        upd({ status: 'enviando' });
        var env = [];
        var nq2 = startQuiz_(p.ids || [], function (t) { env.push(t); });
        sendText_(env.join('\n'), 'job:' + job.id);
        return { resultado_json: { questoes: nq2 } };
      }
      case 'receber_arquivo': {
        var c = X().cfg_(), gf = UrlFetchApp.fetch(X().API + c.token + '/getFile', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ file_id: p.file_id }), muteHttpExceptions: true });
        var gj = Utils.parseJson(gf.getContentText(), {});
        if (!gj.ok || !gj.result || !gj.result.file_path) throw fail_('O Telegram não liberou o arquivo (' + (gj.description || gf.getResponseCode()) + ').', { retry: (gj.error_code || 0) >= 500 });
        var dl = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + c.token + '/' + gj.result.file_path, { muteHttpExceptions: true });
        if (dl.getResponseCode() !== 200) throw fail_('Falha ao baixar do Telegram (HTTP ' + dl.getResponseCode() + ').', { retry: true });
        var bytes = dl.getContent(), hash = Utils.sha256Bytes(bytes);
        var dup = T('arquivos').list().filter(function (x) { return x.hash === hash && x.modulo === 'estudos'; })[0];
        var matD = dup ? T('est_materiais').list().filter(function (x) { return x.arquivo_id === dup.id; })[0] : null;
        if (matD) { sendText_('Esse arquivo já está na biblioteca como ' + esc(matD.codigo) + ' · ' + esc(matD.titulo) + '.', 'job:' + job.id); return { resultado_json: { duplicado: matD.id } }; }
        var file = StudyFiles.folder_('originais').createFile(Utilities.newBlob(bytes, p.mime, p.nome));
        var arqR = dup || T('arquivos').insert({ drive_id: file.getId(), nome: p.nome, mime: p.mime, tamanho_bytes: bytes.length, modulo: 'estudos', entidade: 'est_materiais', tipo: 'outro', hash: hash });
        var tipoM = /pdf/.test(p.mime) ? 'pdf' : /sheet|excel|csv/.test(p.mime) ? 'xlsx' : /^image\//.test(p.mime) ? 'imagem' : 'outro';
        var titulo = (p.legenda || p.nome.replace(/\.[^.]+$/, '')).slice(0, 200);
        var matN = Studies.routes()['est.materialSave']({ titulo: titulo, tipo: tipoM, arquivo_id: arqR.id, origem: 'telegram' }).material;
        T('est_materiais').update(matN.id, { tg_file_hash: 'in:' + (p.file_unique_id || '') }, { silent: true });
        var msg = 'Guardado na biblioteca: <b>' + esc(matN.codigo) + '</b> · ' + esc(titulo) + (tipoM === 'xlsx' ? '\nA planilha foi só guardada. Para importar os dados (questões, flashcards, edital), use Estudos › Importar no app.' : '');
        ctxSet_({ tipo: 'categoria', material_id: matN.id, opcoes: CATS_ });
        msg += '\n\nQual a categoria? Responda com o número (sem resposta em 30 min, fica em Outros):\n' + CATS_.map(function (k, i) { return (i + 1) + '. ' + StudyFiles.CATEGORIAS[k]; }).join('\n');
        sendText_(msg, 'job:' + job.id);
        return { arquivo_id: arqR.id, resultado_json: { material_id: matN.id } };
      }
    }
    throw fail_('Tipo de pedido desconhecido.');
  }

  /** Sem IA: junta os trechos marcados, comentários e notas do material (deixa claro que é compilação). */
  function compile_(mat, paginas) {
    var set = paginas ? Studies.rangesToSet_(paginas) : null, out = ['<b>Compilação das suas marcações — ' + esc(mat.codigo) + ' · ' + esc(mat.titulo) + (paginas ? ', p. ' + esc(paginas) : '') + '</b>', '<i>Não é um resumo gerado: são os trechos e notas que você mesmo marcou. O assistente de IA não está configurado.</i>'];
    var row = StudyFiles.annRow_(mat.id, mat.arquivo_id), n = 0;
    if (row && row.json_drive_id) {
      var doc = StudyFiles.readDoc_(row, mat, mat.arquivo_id);
      Object.keys(doc.paginas || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (pg) {
        if (set && !set[pg]) return;
        (doc.paginas[pg].itens || []).forEach(function (a) { var t = a.trecho || (a.tipo === 'texto' || a.tipo === 'comentario' ? a.texto : ''); if (t) { out.push('• (p. ' + pg + ') ' + esc(String(t).slice(0, 500))); n++; } });
      });
    }
    T('est_anotacoes').list().filter(function (x) { return x.material_id === mat.id && x.aprovado !== false && (!set || !x.pagina || set[x.pagina]); }).forEach(function (x) { out.push('\n<b>' + esc(x.titulo) + '</b>' + (x.pagina ? ' (p. ' + x.pagina + ')' : '') + '\n' + esc(String(x.conteudo || '').slice(0, 1500))); n++; });
    if (!n) out.push('\nVocê ainda não marcou trechos nem escreveu notas ' + (paginas ? 'nessas páginas' : 'neste material') + '. Para um resumo novo, o dono do app pode ativar o assistente de IA.');
    return out.join('\n');
  }

  function noteToPdf_(n) {
    var nome = (n.titulo || 'Anotação').slice(0, 80);
    var doc = DocumentApp.create(nome), id = doc.getId();
    try {
      var b = doc.getBody();
      b.appendParagraph(n.titulo || 'Anotação').setHeading(DocumentApp.ParagraphHeading.HEADING1);
      b.appendParagraph((n.gerado_ia ? 'Gerado por IA' : 'Anotação pessoal') + ' · versão ' + (n.versao || 1) + ' · ' + Utils.fmt(new Date(n.updated_at), 'dd/MM/yyyy HH:mm'));
      String(n.conteudo || '').split('\n').forEach(function (l) { b.appendParagraph(l); });
      doc.saveAndClose();
      var pdf = DriveApp.getFileById(id).getAs('application/pdf').setName(nome + '.pdf'), bytes = pdf.getBytes();
      var f = StudyFiles.folder_('exportacoes').createFile(pdf);
      var arq = T('arquivos').insert({ drive_id: f.getId(), nome: nome + '.pdf', mime: 'application/pdf', tamanho_bytes: bytes.length, modulo: 'estudos', entidade: 'est_exportacoes', tipo: 'outro', hash: Utils.sha256Bytes(bytes) });
      T('est_exportacoes').insert({ tipo: 'resumo', arquivo_id: arq.id, hash: arq.hash, tamanho_bytes: arq.tamanho_bytes, titulo: arq.nome });
      return arq;
    } finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ok */ } }
  }

  // ================= avisos automáticos de Estudos =================
  /**
   * Um aviso por dia no horário escolhido (planejamento, revisões, prazos, metas), só para quem ligou.
   * Limite próprio (não consome o limite dos pedidos). Domingo: resumo semanal (e PDF, se escolhido).
   */
  function notices() {
    if (Auth.setting('est.tg_avisos', false) !== true) return 0;
    var u = X().user_(); if (!u.chatId || !u.ativo) return 0;
    var now = new Date(), hoje = Utils.today(), hora = String(Auth.setting('est.tg_hora', '07:00')), hm = Utils.fmt(now, 'HH:mm');
    var dias = String(Auth.setting('est.tg_dias', '0,1,2,3,4,5,6')).split(','), dow = String(Utils.parseDate(hoje).getDay());
    if (dias.indexOf(dow) < 0 || hm < hora) return 0;
    var sil = String(Auth.setting('est.tg_silencio', '') || ''), sm = sil.match(/^(\d\d:\d\d)-(\d\d:\d\d)$/);
    if (sm && ((sm[1] <= sm[2] && hm >= sm[1] && hm < sm[2]) || (sm[1] > sm[2] && (hm >= sm[1] || hm < sm[2])))) return 0;
    var chave = 'estaviso:' + hoje;
    if (X().tabela_().list().some(function (m) { return m.chave === chave + ':0' && m.status === 'enviado'; })) return 0;
    var enviadosHoje = X().tabela_().list().filter(function (m) { return m.origem === 'estudos_auto' && String(m.created_at).slice(0, 10) === hoje && m.status === 'enviado'; }).length;
    if (enviadosHoje >= Number(Auth.setting('est.tg_avisos_dia', AVISOS_DIA))) return 0;
    var tipos = Auth.setting('est.tg_tipos', ['plano', 'revisoes', 'prazos', 'metas']) || [];
    var out = ['<b>Estudos · ' + Utils.brDate(hoje) + '</b>'], discs = {}; T('est_disciplinas').list().forEach(function (d) { discs[d.id] = d.nome; });
    if (tipos.indexOf('plano') >= 0) {
      // tarefas com lembrete próprio já chegam pelos avisos de Tarefas: aqui ficam só as demais
      var tk = T('tar_tarefas').list().filter(function (t) { return (t.est_tipo || t.est_disciplina_id) && t.status !== 'feito' && t.status !== 'cancelada' && t.data_vencimento === hoje && t.lembrete_min_antes == null; });
      out.push('\n<b>Plano de hoje</b>\n' + (tk.length ? tk.map(function (t) { return '• ' + esc(t.titulo) + (t.duracao_estimada_min ? ' · ' + t.duracao_estimada_min + ' min' : ''); }).join('\n') : 'Nada planejado.'));
    }
    if (tipos.indexOf('revisoes') >= 0) { var rv = T('est_revisoes').list().filter(function (r) { return r.status === 'pendente' && r.vencimento <= hoje; }); if (rv.length) out.push('\n<b>Revisões</b>: ' + rv.length + ' para hoje' + (rv.filter(function (r) { return r.vencimento < hoje; }).length ? ' (' + rv.filter(function (r) { return r.vencimento < hoje; }).length + ' atrasadas)' : '') + '.'); }
    if (tipos.indexOf('prazos') >= 0) { var et = T('est_etapas').list().filter(function (e) { return e.status === 'pendente' && e.data && e.data >= hoje && e.data <= Utils.addDays(hoje, 7); }); if (et.length) out.push('\n<b>Prazos (7 dias)</b>\n' + et.map(function (e) { return '• ' + Utils.brDate(e.data).slice(0, 5) + ' ' + esc(e.titulo) + (e.data_status !== 'confirmada' ? ' (' + (e.data_status === 'estimada' ? 'estimada' : 'a confirmar') + ')' : ''); }).join('\n')); }
    if (tipos.indexOf('metas') >= 0) { var mr = T('met_metas').list().filter(function (m) { return m.status === 'ativa' && /^est_/.test(m.origem_metrica || ''); }).map(function (m) { var v = Goals.currentValue(m); return { m: m, v: v, r: Goals.pace(m, v) }; }).filter(function (x) { return x.r === 'atencao' || x.r === 'atrasada'; }); if (mr.length) out.push('\n<b>Metas pedindo atenção</b>\n' + mr.map(function (x) { return '• ' + esc(x.m.titulo) + ': ' + String(x.v).replace('.', ',') + ' de ' + x.m.valor_alvo; }).join('\n')); }
    var semanal = Auth.setting('est.tg_resumo', 'semanal');
    if ((semanal === 'diario') || (semanal === 'semanal' && dow === '0')) out.push('\n' + StudyReports.telegramText(StudyReports.stats({ de: Utils.addDays(hoje, semanal === 'diario' ? -1 : -6), ate: hoje }), semanal === 'diario' ? 'Ontem e hoje' : 'Resumo da semana'));
    out.push('\n<i>/parar_estudos desliga estes avisos.</i>');
    var parts = splitHtml_(out.join('\n'), 3800), sent = 0;
    parts.forEach(function (t, i) { var r = X().enviar_(t, chave + ':' + i, 'resposta', []); if (r.status === 'enviado') { sent++; try { var last = X().tabela_().list().filter(function (m) { return m.chave === chave + ':' + i; })[0]; if (last) X().tabela_().update(last.id, { origem: 'estudos_auto' }, { silent: true }); } catch (e) { /* ok */ } } });
    if (dow === '0' && Auth.setting('est.tg_relatorio_pdf', false) === true) enqueue_(null, 'enviar_relatorio', { de: Utils.addDays(hoje, -6), ate: hoje, titulo: 'Relatório da semana', formato: 'pdf', chave: 'auto:relatorio:' + hoje }, 'gatilho');
    return sent;
  }

  return { routes: routes, handle: handle, processJobs: processJobs, anyPending_: anyPending_, notices: notices, enqueue_: enqueue_, splitHtml_: splitHtml_ };
})();
