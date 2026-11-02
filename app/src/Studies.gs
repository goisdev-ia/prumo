/**
 * Estudos — Concursos públicos: regras de negócio no servidor.
 *
 * Princípios:
 *  - Tudo é do usuário da sessão (Db filtra por user_id); ids relacionados são conferidos antes de gravar.
 *  - Gravações vindas do app ou do Telegram aceitam op_key (idempotência): repetir a mesma operação não duplica.
 *  - O tempo de estudo canônico é est_sessoes.liquido_s, calculado no servidor a partir de horários persistidos.
 *  - Histórico nunca é reescrito em silêncio: tentativas guardam o resultado original; recálculos ficam em resultado_atual.
 */
var Studies = (function () {
  var T = function (n) { return Db.table(n); };
  var DEF_INTERVALOS = [1, 7, 15, 30, 60, 120];

  function routes() {
    return {
      'est.boot': boot,
      'est.sessionStart': sessionStart,
      'est.sessionPause': sessionPause,
      'est.sessionResume': sessionResume,
      'est.sessionEnd': sessionEnd,
      'est.sessionManual': sessionManual,
      'est.sessionEdit': sessionEdit,
      'est.sessionCancel': sessionCancel,
      'est.fromFocus': fromFocus,
      'est.questionSave': questionSave,
      'est.questionDelete': questionDelete,
      'est.questionRestore': questionRestore,
      'est.questionComment': questionComment,
      'est.questionsAdd': questionsAdd,
      'est.questionGabarito': questionGabarito,
      'est.answer': answer,
      'est.simStart': simStart,
      'est.simSave': simSave,
      'est.simFinish': simFinish,
      'est.reviewDone': reviewDone,
      'est.reviewSchedule': reviewSchedule,
      'est.cardAnswer': cardAnswer,
      'est.noteSave': noteSave,
      'est.noteVersions': noteVersions,
      'est.entityDelete': function (p) { return entityDel_(p, true); },
      'est.entityRestore': function (p) { return entityDel_(p, false); },
      'est.discSave': discSave,
      'est.materialSave': materialSave,
      'est.readingSave': readingSave,
      'est.editalApply': editalApply,
      'est.importRows': importRows,
      'est.planSuggest': planSuggest,
      'est.planApply': planApply,
      'est.stats': function (p) { return StudyReports.stats(p); },
      'est.report': function (p) { return StudyReports.reportRoute(p); },
      'est.errorFromAttempt': errorFromAttempt,
      'est.upStart': function (p) { return StudyFiles.upStart(p); },
      'est.upChunk': function (p) { return StudyFiles.upChunk(p); },
      'est.fileChunk': function (p) { return StudyFiles.fileChunk(p); },
      'est.annGet': function (p) { return StudyFiles.annGet(p); },
      'est.annSave': function (p) { return StudyFiles.annSave(p); },
      'est.textSave': function (p) { return StudyFiles.textSave(p); },
      'est.textGet': function (p) { return StudyFiles.textGet(p); },
      'est.ocrPage': function (p) { return StudyFiles.ocrPage(p); },
      'est.exportRegister': function (p) { return StudyFiles.exportRegister(p); },
      'est.dupScan': function () { return StudyFiles.dupScan(); },
      'est.libReorg': function (p) { return StudyFiles.reorganize(p); },
      'est.materialBatch': materialBatch,
      'est.dupClean': function (p) { return StudyFiles.dupClean(p); },
      'est.dupRestore': function (p) { return StudyFiles.dupRestore(p); },
      'est.materialVersion': function (p) { return StudyFiles.newVersion(p); },
      'est.materialTrash': function (p) { return StudyFiles.trashMaterial(p); },
      'est.trashList': function () { return { materiais: T('est_materiais').list({ withDeleted: true }).filter(function (m) { return m.deleted_at; }).sort(function (a, b) { return a.deleted_at < b.deleted_at ? 1 : -1; }) }; },
      'est.exportCards': exportCards,
      'est.aiStatus': function () { return StudyAI.status(); },
      'est.aiConfig': function (p) { return StudyAI.config(p); },
      'est.aiRun': function (p) { return StudyAI.run(p); },
      'est.aiResumoStart': function (p) { return StudyAI.resumoStart(p); },
      'est.aiResumoStep': function (p) { return StudyAI.resumoStep(p); },
      'est.aiResumoCancel': function (p) { return StudyAI.resumoCancel(p); },
      'est.aiDisc': function (p) { return StudyAI.disc(p); }
    };
  }

  // ================= utilidades =================
  function own(table, id, label) {
    if (!id) return null;
    var r = T(table).get(id);
    if (!r || r.deleted_at) throw Utils.error('NOT_FOUND', (label || 'Registro') + ' não encontrado.');
    return r;
  }
  function ownOpt(table, id, label) { return id ? own(table, id, label) : null; }
  function setting(k, def) { var v = Auth.setting(k, def); return v === null || v === undefined ? def : v; }
  function intervals() {
    var v = setting('est.rev_intervalos', DEF_INTERVALOS);
    if (typeof v === 'string') v = v.split(/[,; ]+/).map(Number);
    v = (v || []).map(Number).filter(function (n) { return n > 0 && n < 3650; });
    return v.length ? v : DEF_INTERVALOS;
  }
  function byOpKey(table, key) {
    if (!key) return null;
    return T(table).list({ withDeleted: false }).filter(function (r) { return r.op_key === key; })[0] || null;
  }
  function secs(a, b) { return Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)); }
  function pauseSecs(pausas, ate) {
    return (pausas || []).reduce(function (s, p) { return s + secs(p[0], p[1] || ate); }, 0);
  }

  /** Tabelas de Estudos carregadas sob demanda (não entram no boot do app). */
  function boot() {
    Db.preload(CONFIG.EST_LAZY);
    var out = {};
    CONFIG.EST_LAZY.forEach(function (n) { out[n] = T(n).list(); });
    var since = Utils.addMonths(Utils.today(), -12);
    out.est_tentativas = out.est_tentativas.filter(function (r) { return String(r.created_at) >= since; });
    out.est_flashcard_revisoes = out.est_flashcard_revisoes.filter(function (r) { return String(r.data) >= since; });
    return { tables: out, windows: { est_tentativas: since, est_flashcard_revisoes: since }, ia: StudyAI.status() };
  }

  // ================= sessões (registro canônico de tempo) =================
  function openSession_() {
    return T('est_sessoes').list().filter(function (s) { return s.status === 'aberta' || s.status === 'pausada'; })[0] || null;
  }

  function checkRefs_(p) {
    ownOpt('est_concursos', p.concurso_id, 'Concurso');
    ownOpt('est_disciplinas', p.disciplina_id, 'Disciplina');
    ownOpt('est_assuntos', p.assunto_id, 'Assunto');
    ownOpt('est_materiais', p.material_id, 'Material');
    ownOpt('tar_tarefas', p.tarefa_id, 'Tarefa');
  }

  /**
   * Inicia a sessão. Só existe uma sessão aberta por pessoa: se já houver outra (em qualquer aparelho),
   * devolve CONFLICT com a sessão aberta, e o app pergunta se continua aquela ou encerra e começa outra.
   */
  function sessionStart(p) {
    var dup = byOpKey('est_sessoes', p.op_key);
    if (dup) return { sessao: dup, repetido: true };
    checkRefs_(p);
    var aberta = openSession_();
    if (aberta) {
      if (!p.encerrar_outra) { var e = Utils.error('CONFLICT', 'Já existe uma sessão de estudo aberta' + (aberta.aparelho ? ' (' + String(aberta.aparelho).split(' · ')[0] + ')' : '') + '.'); e.data = { sessao: aberta }; throw e; }
      sessionEnd({ id: aberta.id, motivo_auto: 'Encerrada ao iniciar outra sessão' });
    }
    var row = T('est_sessoes').insert({
      concurso_id: p.concurso_id || null, disciplina_id: p.disciplina_id || null, assunto_id: p.assunto_id || null, material_id: p.material_id || null,
      tarefa_id: p.tarefa_id || null, tipo: p.tipo || 'teoria', objetivo: p.objetivo || null, inicio: Utils.nowIso(), status: 'aberta',
      origem: p.origem || 'app', aparelho: p.aparelho || null, pagina_ini: p.pagina_ini || null, pausas_json: [], op_key: p.op_key || null
    });
    if (p.assunto_id) { var a = T('est_assuntos').get(p.assunto_id); if (a && a.teoria === 'nao_iniciada' && (p.tipo || 'teoria') === 'teoria') T('est_assuntos').update(a.id, { teoria: 'em_andamento' }, { silent: true }); }
    if (p.tarefa_id) { var tk = T('tar_tarefas').get(p.tarefa_id); if (tk && tk.status === 'a_fazer') T('tar_tarefas').update(tk.id, { status: 'fazendo' }, { silent: true }); }
    return { sessao: row };
  }

  function live_(id) {
    var s = own('est_sessoes', id, 'Sessão');
    if (s.status === 'encerrada' || s.status === 'cancelada') throw Utils.error('VALIDATION', 'Esta sessão já foi encerrada.');
    return s;
  }

  function sessionPause(p) {
    var s = live_(p.id);
    if (s.status === 'pausada') return { sessao: s };
    var pausas = (s.pausas_json || []).concat([[Utils.nowIso(), null]]);
    return { sessao: T('est_sessoes').update(s.id, { status: 'pausada', pausas_json: pausas }, { silent: true }) };
  }

  function sessionResume(p) {
    var s = live_(p.id);
    if (s.status !== 'pausada') return { sessao: s };
    var pausas = (s.pausas_json || []).slice();
    if (pausas.length && !pausas[pausas.length - 1][1]) pausas[pausas.length - 1] = [pausas[pausas.length - 1][0], Utils.nowIso()];
    return { sessao: T('est_sessoes').update(s.id, { status: 'aberta', pausas_json: pausas }, { silent: true }) };
  }

  /**
   * Encerra a sessão: tempo líquido = (fim − início) − pausas. Atualiza assunto, leitura, revisão e tarefa
   * vinculados. Repetir o encerramento devolve o mesmo resultado (idempotente).
   */
  function sessionEnd(p) {
    var s = own('est_sessoes', p.id, 'Sessão');
    if (s.status === 'encerrada') return { sessao: s, repetido: true };
    if (s.status === 'cancelada') throw Utils.error('VALIDATION', 'Esta sessão foi cancelada.');
    var fim = Utils.nowIso(), pausas = (s.pausas_json || []).map(function (x) { return [x[0], x[1] || fim]; });
    var liquido = Math.max(0, secs(s.inicio, fim) - pauseSecs(pausas, fim));
    var maxH = Number(setting('est.sessao_max_h', 8)) || 8;
    var aviso = liquido > maxH * 3600 ? 'A sessão passou de ' + maxH + ' h: confira o tempo e corrija se a esqueceu aberta.' : null;
    var patch = {
      fim: fim, pausas_json: pausas, liquido_s: liquido, status: 'encerrada',
      pagina_fim: p.pagina_fim || s.pagina_fim || null, paginas: p.paginas || s.paginas || null, paginas_n: p.paginas_n != null ? Number(p.paginas_n) : s.paginas_n,
      questoes_n: p.questoes_n != null ? Number(p.questoes_n) : s.questoes_n, acertos_n: p.acertos_n != null ? Number(p.acertos_n) : s.acertos_n,
      dificuldade: p.dificuldade || s.dificuldade || null, duvidas: p.duvidas || s.duvidas || null, proximo_passo: p.proximo_passo || s.proximo_passo || null,
      edicao_motivo: p.motivo_auto || null
    };
    if (patch.acertos_n != null && patch.questoes_n != null && patch.acertos_n > patch.questoes_n) throw Utils.error('VALIDATION', 'Acertos não podem passar do número de questões.', 'acertos_n');
    var out = T('est_sessoes').update(s.id, patch);
    applySessionEffects_(out, p);
    return { sessao: out, aviso: aviso };
  }

  /** Efeitos da sessão encerrada nas entidades ligadas. Cada passo é idempotente. */
  function applySessionEffects_(s, p) {
    if (s.assunto_id) {
      var a = T('est_assuntos').get(s.assunto_id);
      if (a) {
        var ap = { ultimo_estudo: s.fim };
        if (p.teoria && ['nao_iniciada', 'em_andamento', 'concluida'].indexOf(p.teoria) >= 0) ap.teoria = p.teoria;
        else if (a.teoria === 'nao_iniciada' && (s.tipo === 'teoria' || s.tipo === 'leitura' || s.tipo === 'aula')) ap.teoria = 'em_andamento';
        if (p.dificuldade) ap.dificuldade = Utils.clamp(Number(p.dificuldade), 1, 5);
        T('est_assuntos').update(a.id, ap, { silent: true });
        // primeira revisão do assunto depois de estudar teoria (se ainda não houver uma pendente)
        if ((s.tipo === 'teoria' || s.tipo === 'leitura' || s.tipo === 'aula') && setting('est.rev_auto', true) !== false) {
          var pend = T('est_revisoes').list().some(function (r) { return r.alvo_tipo === 'assunto' && r.alvo_id === a.id && r.status === 'pendente'; });
          if (!pend) {
            var iv = intervals()[0];
            T('est_revisoes').insert({ alvo_tipo: 'assunto', alvo_id: a.id, titulo: a.titulo, disciplina_id: a.disciplina_id, assunto_id: a.id, vencimento: Utils.addDays(Utils.today(), iv), seq: 0, intervalo_dias: iv, origem: 'sessao' }, { silent: true });
            T('est_assuntos').update(a.id, { proxima_revisao: Utils.addDays(Utils.today(), iv) }, { silent: true });
          }
        }
      }
    }
    if (s.material_id && (s.paginas || s.pagina_fim)) {
      var range = s.paginas || ((s.pagina_ini || s.pagina_fim) + '-' + s.pagina_fim);
      readingSave({ material_id: s.material_id, marcar_lidas: range, silent: true });
    }
    if (s.tarefa_id && p.concluir_tarefa) {
      var tk = T('tar_tarefas').get(s.tarefa_id);
      if (tk && tk.status !== 'feito') T('tar_tarefas').update(tk.id, { status: 'feito', concluida_em: Utils.nowIso() });
    }
  }

  /** Estudo feito fora do app (aula presencial, livro): lançamento manual com início e fim. */
  function sessionManual(p) {
    var dup = byOpKey('est_sessoes', p.op_key);
    if (dup) return { sessao: dup, repetido: true };
    checkRefs_(p);
    if (!p.inicio) throw Utils.error('VALIDATION', 'Informe quando começou.', 'inicio');
    var ini = new Date(p.inicio), fim = p.fim ? new Date(p.fim) : new Date(ini.getTime() + Number(p.minutos || 0) * 60000);
    if (isNaN(ini) || isNaN(fim) || fim <= ini) throw Utils.error('VALIDATION', 'O fim precisa ser depois do início.', 'fim');
    if (fim > new Date(Date.now() + 5 * 60000)) throw Utils.error('VALIDATION', 'Não dá para lançar estudo no futuro.', 'fim');
    var pausaMin = Math.max(0, Number(p.pausa_min || 0));
    var liquido = Math.max(0, Math.round((fim - ini) / 1000) - pausaMin * 60);
    var row = T('est_sessoes').insert({
      concurso_id: p.concurso_id || null, disciplina_id: p.disciplina_id || null, assunto_id: p.assunto_id || null, material_id: p.material_id || null,
      tarefa_id: p.tarefa_id || null, tipo: p.tipo || 'teoria', objetivo: p.objetivo || null, inicio: Utils.fmt(ini, "yyyy-MM-dd'T'HH:mm:ssXXX"), fim: Utils.fmt(fim, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      pausas_json: pausaMin ? [['manual', pausaMin * 60]] : [], liquido_s: liquido, status: 'encerrada', origem: p.origem || 'manual',
      paginas: p.paginas || null, paginas_n: p.paginas_n || null, questoes_n: p.questoes_n || null, acertos_n: p.acertos_n || null,
      dificuldade: p.dificuldade || null, duvidas: p.duvidas || null, proximo_passo: p.proximo_passo || null, op_key: p.op_key || null
    });
    applySessionEffects_(row, p);
    return { sessao: row };
  }

  /** Correção de horário com motivo obrigatório (fica na auditoria com antes/depois). */
  function sessionEdit(p) {
    var s = own('est_sessoes', p.id, 'Sessão');
    if (s.status !== 'encerrada') throw Utils.error('VALIDATION', 'Encerre a sessão antes de corrigir o horário.');
    if (!String(p.motivo || '').trim()) throw Utils.error('VALIDATION', 'Explique o motivo da correção.', 'motivo');
    var ini = new Date(p.inicio || s.inicio), fim = new Date(p.fim || s.fim);
    if (isNaN(ini) || isNaN(fim) || fim <= ini) throw Utils.error('VALIDATION', 'O fim precisa ser depois do início.', 'fim');
    var pausaS = p.pausa_min != null ? Math.max(0, Number(p.pausa_min)) * 60 : pauseSecs((s.pausas_json || []).filter(function (x) { return x[0] !== 'manual'; }), s.fim) + ((s.pausas_json || []).filter(function (x) { return x[0] === 'manual'; })[0] || [0, 0])[1];
    var liquido = Math.max(0, Math.round((fim - ini) / 1000) - pausaS);
    var patch = { inicio: Utils.fmt(ini, "yyyy-MM-dd'T'HH:mm:ssXXX"), fim: Utils.fmt(fim, "yyyy-MM-dd'T'HH:mm:ssXXX"), pausas_json: [['manual', pausaS]], liquido_s: liquido, edicao_motivo: String(p.motivo).slice(0, 300) };
    ['tipo', 'disciplina_id', 'assunto_id', 'objetivo', 'questoes_n', 'acertos_n', 'paginas', 'duvidas', 'proximo_passo'].forEach(function (k) { if (p[k] !== undefined) patch[k] = p[k]; });
    checkRefs_(patch);
    return { sessao: T('est_sessoes').update(s.id, patch) };
  }

  function sessionCancel(p) {
    var s = own('est_sessoes', p.id, 'Sessão');
    if (s.status === 'encerrada' && !p.motivo) throw Utils.error('VALIDATION', 'Explique por que está cancelando um estudo já registrado.', 'motivo');
    return { sessao: T('est_sessoes').update(s.id, { status: 'cancelada', liquido_s: 0, edicao_motivo: p.motivo || 'Cancelada' }) };
  }

  /** Um Pomodoro do Foco numa tarefa de estudo vira sessão (uma por registro do Foco, sem duplicar). */
  function fromFocus(p) {
    var f = own('tar_foco', p.foco_id, 'Registro de foco');
    if (f.tipo === 'pausa') return { sessao: null };
    var ex = T('est_sessoes').list().filter(function (s) { return s.foco_id === f.id; })[0];
    if (ex) return { sessao: ex, repetido: true };
    var tk = f.tarefa_id ? T('tar_tarefas').get(f.tarefa_id) : null;
    if (!tk || !(tk.est_disciplina_id || tk.est_assunto_id || tk.est_tipo)) return { sessao: null };
    if (openSession_() && openSession_().tarefa_id === tk.id) return { sessao: null, motivo: 'Já existe uma sessão de estudo aberta para esta tarefa: o tempo conta só uma vez.' };
    var ini = new Date(f.inicio), fim = new Date(ini.getTime() + Number(f.duracao_s || 0) * 1000);
    var row = T('est_sessoes').insert({
      concurso_id: tk.est_concurso_id || null, disciplina_id: tk.est_disciplina_id || null, assunto_id: tk.est_assunto_id || null, material_id: tk.est_material_id || null,
      tarefa_id: tk.id, foco_id: f.id, tipo: tk.est_tipo && tk.est_tipo !== 'projeto' ? tk.est_tipo : 'teoria', objetivo: tk.titulo,
      inicio: Utils.fmt(ini, "yyyy-MM-dd'T'HH:mm:ssXXX"), fim: Utils.fmt(fim, "yyyy-MM-dd'T'HH:mm:ssXXX"), pausas_json: [], liquido_s: Number(f.duracao_s || 0), status: 'encerrada', origem: 'foco'
    }, { silent: true });
    applySessionEffects_(row, {});
    return { sessao: row };
  }

  // ================= questões =================
  var Q_FIELDS = ['codigo', 'tipo', 'enunciado', 'alternativas_json', 'imagem_arquivo_id', 'explicacao', 'fonte', 'banca', 'orgao', 'concurso_id', 'cargo', 'ano', 'disciplina_id', 'assunto_id', 'dificuldade', 'favorita', 'duvida', 'tags', 'material_id', 'pagina', 'area', 'gerada_ia', 'revisar', 'texto_base'];

  function normAnswer_(tipo, v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return '';
    if (tipo === 'certo_errado') { var u = Utils.norm(s).charAt(0).toUpperCase(); return u === 'C' || u === 'E' ? u : s.toUpperCase(); }
    if (tipo === 'multipla') return s.toUpperCase().slice(0, 1);
    return Utils.norm(s);
  }

  function validateQuestion_(q) {
    if (!String(q.enunciado || '').trim()) throw Utils.error('VALIDATION', 'Escreva o enunciado.', 'enunciado');
    var tipo = q.tipo || 'multipla';
    if (tipo === 'multipla') {
      var alts = q.alternativas_json || [];
      if (!Array.isArray(alts) || alts.filter(function (a) { return a && String(a.texto || '').trim(); }).length < 2) throw Utils.error('VALIDATION', 'Informe ao menos duas alternativas.', 'alternativas_json');
      if (q.gabarito && !alts.some(function (a) { return String(a.letra).toUpperCase() === String(q.gabarito).toUpperCase(); })) throw Utils.error('VALIDATION', 'O gabarito precisa ser uma das alternativas.', 'gabarito');
    }
    if (tipo === 'certo_errado' && q.gabarito && ['C', 'E'].indexOf(normAnswer_('certo_errado', q.gabarito)) < 0) throw Utils.error('VALIDATION', 'Gabarito de certo/errado é C ou E.', 'gabarito');
    ownOpt('est_concursos', q.concurso_id, 'Concurso'); ownOpt('est_disciplinas', q.disciplina_id, 'Disciplina'); ownOpt('est_assuntos', q.assunto_id, 'Assunto'); ownOpt('est_materiais', q.material_id, 'Material');
  }

  /**
   * Cria/edita questão. Mudanças no enunciado, alternativas ou gabarito sobem a versão e guardam a anterior
   * em est_versoes; tentativas e simulados antigos continuam apontando para a versão que usaram.
   */
  function questionSave(p) {
    var t = T('est_questoes'), cur = p.id ? own('est_questoes', p.id, 'Questão') : null;
    var row = {};
    Q_FIELDS.forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
    if (row.tipo === 'certo_errado' || (cur && cur.tipo === 'certo_errado' && !row.tipo)) row.alternativas_json = [{ letra: 'C', texto: 'Certo' }, { letra: 'E', texto: 'Errado' }];
    var merged = Object.assign({}, cur || {}, row);
    if (p.gabarito !== undefined) merged.gabarito = p.gabarito;
    validateQuestion_(merged);
    if (row.codigo) { var dup = t.list().filter(function (x) { return x.codigo === row.codigo && (!cur || x.id !== cur.id); })[0]; if (dup) throw Utils.error('VALIDATION', 'Já existe uma questão com o código ' + row.codigo + '.', 'codigo'); }
    if (!cur) {
      if (p.gabarito) { row.gabarito = canonGab_(merged.tipo || 'multipla', p.gabarito); row.gabarito_status = p.gabarito_status || 'preliminar'; row.gabarito_hist_json = [{ gabarito: row.gabarito, status: row.gabarito_status, em: Utils.nowIso(), motivo: 'cadastro' }]; }
      else row.gabarito_status = 'sem_gabarito';
      if (!row.codigo) row.codigo = nextCode_('est_questoes', 'Q');
      return { questao: t.insert(row) };
    }
    var conteudo = ['enunciado', 'alternativas_json', 'tipo'].some(function (k) { return row[k] !== undefined && JSON.stringify(row[k]) !== JSON.stringify(cur[k]); });
    if (conteudo) { snapshot_('questao', cur); row.versao = (cur.versao || 1) + 1; }
    var out = t.update(cur.id, row);
    var gabMudou = p.gabarito !== undefined && String(canonGab_(merged.tipo, p.gabarito) || '') !== String(cur.gabarito || '');
    var stMudou = p.gabarito_status !== undefined && p.gabarito_status !== cur.gabarito_status;
    if (gabMudou || stMudou) out = questionGabarito({ questao_id: cur.id, gabarito: p.gabarito !== undefined ? p.gabarito : cur.gabarito, status: p.gabarito_status || cur.gabarito_status || 'preliminar', motivo: p.motivo || 'edição', regra: p.regra }).questao;
    return { questao: out };
  }

  /** Exclusão (uma ou várias, com desfazer). As tentativas ficam guardadas no histórico. */
  function questionDelete(p) {
    var ids = p.ids || (p.id ? [p.id] : []);
    if (!ids.length) throw Utils.error('VALIDATION', 'Escolha as questões.');
    if (ids.length > 2000) throw Utils.error('VALIDATION', 'Máximo de 2.000 questões por vez.');
    var t = T('est_questoes'), mine = {}; t.list().forEach(function (q) { mine[q.id] = q; });
    var ok = ids.filter(function (id) { return mine[id]; });
    if (!ok.length) throw Utils.error('NOT_FOUND', 'Questão não encontrada.');
    var now = Utils.nowIso();
    ok.forEach(function (id) { t.update(id, { deleted_at: now }, { sys: true, silent: ok.length > 1 }); });
    if (ok.length > 1) AppLog.audit('est_questoes', 'excluir', 'lote', null, { quantidade: ok.length });
    return { ids: ok, removidas: ok.length, id: ok[0], removida: true };
  }
  function questionRestore(p) {
    var ids = p.ids || (p.id ? [p.id] : []), t = T('est_questoes');
    var del = {}; t.list({ withDeleted: true }).forEach(function (q) { if (q.deleted_at) del[q.id] = q; });
    var ok = ids.filter(function (id) { return del[id]; });
    if (!ok.length) throw Utils.error('NOT_FOUND', 'Questão não encontrada.');
    var out = ok.map(function (id) { return t.update(id, { deleted_at: null }, { sys: true, silent: ok.length > 1 }); });
    return { questoes: out, questao: out[0] };
  }
  /** Comentário da pessoa na questão (pode vir de uma explicação da IA aceita por ela). */
  function questionComment(p) {
    var q = own('est_questoes', p.id, 'Questão');
    var txt = String(p.comentario == null ? '' : p.comentario).slice(0, 8000);
    return { questao: T('est_questoes').update(q.id, { comentario: txt || null, comentario_ia: !!(txt && p.ia), comentario_em: txt ? Utils.nowIso() : null }) };
  }
  /**
   * Inclui questões geradas pela IA (ou coladas) no banco: marcadas "geradas por IA" e "a revisar",
   * gabarito sempre preliminar (é sugestão da IA, não oficial).
   */
  function questionsAdd(p) {
    var lista = (p.questoes || []).slice(0, 50);
    if (!lista.length) throw Utils.error('VALIDATION', 'Nenhuma questão para incluir.');
    ownOpt('est_concursos', p.concurso_id, 'Concurso'); ownOpt('est_disciplinas', p.disciplina_id, 'Disciplina'); ownOpt('est_assuntos', p.assunto_id, 'Assunto');
    var out = [], erros = [];
    lista.forEach(function (q, i) {
      try {
        var r = questionSave({ tipo: q.tipo || 'multipla', enunciado: q.enunciado, alternativas_json: q.alternativas_json, gabarito: q.gabarito || '', gabarito_status: q.gabarito ? 'preliminar' : 'sem_gabarito', explicacao: q.explicacao || null,
          dificuldade: Utils.clamp(Number(q.dificuldade) || 3, 1, 5), concurso_id: p.concurso_id || null, disciplina_id: p.disciplina_id || null, assunto_id: p.assunto_id || null, area: p.area || null, banca: p.banca || null,
          fonte: String(p.fonte || 'IA').slice(0, 300), tags: 'ia', gerada_ia: p.gerada_ia !== false, revisar: p.gerada_ia !== false });
        out.push(r.questao);
      } catch (e) { erros.push({ item: i + 1, mensagem: e.message }); }
    });
    return { questoes: out, erros: erros };
  }

  function snapshot_(entidade, row) {
    T('est_versoes').insert({ entidade: entidade, entidade_id: row.id, versao: row.versao || 1, titulo: String(row.titulo || row.codigo || '').slice(0, 200), conteudo: JSON.stringify(row).slice(0, 49000) }, { silent: true });
  }

  function nextCode_(table, prefix) {
    var max = 0;
    T(table).list({ withDeleted: true }).forEach(function (r) { var m = String(r.codigo || '').match(new RegExp('^' + prefix + '(\\d+)$')); if (m) max = Math.max(max, Number(m[1])); });
    return prefix + (max + 1);
  }

  /** Gabarito na forma guardada: letra maiúscula (múltipla), C/E (certo/errado), texto (curta). */
  function canonGab_(tipo, g) { var s0 = String(g || '').trim(); if (!s0) return ''; if (tipo === 'multipla') return s0.toUpperCase().slice(0, 1); if (tipo === 'certo_errado') return normAnswer_('certo_errado', s0); return s0; }

  /**
   * Muda gabarito/situação (preliminar → definitivo, alteração, anulação) e registra no histórico.
   * regra: 'atual' recalcula resultado_atual das tentativas com o novo gabarito; 'original' só registra.
   * O resultado original de cada tentativa nunca muda.
   */
  function questionGabarito(p) {
    var q = own('est_questoes', p.questao_id, 'Questão');
    var status = p.status || 'definitivo';
    if (['preliminar', 'definitivo', 'anulada', 'sem_gabarito'].indexOf(status) < 0) throw Utils.error('VALIDATION', 'Situação de gabarito inválida.', 'status');
    var gab = status === 'anulada' ? (q.gabarito || '') : canonGab_(q.tipo, p.gabarito);
    if (status !== 'anulada' && status !== 'sem_gabarito' && !gab) throw Utils.error('VALIDATION', 'Informe o gabarito.', 'gabarito');
    validateQuestion_(Object.assign({}, q, { gabarito: gab }));
    var hist = (q.gabarito_hist_json || []).concat([{ gabarito: gab, status: status, em: Utils.nowIso(), motivo: String(p.motivo || '').slice(0, 200), anterior: q.gabarito || '', anterior_status: q.gabarito_status }]);
    var out = T('est_questoes').update(q.id, { gabarito: gab, gabarito_status: status, gabarito_hist_json: hist });
    var recalc = 0;
    if ((p.regra || 'atual') === 'atual') {
      var now = Utils.nowIso();
      T('est_tentativas').list().filter(function (x) { return x.questao_id === q.id; }).forEach(function (x) {
        var res = judge_(out, x.resposta);
        if (res !== (x.resultado_atual || x.resultado)) { T('est_tentativas').update(x.id, { resultado_atual: res, recalc_em: now }, { silent: true }); recalc++; }
      });
    }
    return { questao: out, recalculadas: recalc };
  }

  /** Corrige uma resposta contra o gabarito vigente da questão. */
  function judge_(q, resposta, auto) {
    if (q.gabarito_status === 'anulada') return 'anulada';
    var r = normAnswer_(q.tipo, resposta);
    if (!r) return 'branco';
    if (q.tipo === 'discursiva' || (q.tipo === 'curta' && !q.gabarito)) return auto === 'certa' || auto === 'errada' ? auto : 'sem_gabarito';
    if (!q.gabarito || q.gabarito_status === 'sem_gabarito') return auto === 'certa' || auto === 'errada' ? auto : 'sem_gabarito';
    if (q.tipo === 'curta') return String(q.gabarito).split('|').map(function (g) { return normAnswer_('curta', g); }).indexOf(r) >= 0 ? 'certa' : 'errada';
    return r === normAnswer_(q.tipo, q.gabarito) ? 'certa' : 'errada';
  }

  /** Registra uma tentativa (treino, avaliação, Telegram). Idempotente por op_key. */
  function answer(p) {
    var dup = byOpKey('est_tentativas', p.op_key);
    var q = own('est_questoes', p.questao_id, 'Questão');
    if (dup) return { tentativa: dup, gabarito: q.gabarito, gabarito_status: q.gabarito_status, explicacao: q.explicacao, repetido: true };
    ownOpt('est_sessoes', p.sessao_id, 'Sessão');
    var modo = ['treino', 'avaliacao', 'simulado', 'telegram'].indexOf(p.modo) >= 0 ? p.modo : 'treino';
    var res = judge_(q, p.resposta, p.autoavaliacao);
    var anteriores = T('est_tentativas').list().filter(function (x) { return x.questao_id === q.id; }).length;
    var row = T('est_tentativas').insert({
      questao_id: q.id, questao_versao: q.versao || 1, resposta: String(p.resposta || '').slice(0, 40), gabarito_usado: q.gabarito || '',
      resultado: res, resultado_atual: res, tempo_s: p.tempo_s ? Math.round(Number(p.tempo_s)) : null, confianca: p.confianca ? Utils.clamp(Number(p.confianca), 1, 3) : null,
      modo: modo, sessao_id: p.sessao_id || null, simulado_id: p.simulado_id || null, primeira: anteriores === 0, op_key: p.op_key || null
    }, { silent: true });
    // errou: a questão entra na fila de revisão (configurável)
    if (res === 'errada' && setting('est.rev_questao_errada', true) !== false) {
      var pend = T('est_revisoes').list().some(function (r) { return r.alvo_tipo === 'questao' && r.alvo_id === q.id && r.status === 'pendente'; });
      if (!pend) T('est_revisoes').insert({ alvo_tipo: 'questao', alvo_id: q.id, titulo: 'Questão ' + (q.codigo || ''), disciplina_id: q.disciplina_id, assunto_id: q.assunto_id, vencimento: Utils.addDays(Utils.today(), 1), seq: 0, intervalo_dias: 1, origem: 'erro' }, { silent: true });
    }
    return { tentativa: row, gabarito: q.gabarito, gabarito_status: q.gabarito_status, explicacao: q.explicacao };
  }

  /** Abre/atualiza um registro no caderno de erros a partir de uma tentativa (recorrência conta). */
  function errorFromAttempt(p) {
    var q = own('est_questoes', p.questao_id, 'Questão');
    var ex = T('est_erros').list().filter(function (e) { return e.questao_id === q.id && e.status !== 'resolvida'; })[0];
    if (ex) return { erro: T('est_erros').update(ex.id, { recorrencias: (ex.recorrencias || 1) + 1, status: ex.status === 'aguardando_pratica' ? 'em_estudo' : ex.status }), recorrente: true };
    var resolvida = T('est_erros').list().filter(function (e) { return e.questao_id === q.id; }).length;
    return { erro: T('est_erros').insert({ titulo: p.titulo || ('Erro na questão ' + (q.codigo || '')), questao_id: q.id, disciplina_id: q.disciplina_id, assunto_id: q.assunto_id, causa: p.causa || 'conteudo', raciocinio: p.raciocinio || null, explicacao: q.explicacao || null, fonte: q.fonte || null, status: 'aberta', recorrencias: resolvida + 1, proxima_tentativa: Utils.addDays(Utils.today(), 3) }), recorrente: resolvida > 0 };
  }

  // ================= simulados =================
  function rules_(sim) {
    var r = sim.regras_json || {};
    return {
      acerto: r.acerto != null ? Number(r.acerto) : 1, erro: r.erro != null ? Number(r.erro) : 0, branco: r.branco != null ? Number(r.branco) : 0,
      anulada: ['pontua', 'desconsidera', 'zero'].indexOf(r.anulada) >= 0 ? r.anulada : 'pontua', minimo_total: r.minimo_total != null && r.minimo_total !== '' ? Number(r.minimo_total) : null
    };
  }

  function shuffle_(arr, seed) {
    var a = arr.slice(), s = 0;
    String(seed).split('').forEach(function (c) { s = (s * 31 + c.charCodeAt(0)) >>> 0; });
    for (var i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; var j = s % (i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /** Monta a prova (snapshot de versões e gabaritos) e inicia o cronômetro. Retomar devolve o que já existe. */
  function simStart(p) {
    var sim = own('est_simulados', p.simulado_id, 'Simulado');
    var it = T('est_simulado_itens');
    var itens = it.list().filter(function (x) { return x.simulado_id === sim.id; });
    if (sim.status === 'finalizado') throw Utils.error('VALIDATION', 'Este simulado já foi finalizado. Duplique-o para refazer.');
    if (itens.length) {
      if (sim.status !== 'em_andamento') sim = T('est_simulados').update(sim.id, { status: 'em_andamento', inicio: sim.inicio || Utils.nowIso() });
      return { simulado: sim, itens: itens.sort(function (a, b) { return a.ordem - b.ordem; }), questoes: questionsFor_(itens) };
    }
    var comp = sim.composicao_json || {}, blocos = comp.blocos || [], todas = T('est_questoes').list(), usadas = {}, rows = [], ordem = 0;
    var feitas = {}, ultimaT = {}, ultimaRes = {}; T('est_tentativas').list().forEach(function (x) { feitas[x.questao_id] = 1; if (!ultimaT[x.questao_id] || x.created_at > ultimaT[x.questao_id].created_at) ultimaT[x.questao_id] = x; });
    Object.keys(ultimaT).forEach(function (k) { ultimaRes[k] = ultimaT[k].resultado_atual || ultimaT[k].resultado; });
    var areaConc = {}; T('est_concursos').list().forEach(function (c) { areaConc[c.id] = c.area || ''; });
    if (comp.questao_ids && comp.questao_ids.length) {
      comp.questao_ids.forEach(function (qid) { var q = own('est_questoes', qid, 'Questão'); if (q.tipo !== 'multipla' && q.tipo !== 'certo_errado') throw Utils.error('VALIDATION', 'Simulados aceitam só múltipla escolha e certo/errado (questão ' + (q.codigo || '') + ').'); rows.push(item_(sim, q, ++ordem, comp.bloco || 'Geral', 1)); usadas[qid] = 1; });
    }
    blocos.forEach(function (b, bi) {
      var pool = todas.filter(function (q) {
        return !usadas[q.id] && (q.tipo === 'multipla' || q.tipo === 'certo_errado') && (!b.disciplina_id || q.disciplina_id === b.disciplina_id) && (!b.assunto_id || q.assunto_id === b.assunto_id)
          && (!b.banca || Utils.norm(q.banca) === Utils.norm(b.banca)) && (!b.ineditas || !feitas[q.id]) && (q.gabarito || q.gabarito_status === 'anulada')
          && (!b.concurso_id || q.concurso_id === b.concurso_id) && (!b.area || Utils.norm(q.area || areaConc[q.concurso_id] || '') === Utils.norm(b.area)) && (!b.tipo_questao || q.tipo === b.tipo_questao)
          && (!b.erradas || ultimaRes[q.id] === 'errada') && (!b.disciplinas || !b.disciplinas.length || b.disciplinas.indexOf(q.disciplina_id) >= 0);
      });
      var pick = shuffle_(pool, sim.id + ':' + bi).slice(0, Math.max(0, Number(b.qtd) || 0));
      if (pick.length < (Number(b.qtd) || 0) && !p.aceitar_menos) {
        throw Utils.error('VALIDATION', 'O bloco "' + (b.nome || ('Bloco ' + (bi + 1))) + '" pediu ' + b.qtd + ' questões, mas o banco tem ' + pick.length + ' com gabarito nesse filtro.');
      }
      pick.forEach(function (q) { usadas[q.id] = 1; rows.push(item_(sim, q, ++ordem, b.nome || ('Bloco ' + (bi + 1)), Number(b.peso) || 1)); });
    });
    if (!rows.length) throw Utils.error('VALIDATION', 'Escolha questões ou blocos com questões disponíveis no banco.');
    var saved = it.insertMany(rows, { silent: true });
    sim = T('est_simulados').update(sim.id, { status: 'em_andamento', inicio: Utils.nowIso() });
    return { simulado: sim, itens: saved, questoes: questionsFor_(saved) };
  }

  function item_(sim, q, ordem, bloco, peso) {
    return { simulado_id: sim.id, questao_id: q.id, ordem: ordem, bloco: bloco, peso: peso, questao_versao: q.versao || 1, gabarito_snapshot: q.gabarito || '', status_snapshot: q.gabarito_status || 'sem_gabarito', resposta: '', marcada: false };
  }

  /** Enunciado e alternativas para a prova, sem gabarito nem explicação (vêm só no resultado). */
  function questionsFor_(itens) {
    var ids = {}; itens.forEach(function (i) { ids[i.questao_id] = 1; });
    return T('est_questoes').list().filter(function (q) { return ids[q.id]; }).map(function (q) { return { id: q.id, codigo: q.codigo, tipo: q.tipo, enunciado: q.enunciado, alternativas_json: q.alternativas_json, imagem_arquivo_id: q.imagem_arquivo_id, texto_base: q.texto_base || null, material_id: q.material_id || null, pagina: q.pagina || null, disciplina_id: q.disciplina_id, assunto_id: q.assunto_id, banca: q.banca, ano: q.ano }; });
  }

  /** Salvamento progressivo do cartão-resposta. */
  function simSave(p) {
    var sim = own('est_simulados', p.simulado_id, 'Simulado');
    if (sim.status !== 'em_andamento') throw Utils.error('VALIDATION', 'Este simulado não está em andamento.');
    var it = T('est_simulado_itens'), mine = {};
    it.list().forEach(function (x) { if (x.simulado_id === sim.id) mine[x.id] = x; });
    var n = 0;
    Object.keys(p.respostas || {}).forEach(function (iid) {
      var x = mine[iid]; if (!x) return;
      var r = p.respostas[iid] || {}, patch = {};
      if (r.resposta !== undefined && String(r.resposta || '') !== String(x.resposta || '')) patch.resposta = String(r.resposta || '').slice(0, 40);
      if (r.marcada !== undefined && !!r.marcada !== !!x.marcada) patch.marcada = !!r.marcada;
      if (r.tempo_s !== undefined) patch.tempo_s = Math.round(Number(r.tempo_s) || 0);
      if (Object.keys(patch).length) { it.update(iid, patch, { silent: true }); n++; }
    });
    return { salvos: n, em: Utils.nowIso() };
  }

  /** Corrige com as regras do simulado e o gabarito congelado no início. */
  function score_(sim, itens) {
    var R = rules_(sim), blocos = {}, tot = { nota: 0, max: 0, acertos: 0, erros: 0, brancos: 0, anuladas: 0, tempo_s: 0, n: itens.length };
    var minimos = {}; ((sim.composicao_json || {}).blocos || []).forEach(function (b, i) { minimos[b.nome || ('Bloco ' + (i + 1))] = b.minimo != null && b.minimo !== '' ? Number(b.minimo) : null; });
    itens.forEach(function (x) {
      var b = blocos[x.bloco] = blocos[x.bloco] || { bloco: x.bloco, nota: 0, max: 0, acertos: 0, erros: 0, brancos: 0, anuladas: 0, n: 0 };
      var peso = Number(x.peso) || 1, res;
      b.n++; tot.tempo_s += Number(x.tempo_s) || 0;
      if (x.status_snapshot === 'anulada') {
        res = 'anulada'; b.anuladas++; tot.anuladas++;
        if (R.anulada === 'pontua') { b.nota += R.acerto * peso; b.max += R.acerto * peso; }
        else if (R.anulada === 'zero') { b.max += R.acerto * peso; }
      } else {
        b.max += R.acerto * peso;
        var r = normAnswer_('multipla', x.resposta), g = normAnswer_('multipla', x.gabarito_snapshot);
        if (!String(x.resposta || '').trim()) { res = 'branco'; b.brancos++; tot.brancos++; b.nota += R.branco * peso; }
        else if (r === g) { res = 'certa'; b.acertos++; tot.acertos++; b.nota += R.acerto * peso; }
        else { res = 'errada'; b.erros++; tot.erros++; b.nota += R.erro * peso; }
      }
      x._res = res;
    });
    var lista = Object.keys(blocos).map(function (k) { var b = blocos[k]; b.minimo = minimos[k] != null ? minimos[k] : null; b.atingiu_minimo = b.minimo == null ? null : b.nota >= b.minimo; tot.nota += b.nota; tot.max += b.max; return b; });
    tot.pct = tot.max > 0 ? Math.round(tot.nota / tot.max * 1000) / 10 : null;
    tot.validas = tot.n - (R.anulada === 'desconsidera' ? tot.anuladas : 0);
    tot.respondidas = tot.acertos + tot.erros;
    tot.precisao = tot.respondidas ? Math.round(tot.acertos / tot.respondidas * 1000) / 10 : null;
    tot.tempo_medio_s = tot.n ? Math.round(tot.tempo_s / tot.n) : null;
    tot.minimo_total = R.minimo_total; tot.atingiu_minimo_total = R.minimo_total == null ? null : tot.nota >= R.minimo_total;
    tot.aprovado_criterios = lista.every(function (b) { return b.atingiu_minimo !== false; }) && tot.atingiu_minimo_total !== false;
    return { total: tot, blocos: lista, regras: R };
  }

  function simFinish(p) {
    var sim = own('est_simulados', p.simulado_id, 'Simulado');
    if (p.respostas) simSave(p);
    var it = T('est_simulado_itens'), itens = it.list().filter(function (x) { return x.simulado_id === sim.id; }).sort(function (a, b) { return a.ordem - b.ordem; });
    if (sim.status === 'finalizado') return { simulado: sim, itens: itens, repetido: true };
    if (!itens.length) throw Utils.error('VALIDATION', 'O simulado não tem questões.');
    var sc = score_(sim, itens);
    var now = Utils.nowIso();
    itens.forEach(function (x) { if (x.resultado !== x._res) it.update(x.id, { resultado: x._res }, { silent: true }); x.resultado = x._res; delete x._res; });
    // tentativas no histórico (uma por questão do simulado, idempotente)
    var feitas = {}; T('est_tentativas').list().forEach(function (t) { if (t.simulado_id === sim.id) feitas[t.questao_id] = 1; });
    var anteriores = {}; T('est_tentativas').list().forEach(function (t) { anteriores[t.questao_id] = 1; });
    var tent = itens.filter(function (x) { return !feitas[x.questao_id]; }).map(function (x) {
      return { questao_id: x.questao_id, questao_versao: x.questao_versao, resposta: x.resposta || '', gabarito_usado: x.gabarito_snapshot, resultado: x.resultado, resultado_atual: x.resultado, tempo_s: x.tempo_s || null, modo: 'simulado', simulado_id: sim.id, primeira: !anteriores[x.questao_id], op_key: 'sim:' + sim.id + ':' + x.questao_id };
    });
    if (tent.length) T('est_tentativas').insertMany(tent, { silent: true });
    var tempo = sim.inicio ? secs(sim.inicio, now) : sc.total.tempo_s;
    var out = T('est_simulados').update(sim.id, { status: 'finalizado', fim: now, tempo_s: tempo, resultado_json: sc });
    return { simulado: out, itens: itens, gabaritos: questionDetails_(itens) };
  }

  function questionDetails_(itens) {
    var ids = {}; itens.forEach(function (i) { ids[i.questao_id] = 1; });
    var out = {};
    T('est_questoes').list().forEach(function (q) { if (ids[q.id]) out[q.id] = { explicacao: q.explicacao || '', gabarito_atual: q.gabarito, status_atual: q.gabarito_status, versao_atual: q.versao }; });
    return out;
  }

  // ================= revisões =================
  /** Marca a revisão como feita e agenda a próxima conforme o resultado (critério visível em Preferências). */
  function reviewDone(p) {
    var r = own('est_revisoes', p.id, 'Revisão');
    if (['errei', 'dificil', 'bom', 'facil'].indexOf(p.resultado) < 0) throw Utils.error('VALIDATION', 'Escolha como foi a revisão.', 'resultado');
    if (r.status === 'feita') return { revisao: r, proxima: null, repetido: true };
    var iv = intervals(), seq = Number(r.seq || 0);
    var nextSeq = p.resultado === 'errei' ? 0 : p.resultado === 'dificil' ? seq : p.resultado === 'bom' ? seq + 1 : seq + 2;
    var dias = nextSeq < iv.length ? iv[nextSeq] : Math.round(iv[iv.length - 1] * Math.pow(1.5, nextSeq - iv.length + 1));
    var feita = T('est_revisoes').update(r.id, { status: 'feita', feita_em: Utils.nowIso(), resultado: p.resultado });
    var prox = null;
    if (p.encerrar !== true) prox = T('est_revisoes').insert({ alvo_tipo: r.alvo_tipo, alvo_id: r.alvo_id, titulo: r.titulo, disciplina_id: r.disciplina_id, assunto_id: r.assunto_id, paginas: r.paginas, vencimento: Utils.addDays(Utils.today(), dias), seq: nextSeq, intervalo_dias: dias, origem: 'revisao' }, { silent: true });
    if (r.alvo_tipo === 'assunto') { var a = T('est_assuntos').get(r.alvo_id); if (a) T('est_assuntos').update(a.id, { ultima_revisao: Utils.nowIso(), proxima_revisao: prox ? prox.vencimento : null }, { silent: true }); }
    return { revisao: feita, proxima: prox };
  }

  /** Agenda revisão manual (assunto, páginas de material, nota, erro). */
  function reviewSchedule(p) {
    var tipos = { assunto: 'est_assuntos', material: 'est_materiais', questao: 'est_questoes', erro: 'est_erros', nota: 'est_anotacoes' };
    if (!tipos[p.alvo_tipo]) throw Utils.error('VALIDATION', 'Tipo de revisão inválido.');
    var alvo = own(tipos[p.alvo_tipo], p.alvo_id, 'Item');
    var dias = p.vencimento ? null : Number(p.dias != null ? p.dias : intervals()[0]);
    var r = T('est_revisoes').insert({ alvo_tipo: p.alvo_tipo, alvo_id: alvo.id, titulo: p.titulo || alvo.titulo || alvo.codigo || 'Revisão', disciplina_id: alvo.disciplina_id || null, assunto_id: p.alvo_tipo === 'assunto' ? alvo.id : (alvo.assunto_id || null), paginas: p.paginas || null, vencimento: p.vencimento || Utils.addDays(Utils.today(), dias), seq: 0, intervalo_dias: dias, origem: 'manual' });
    return { revisao: r };
  }

  // ================= flashcards (SM-2 simplificado) =================
  function cardAnswer(p) {
    var c = own('est_flashcards', p.card_id, 'Cartão');
    if (['errei', 'dificil', 'bom', 'facil'].indexOf(p.nota) < 0) throw Utils.error('VALIDATION', 'Avalie o cartão.', 'nota');
    var dup = byOpKey('est_flashcard_revisoes', p.op_key);
    if (dup) return { card: c, revisao: dup, repetido: true };
    var f = Number(c.facilidade) || 2.5, iv = Number(c.intervalo) || 0, rep = Number(c.repeticoes) || 0, lap = Number(c.lapsos) || 0, ni;
    if (p.nota === 'errei') { rep = 0; lap++; ni = 1; f = Math.max(1.3, f - 0.2); }
    else if (p.nota === 'dificil') { ni = Math.max(1, Math.round((iv || 1) * 1.2)); f = Math.max(1.3, f - 0.15); rep++; }
    else { ni = rep === 0 ? 1 : rep === 1 ? 3 : Math.round(iv * f); if (p.nota === 'facil') { ni = Math.round(Math.max(ni, 2) * 1.3); f += 0.15; } rep++; }
    ni = Math.min(3650, Math.max(1, ni));
    var card = T('est_flashcards').update(c.id, { facilidade: Math.round(f * 100) / 100, intervalo: ni, repeticoes: rep, lapsos: lap, vencimento: Utils.addDays(Utils.today(), ni), novo: false }, { silent: true });
    var log = T('est_flashcard_revisoes').insert({ card_id: c.id, nota: p.nota, data: Utils.nowIso(), intervalo_antes: iv, intervalo_depois: ni, op_key: p.op_key || null }, { silent: true });
    return { card: card, revisao: log };
  }

  // ================= resumos, lei seca e discursivas (com versões) =================
  var NOTE_FIELDS = ['titulo', 'tipo', 'conteudo', 'disciplina_id', 'assunto_id', 'material_id', 'pagina', 'trecho', 'tags', 'favorito', 'ligadas', 'norma', 'artigo', 'fonte', 'fonte_data', 'gerado_ia', 'aprovado', 'ia_meta'];
  function noteSave(p) {
    var t = T('est_anotacoes'), cur = p.id ? own('est_anotacoes', p.id, 'Anotação') : null, row = {};
    NOTE_FIELDS.forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
    if (String(row.conteudo || '').length > 45000) throw Utils.error('VALIDATION', 'Texto muito longo (máximo de 45 mil caracteres por nota). Divida em notas ligadas.', 'conteudo');
    ownOpt('est_disciplinas', row.disciplina_id, 'Disciplina'); ownOpt('est_assuntos', row.assunto_id, 'Assunto'); ownOpt('est_materiais', row.material_id, 'Material');
    if (!cur) return { nota: t.insert(row) };
    if (p.base_versao && Number(p.base_versao) !== Number(cur.versao || 1)) { var e = Utils.error('CONFLICT', 'Esta nota foi alterada em outro aparelho.'); e.data = { atual: cur }; throw e; }
    if ((row.conteudo !== undefined && row.conteudo !== cur.conteudo) || (row.titulo !== undefined && row.titulo !== cur.titulo)) {
      snapshot_('nota', cur);
      row.versao = (cur.versao || 1) + 1;
    }
    return { nota: t.update(cur.id, row) };
  }

  /** Excluir (lixeira, com desfazer) anotações e discursivas, que só são gravadas por rotas próprias. */
  var DEL_OK = { est_anotacoes: 'Anotação', est_discursivas: 'Discursiva' };
  function entityDel_(p, apagar) {
    if (!DEL_OK[p.table]) throw Utils.error('FORBIDDEN', 'Tabela não permitida: ' + p.table);
    var t = T(p.table), row = t.list({ withDeleted: true }).filter(function (r) { return r.id === p.id; })[0];
    if (!row) throw Utils.error('NOT_FOUND', DEL_OK[p.table] + ' não encontrada.');
    var out = apagar ? t.softDelete(row.id) : t.restore(row.id);
    return { row: out || t.list({ withDeleted: true }).filter(function (r) { return r.id === p.id; })[0] };
  }

  function noteVersions(p) {
    var ent = p.entidade === 'discursiva' ? 'discursiva' : p.entidade === 'questao' ? 'questao' : 'nota';
    var tab = ent === 'discursiva' ? 'est_discursivas' : ent === 'questao' ? 'est_questoes' : 'est_anotacoes';
    own(tab, p.id, 'Registro');
    return { versoes: T('est_versoes').list().filter(function (v) { return v.entidade === ent && v.entidade_id === p.id; }).sort(function (a, b) { return b.versao - a.versao; }).map(function (v) { var o = Utils.parseJson(v.conteudo, {}); return { versao: v.versao, em: v.created_at, titulo: o.titulo || v.titulo, conteudo: o.conteudo || o.texto || o.enunciado || '' }; }) };
  }

  var DISC_FIELDS = ['titulo', 'concurso_id', 'proposta', 'tipo', 'limite_linhas', 'limite_palavras', 'tempo_min', 'criterios_json', 'texto', 'status', 'gerado_ia', 'ia_meta'];
  /** Discursiva: texto com versões e avaliações por critério (humana, automatizada ou oficial). */
  function discSave(p) {
    var t = T('est_discursivas'), cur = p.id ? own('est_discursivas', p.id, 'Discursiva') : null, row = {};
    DISC_FIELDS.forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
    ownOpt('est_concursos', row.concurso_id, 'Concurso');
    if (p.avaliacao) {
      var av = p.avaliacao, crit = (row.criterios_json || (cur && cur.criterios_json) || []);
      if (['humana', 'automatizada', 'oficial', 'autoavaliacao'].indexOf(av.tipo) < 0) throw Utils.error('VALIDATION', 'Diga quem avaliou (você, outra pessoa, automática ou oficial).', 'avaliacao');
      var notas = (av.notas || []).map(function (n, i) { var max = crit[i] ? Number(crit[i].max) || 0 : null; var v = Number(n) || 0; if (max != null && v > max) throw Utils.error('VALIDATION', 'Nota acima do máximo no critério "' + crit[i].nome + '".'); return v; });
      var lista = ((cur && cur.avaliacoes_json) || []).concat([{ tipo: av.tipo, avaliador: av.avaliador || '', sugestao_ia: av.sugestao_ia === true, ia: av.ia || null, notas: notas, total: notas.reduce(function (a, b) { return a + b; }, 0), max: crit.reduce(function (a, c) { return a + (Number(c.max) || 0); }, 0), comentarios: av.comentarios || [], comentario: av.comentario || '', versao: cur ? cur.versao : 1, em: Utils.nowIso() }]);
      row.avaliacoes_json = lista;
      row.status = 'corrigida';
    }
    if (!cur) return { discursiva: t.insert(row) };
    if (p.base_versao && Number(p.base_versao) !== Number(cur.versao || 1)) { var e = Utils.error('CONFLICT', 'Este texto foi alterado em outro aparelho.'); e.data = { atual: cur }; throw e; }
    if (row.texto !== undefined && row.texto !== cur.texto && (p.nova_versao || cur.status === 'corrigida')) {
      snapshot_('discursiva', cur); row.versao = (cur.versao || 1) + 1; if (cur.status === 'corrigida') row.status = 'reescrita';
    }
    return { discursiva: t.update(cur.id, row) };
  }

  // ================= materiais e leitura =================
  var MAT_FIELDS = ['titulo', 'descricao', 'autor', 'tipo', 'data_ref', 'disciplina_id', 'assunto_ids', 'concurso_ids', 'tags', 'arquivo_id', 'url', 'situacao', 'favorito', 'paginas', 'categoria'];
  function materialSave(p) {
    var t = T('est_materiais'), cur = p.id ? own('est_materiais', p.id, 'Material') : null, row = {};
    MAT_FIELDS.forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
    if (!cur && !String(row.titulo || '').trim()) throw Utils.error('VALIDATION', 'Dê um título ao material.', 'titulo');
    ownOpt('est_disciplinas', row.disciplina_id, 'Disciplina');
    String(row.assunto_ids || '').split(',').filter(Boolean).forEach(function (id) { own('est_assuntos', id, 'Assunto'); });
    String(row.concurso_ids || '').split(',').filter(Boolean).forEach(function (id) { own('est_concursos', id, 'Concurso'); });
    if (row.arquivo_id) {
      var arq = own('arquivos', row.arquivo_id, 'Arquivo');
      row.hash = arq.hash; row.tamanho_bytes = arq.tamanho_bytes;
      if (!row.tipo) row.tipo = /pdf/.test(arq.mime) ? 'pdf' : /sheet|excel|csv/.test(arq.mime) ? 'xlsx' : /^image\//.test(arq.mime) ? 'imagem' : 'outro';
    }
    if (row.url && !/^https?:\/\//i.test(row.url)) throw Utils.error('VALIDATION', 'O link precisa começar com http:// ou https://.', 'url');
    var saved;
    if (!cur) { row.codigo = nextCode_('est_materiais', 'M'); row.origem = p.origem === 'telegram' ? 'telegram' : 'app'; saved = t.insert(row); }
    else saved = t.update(cur.id, row);
    // pasta no Drive: Tipo/Concurso/Data/Categoria (mudar categoria ou concurso move o arquivo)
    if (saved.arquivo_id && (!cur || row.categoria !== undefined || row.concurso_ids !== undefined || row.arquivo_id !== undefined)) { var cam = StudyFiles.place_(saved); if (cam) saved = t.get(saved.id); }
    return { material: saved };
  }

  /** Edição em lote (categoria, concurso, disciplina): cada material vai para a pasta certa. */
  function materialBatch(p) {
    var ids = (p.ids || []).slice(0, 500), out = [];
    if (!ids.length) throw Utils.error('VALIDATION', 'Escolha os materiais.');
    var patch = {};
    ['categoria', 'concurso_ids', 'disciplina_id', 'situacao'].forEach(function (k) { if (p[k] !== undefined) patch[k] = p[k]; });
    if (!Object.keys(patch).length) throw Utils.error('VALIDATION', 'Nada para alterar.');
    ids.forEach(function (id) { out.push(materialSave(Object.assign({ id: id }, patch)).material); });
    return { materiais: out };
  }

  function rangesToSet_(s) {
    var set = {};
    String(s || '').split(',').forEach(function (part) {
      var m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (!m) return;
      var a = Number(m[1]), b = Number(m[2] || m[1]); if (b < a) { var t = a; a = b; b = t; }
      for (var i = a; i <= b && i - a < 5000; i++) set[i] = 1;
    });
    return set;
  }
  function setToRanges_(set) {
    var ns = Object.keys(set).map(Number).sort(function (a, b) { return a - b; }), out = [], i = 0;
    while (i < ns.length) { var a = ns[i], b = a; while (ns[i + 1] === b + 1) { b++; i++; } out.push(a === b ? String(a) : a + '-' + b); i++; }
    return out.join(',');
  }

  /** Posição de leitura (página/zoom) e páginas efetivamente marcadas como lidas. */
  function readingSave(p) {
    var mat = own('est_materiais', p.material_id, 'Material'), t = T('est_leitura');
    var cur = t.list().filter(function (r) { return r.material_id === mat.id; })[0];
    var patch = { atualizado: Utils.nowIso() };
    if (p.pagina) patch.pagina = Math.max(1, Math.round(Number(p.pagina)));
    if (p.zoom) patch.zoom = Number(p.zoom);
    if (p.rolagem != null) patch.rolagem = Number(p.rolagem);
    if (p.total_paginas) patch.total_paginas = Number(p.total_paginas);
    if (p.marcar_lidas) { var set = rangesToSet_((cur && cur.paginas_lidas) || ''); var add = rangesToSet_(p.marcar_lidas); Object.keys(add).forEach(function (k) { set[k] = 1; }); patch.paginas_lidas = setToRanges_(set); }
    if (p.desmarcar_lidas) { var s2 = rangesToSet_(patch.paginas_lidas || (cur && cur.paginas_lidas) || ''); Object.keys(rangesToSet_(p.desmarcar_lidas)).forEach(function (k) { delete s2[k]; }); patch.paginas_lidas = setToRanges_(s2); }
    var opts = { silent: true };
    var out = cur ? t.update(cur.id, patch, opts) : t.insert(Object.assign({ material_id: mat.id, pagina: 1 }, patch), opts);
    if (patch.paginas_lidas !== undefined && (out.total_paginas || mat.paginas)) {
      var lidas = Object.keys(rangesToSet_(out.paginas_lidas)).length, total = Number(out.total_paginas || mat.paginas);
      if (mat.situacao === 'a_estudar' && lidas) T('est_materiais').update(mat.id, { situacao: 'estudando' }, opts);
      if (lidas >= total && mat.situacao !== 'concluido' && setting('est.material_auto_concluir', true) !== false) T('est_materiais').update(mat.id, { situacao: 'concluido' }, opts);
    }
    return { leitura: out };
  }

  // ================= edital verticalizado (com versões) =================
  function keyOf_(disc, titulo, pai) { return Utils.norm(disc) + '|' + Utils.norm(pai || '') + '|' + Utils.norm(titulo); }

  /**
   * Grava uma versão do edital a partir de itens revisados pela pessoa.
   * itens: [{disciplina, assunto, subassunto?, item_ref?, pagina?, peso?, qtd_questoes?, descricao?}]
   * dry: devolve a prévia (novos assuntos, itens adicionados/alterados/retirados) sem gravar.
   * Assuntos são reaproveitados por disciplina + título, então o histórico de estudo não duplica.
   */
  /** Número vindo de planilha/edital: aceita "1,5", "1.5", "1.234,5" e vazio. */
  function numBr_(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s0 = String(v).trim().replace(/\s/g, ''); if (!s0) return null;
    var n = Number(/,\d{1,3}$/.test(s0) ? s0.replace(/\./g, '').replace(',', '.') : s0.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  function editalApply(p) {
    var conc = own('est_concursos', p.concurso_id, 'Concurso');
    var itens = (p.itens || []).filter(function (i) { return i && String(i.disciplina || '').trim() && String(i.assunto || '').trim(); });
    if (!itens.length) throw Utils.error('VALIDATION', 'Nenhum item válido: cada linha precisa de disciplina e assunto.');
    if (itens.length > 2000) throw Utils.error('VALIDATION', 'Máximo de 2.000 itens por vez.');
    var discs = T('est_disciplinas').list(), assuntos = T('est_assuntos').list();
    var discByName = {}; discs.forEach(function (d) { discByName[Utils.norm(d.nome)] = d; });
    var assKey = {}; assuntos.forEach(function (a) { var d = discs.filter(function (x) { return x.id === a.disciplina_id; })[0]; var pai = a.pai_id ? (assuntos.filter(function (x) { return x.id === a.pai_id; })[0] || {}).titulo : ''; if (d) assKey[keyOf_(d.nome, a.titulo, pai)] = a; });
    var editais = T('est_editais').list().filter(function (e) { return e.concurso_id === conc.id; });
    var base = p.base_edital_id ? own('est_editais', p.base_edital_id, 'Edital') : editais.filter(function (e) { return e.ativo; }).sort(function (a, b) { return b.versao - a.versao; })[0];
    var baseItens = base ? T('est_edital_itens').list().filter(function (x) { return x.edital_id === base.id && x.alteracao !== 'retirado'; }) : [];
    var baseByAss = {}; baseItens.forEach(function (x) { baseByAss[x.assunto_id] = x; });
    var preview = { novas_disciplinas: [], novos_assuntos: 0, reaproveitados: 0, adicionados: 0, alterados: 0, mantidos: 0, retirados: 0, linhas: [] };
    var plan = [], seen = {};
    var folhas = {}, repetidas = 0;
    itens = itens.filter(function (i) { var k = keyOf_(i.disciplina, i.subassunto || i.assunto, i.subassunto ? i.assunto : ''); if (folhas[k]) { repetidas++; return false; } folhas[k] = 1; return true; });
    preview.repetidas = repetidas;
    itens.forEach(function (i) { i.peso = numBr_(i.peso); i.qtd_questoes = numBr_(i.qtd_questoes); i.pagina = numBr_(i.pagina); });
    itens.forEach(function (i, idx) {
      var dn = String(i.disciplina).trim(), an = String(i.assunto).trim(), sn = String(i.subassunto || '').trim();
      var d = discByName[Utils.norm(dn)];
      if (!d && preview.novas_disciplinas.indexOf(dn) < 0) preview.novas_disciplinas.push(dn);
      var kA = keyOf_(dn, an, ''), kS = sn ? keyOf_(dn, sn, an) : null;
      var a = assKey[kA], sa = kS ? assKey[kS] : null;
      var leafExisting = sn ? sa : a;
      if (!a && !seen[kA]) preview.novos_assuntos++;
      if (sn && !sa && !seen[kS]) preview.novos_assuntos++;
      if (leafExisting) preview.reaproveitados++;
      seen[kA] = 1; if (kS) seen[kS] = 1;
      var prev = leafExisting ? baseByAss[leafExisting.id] : null, alt;
      if (!base) alt = 'mantido';
      else if (!prev) alt = 'adicionado';
      else if (Number(prev.peso || 1) !== Number(i.peso == null ? 1 : i.peso) || Number(prev.qtd_questoes || 0) !== Number(i.qtd_questoes || 0) || String(prev.descricao || '') !== String(i.descricao || prev.descricao || '')) alt = 'alterado';
      else alt = 'mantido';
      if (alt === 'adicionado') preview.adicionados++; else if (alt === 'alterado') preview.alterados++; else preview.mantidos++;
      plan.push({ idx: idx, d: dn, a: an, s: sn, i: i, alt: alt, leaf: leafExisting });
      if (preview.linhas.length < 400) preview.linhas.push({ linha: idx + 1, disciplina: dn, assunto: an, subassunto: sn, item_ref: i.item_ref || '', alteracao: alt });
    });
    var usados = {}; plan.forEach(function (x) { if (x.leaf) usados[x.leaf.id] = 1; });
    var retirados = baseItens.filter(function (x) { return !usados[x.assunto_id]; });
    preview.retirados = retirados.length;
    preview.retirados_lista = retirados.slice(0, 100).map(function (x) { var a = assuntos.filter(function (y) { return y.id === x.assunto_id; })[0]; return a ? a.titulo : x.assunto_id; });
    preview.versao = base ? base.versao + 1 : (editais.length ? Math.max.apply(null, editais.map(function (e) { return e.versao || 1; })) + 1 : 1);
    if (p.dry !== false) return { previa: preview };

    // gravação
    var newDiscs = preview.novas_disciplinas.map(function (n, k) { return { nome: n, ordem: discs.length + k, cor: ['#F2B705', '#5F9E8F', '#8FA3B8', '#C4684A', '#B98900', '#F6D365'][(discs.length + k) % 6] }; });
    if (newDiscs.length) T('est_disciplinas').insertMany(newDiscs).forEach(function (d) { discByName[Utils.norm(d.nome)] = d; });
    var created = {};
    function ensureAss(dn, titulo, paiId, paiTitulo, ordem) {
      var k = keyOf_(dn, titulo, paiTitulo || '');
      if (assKey[k]) return assKey[k];
      if (created[k]) return created[k];
      var a = T('est_assuntos').insert({ disciplina_id: discByName[Utils.norm(dn)].id, pai_id: paiId || null, titulo: titulo, ordem: ordem }, { silent: true });
      created[k] = a; assKey[k] = a; return a;
    }
    var ed = T('est_editais').insert({ concurso_id: conc.id, versao: preview.versao, titulo: (p.edital && p.edital.titulo) || ('Edital v' + preview.versao), data_publicacao: (p.edital && p.edital.data_publicacao) || null, fonte: (p.edital && p.edital.fonte) || null, arquivo_id: (p.edital && p.edital.arquivo_id) || null, observacao: (p.edital && p.edital.observacao) || null, ativo: true });
    editais.forEach(function (e) { if (e.ativo) T('est_editais').update(e.id, { ativo: false }, { silent: true }); });
    var rows = [];
    plan.forEach(function (x, k) {
      var a = ensureAss(x.d, x.a, null, '', k);
      var leaf = x.s ? ensureAss(x.d, x.s, a.id, x.a, k) : a;
      rows.push({ edital_id: ed.id, assunto_id: leaf.id, disciplina_id: discByName[Utils.norm(x.d)].id, item_ref: x.i.item_ref || null, pagina: x.i.pagina || null, descricao: x.i.descricao ? String(x.i.descricao).slice(0, 2000) : null, peso: x.i.peso != null ? x.i.peso : 1, qtd_questoes: x.i.qtd_questoes || null, alteracao: x.alt, ordem: k });
    });
    retirados.forEach(function (x, k) { rows.push({ edital_id: ed.id, assunto_id: x.assunto_id, disciplina_id: x.disciplina_id, item_ref: x.item_ref, pagina: x.pagina, descricao: x.descricao, peso: x.peso, qtd_questoes: x.qtd_questoes, alteracao: 'retirado', ordem: plan.length + k }); });
    T('est_edital_itens').insertMany(rows, { silent: true });
    if (conc.situacao === 'previsto' || conc.situacao === 'autorizado') T('est_concursos').update(conc.id, { situacao: 'edital_publicado' }, { silent: true });
    AppLog.audit('est_editais', 'criar', ed.id, null, { versao: ed.versao, itens: rows.length });
    return { edital: ed, previa: preview, itens: rows.length };
  }

  // ================= importação estruturada (XLSX/CSV já lido no navegador) =================
  var IMPORT = {
    questoes: { chave: 'codigo', campos: ['codigo', 'tipo', 'enunciado', 'a', 'b', 'c', 'd', 'e', 'gabarito', 'gabarito_status', 'explicacao', 'banca', 'orgao', 'cargo', 'ano', 'disciplina', 'assunto', 'dificuldade', 'fonte', 'tags', 'concurso', 'area'] },
    flashcards: { chave: 'frente', campos: ['baralho', 'frente', 'verso', 'disciplina', 'assunto', 'tags'] },
    assuntos: { chave: 'assunto', campos: ['disciplina', 'assunto', 'subassunto', 'item_ref', 'pagina', 'peso', 'qtd_questoes', 'descricao'] }
  };

  /**
   * Valida e importa linhas já mapeadas pelo app. dry=true devolve a prévia (novos, atualizados, erros por linha).
   * Reimportar atualiza só os registros identificados (por código/frente), preservando ids e histórico.
   */
  function importRows(p) {
    var cfg = IMPORT[p.tabela];
    if (!cfg) throw Utils.error('VALIDATION', 'Importação disponível para questões, flashcards e assuntos do edital.');
    var rows = p.rows || [];
    if (rows.length > 3000) throw Utils.error('VALIDATION', 'Máximo de 3.000 linhas por importação. Divida o arquivo.');
    if (p.tabela === 'assuntos') {
      if (!p.concurso_id) throw Utils.error('VALIDATION', 'Escolha o concurso do edital.', 'concurso_id');
      return editalApply({ concurso_id: p.concurso_id, itens: rows.map(function (r) { return { disciplina: r.disciplina, assunto: r.assunto, subassunto: r.subassunto, item_ref: r.item_ref, pagina: r.pagina, peso: r.peso, qtd_questoes: r.qtd_questoes, descricao: r.descricao }; }), dry: p.dry, edital: p.edital });
    }
    var discs = T('est_disciplinas').list(), ass = T('est_assuntos').list();
    var dByName = {}; discs.forEach(function (d) { dByName[Utils.norm(d.nome)] = d; });
    var erros = [], novos = [], atualizar = [], novasDisc = {};
    var t = p.tabela === 'questoes' ? T('est_questoes') : T('est_flashcards'), atuais = t.list();
    ownOpt('est_concursos', p.concurso_id, 'Concurso');
    var concByName = {}, concById = {}; T('est_concursos').list().forEach(function (c) { concByName[Utils.norm(c.nome)] = c; concById[c.id] = c; });
    var byKey = {}; atuais.forEach(function (r) { var k = p.tabela === 'questoes' ? r.codigo : Utils.norm(r.baralho) + '|' + Utils.norm(r.frente); if (k) byKey[k] = r; });
    var vistos = {};
    rows.forEach(function (r, i) {
      var ln = i + (Number(p.linha_inicial) || 2);
      try {
        var d = r.disciplina ? dByName[Utils.norm(r.disciplina)] : null;
        if (r.disciplina && !d) novasDisc[String(r.disciplina).trim()] = 1;
        var a = d && r.assunto ? ass.filter(function (x) { return x.disciplina_id === d.id && Utils.norm(x.titulo) === Utils.norm(r.assunto); })[0] : null;
        var row;
        if (p.tabela === 'questoes') {
          var tipo = Utils.norm(r.tipo || '');
          tipo = /certo|errado|c\/e|ce/.test(tipo) ? 'certo_errado' : /curta/.test(tipo) ? 'curta' : /discurs/.test(tipo) ? 'discursiva' : 'multipla';
          var alts = ['a', 'b', 'c', 'd', 'e'].filter(function (l) { return String(r[l] || '').trim(); }).map(function (l) { return { letra: l.toUpperCase(), texto: String(r[l]).trim() }; });
          if (tipo === 'certo_errado') alts = [{ letra: 'C', texto: 'Certo' }, { letra: 'E', texto: 'Errado' }];
          var gab = String(r.gabarito || '').trim();
          if (tipo === 'certo_errado' && gab) gab = normAnswer_('certo_errado', gab);
          row = { codigo: String(r.codigo || '').trim() || null, tipo: tipo, enunciado: String(r.enunciado || '').trim(), alternativas_json: alts, gabarito: gab || null,
            gabarito_status: /anul/i.test(r.gabarito_status || '') ? 'anulada' : gab ? (/defin/i.test(r.gabarito_status || '') ? 'definitivo' : 'preliminar') : 'sem_gabarito',
            explicacao: r.explicacao || null, banca: r.banca || null, orgao: r.orgao || null, cargo: r.cargo || null, ano: r.ano ? Number(r.ano) : null, dificuldade: r.dificuldade ? Utils.clamp(Number(r.dificuldade), 1, 5) : 3, fonte: r.fonte || null, tags: r.tags || null,
            _disc: r.disciplina || null, _ass: r.assunto || null, disciplina_id: d ? d.id : null, assunto_id: a ? a.id : null,
            texto_base: String(r.texto_base || '').trim() || null, pagina: r.pagina ? Number(r.pagina) || null : null };
          if (row.texto_base && row.texto_base.length > 20000) throw new Error('texto de apoio com mais de 20.000 caracteres');
          var matId = r.material_id || p.material_id || null;
          if (matId) { own('est_materiais', matId, 'Material'); row.material_id = matId; }
          if (r.imagem_arquivo_id) { var arq = T('arquivos').get(r.imagem_arquivo_id); if (!arq || arq.deleted_at) throw new Error('imagem da questão não encontrada'); row.imagem_arquivo_id = r.imagem_arquivo_id; }
          var cRow = r.concurso ? concByName[Utils.norm(r.concurso)] : null;
          if (r.concurso && !cRow) throw new Error('concurso "' + r.concurso + '" não cadastrado (cadastre em Estudos › Concursos ou deixe a coluna vazia)');
          row.concurso_id = cRow ? cRow.id : (p.concurso_id || null);
          row.area = String(r.area || '').trim() || p.area || (cRow && cRow.area) || (!cRow && p.concurso_id && concById[p.concurso_id] ? concById[p.concurso_id].area : null) || null;
          if (!row.enunciado) throw new Error('enunciado vazio');
          if (row.ano && (row.ano < 1950 || row.ano > 2100)) throw new Error('ano inválido');
          if (tipo === 'multipla' && alts.length < 2) throw new Error('múltipla escolha precisa de ao menos 2 alternativas (colunas a…e)');
          if (gab && tipo === 'multipla' && !alts.some(function (x) { return x.letra === gab.toUpperCase().slice(0, 1); })) throw new Error('gabarito "' + gab + '" não é uma das alternativas');
          if (gab && tipo === 'certo_errado' && ['C', 'E'].indexOf(gab) < 0) throw new Error('gabarito de certo/errado deve ser C ou E');
          var k = row.codigo;
          if (k && vistos[k]) throw new Error('código repetido no arquivo (linha ' + vistos[k] + ')');
          if (k) vistos[k] = ln;
          (k && byKey[k] ? atualizar : novos).push({ ln: ln, row: row, atual: k ? byKey[k] : null });
        } else {
          row = { baralho: String(r.baralho || 'Geral').trim().slice(0, 80), frente: String(r.frente || '').trim(), verso: String(r.verso || '').trim(), tags: r.tags || null, _disc: r.disciplina || null, _ass: r.assunto || null, disciplina_id: d ? d.id : null, assunto_id: a ? a.id : null };
          if (!row.frente) throw new Error('frente vazia');
          var kk = Utils.norm(row.baralho) + '|' + Utils.norm(row.frente);
          if (vistos[kk]) throw new Error('cartão repetido no arquivo (linha ' + vistos[kk] + ')');
          vistos[kk] = ln;
          (byKey[kk] ? atualizar : novos).push({ ln: ln, row: row, atual: byKey[kk] || null });
        }
      } catch (e) { erros.push({ linha: ln, mensagem: e.message }); }
    });
    var previa = { novos: novos.length, atualizados: atualizar.length, erros: erros.slice(0, 300), total_erros: erros.length, novas_disciplinas: Object.keys(novasDisc), exemplo: novos.concat(atualizar).slice(0, 8).map(function (x) { return Object.assign({ linha: x.ln, acao: x.atual ? 'atualizar' : 'novo' }, x.row); }) };
    if (p.dry !== false) return { previa: previa };
    if (erros.length && !p.ignorar_erros) throw Utils.error('VALIDATION', erros.length + ' linha(s) com erro. Corrija ou marque "importar só as linhas válidas".');
    var nd = Object.keys(novasDisc).map(function (n, i) { return { nome: n, ordem: discs.length + i }; });
    if (nd.length) T('est_disciplinas').insertMany(nd).forEach(function (d) { dByName[Utils.norm(d.nome)] = d; });
    function resolve(row) {
      var d = row._disc ? dByName[Utils.norm(row._disc)] : null;
      row.disciplina_id = d ? d.id : row.disciplina_id;
      if (d && row._ass && !row.assunto_id) {
        var a = ass.filter(function (x) { return x.disciplina_id === d.id && Utils.norm(x.titulo) === Utils.norm(row._ass); })[0];
        if (!a) { a = T('est_assuntos').insert({ disciplina_id: d.id, titulo: String(row._ass).trim() }, { silent: true }); ass.push(a); }
        row.assunto_id = a.id;
      }
      delete row._disc; delete row._ass; return row;
    }
    var ins = novos.map(function (x) { var r = resolve(x.row); if (p.tabela === 'questoes') { if (r.gabarito) r.gabarito_hist_json = [{ gabarito: r.gabarito, status: r.gabarito_status, em: Utils.nowIso(), motivo: 'importação' }]; } return r; });
    if (p.tabela === 'questoes') { var seq = Number(nextCode_('est_questoes', 'Q').slice(1)); ins.forEach(function (r) { if (!r.codigo) r.codigo = 'Q' + (seq++); }); }
    if (ins.length) t.insertMany(ins);
    var upd = 0;
    atualizar.forEach(function (x) {
      var r = resolve(x.row);
      if (p.tabela === 'questoes') { var gab = r.gabarito, st = r.gabarito_status; delete r.gabarito; delete r.gabarito_status; questionSave(Object.assign({ id: x.atual.id }, r, gab !== undefined && String(gab || '') !== String(x.atual.gabarito || '') ? { gabarito: gab, gabarito_status: st, motivo: 'reimportação' } : {})); }
      else t.update(x.atual.id, r, { silent: true });
      upd++;
    });
    AppLog.info('estudos', 'importar', p.tabela + ': ' + ins.length + ' novos, ' + upd + ' atualizados, ' + erros.length + ' erros');
    return { previa: previa, inseridos: ins.length, atualizados: upd };
  }

  // ================= planejamento =================
  /**
   * Distribuição explicável do tempo semanal entre disciplinas e prévia do cronograma.
   * peso final = peso no edital × fator dificuldade × fator desempenho × fator pendência (cada fator aparece na prévia).
   */
  function planSuggest(p) {
    var plano = own('est_planos', p.plano_id, 'Plano');
    var conc = plano.concurso_id ? T('est_concursos').get(plano.concurso_id) : null;
    var disp = plano.disponibilidade_json || {};
    var cap = [0, 1, 2, 3, 4, 5, 6].reduce(function (s, d) { return s + (Number(disp[d]) || 0); }, 0);
    var folga = Utils.clamp(Number(plano.folga_pct || 0), 0, 60) / 100, capUtil = Math.round(cap * (1 - folga));
    var edital = plano.edital_id ? T('est_editais').get(plano.edital_id) : (conc ? T('est_editais').list().filter(function (e) { return e.concurso_id === conc.id && e.ativo; })[0] : null);
    var itens = edital ? T('est_edital_itens').list().filter(function (x) { return x.edital_id === edital.id && x.alteracao !== 'retirado'; }) : [];
    var ass = T('est_assuntos').list(), discs = T('est_disciplinas').list();
    var since = Utils.addDays(Utils.today(), -45), tent = T('est_tentativas').list().filter(function (t) { return String(t.created_at) >= since; });
    var qById = {}; T('est_questoes').list().forEach(function (q) { qById[q.id] = q; });
    var useDisc = itens.length ? Object.keys(Utils.groupBy(itens, 'disciplina_id')) : discs.map(function (d) { return d.id; });
    var rows = useDisc.map(function (did) {
      var d = discs.filter(function (x) { return x.id === did; })[0]; if (!d) return null;
      var its = itens.filter(function (x) { return x.disciplina_id === did; });
      var as = its.length ? its.map(function (x) { return ass.filter(function (a) { return a.id === x.assunto_id; })[0]; }).filter(Boolean) : ass.filter(function (a) { return a.disciplina_id === did; });
      var pesoEd = its.length ? its.reduce(function (s, x) { return s + (Number(x.qtd_questoes) || Number(x.peso) || 1); }, 0) : Math.max(1, as.length);
      var dif = as.length ? as.reduce(function (s, a) { return s + (Number(a.dificuldade) || 3); }, 0) / as.length : 3;
      var pend = as.length ? as.filter(function (a) { return a.teoria !== 'concluida'; }).length / as.length : 1;
      var td = tent.filter(function (t) { var q = qById[t.questao_id]; return q && q.disciplina_id === did && (t.resultado_atual || t.resultado) !== 'anulada'; });
      var val = td.filter(function (t) { var r = t.resultado_atual || t.resultado; return r === 'certa' || r === 'errada'; });
      var prec = val.length >= 10 ? val.filter(function (t) { return (t.resultado_atual || t.resultado) === 'certa'; }).length / val.length : null;
      var fD = 0.8 + 0.1 * dif, fP = prec == null ? 1 : Utils.clamp(1 + (0.7 - prec), 0.8, 1.4), fC = 0.6 + 0.8 * pend;
      return { disciplina_id: did, nome: d.nome, peso_edital: pesoEd, dificuldade: Math.round(dif * 10) / 10, precisao: prec == null ? null : Math.round(prec * 100), amostra: val.length, pendente_pct: Math.round(pend * 100), f_dificuldade: Math.round(fD * 100) / 100, f_desempenho: Math.round(fP * 100) / 100, f_pendencia: Math.round(fC * 100) / 100, score: pesoEd * fD * fP * fC, assuntos: as.length, pendentes: as.filter(function (a) { return a.teoria !== 'concluida'; }).length };
    }).filter(Boolean);
    var tot = rows.reduce(function (s, r) { return s + r.score; }, 0) || 1, pesos = plano.pesos_json || {};
    rows.forEach(function (r) {
      var ajuste = pesos[r.disciplina_id] != null ? Number(pesos[r.disciplina_id]) : 1;
      r.ajuste = ajuste; r.minutos_semana = Math.round(capUtil * (r.score * ajuste) / tot / 5) * 5;
    });
    // suficiência até a prova
    var esforcoPend = ass.filter(function (a) { return a.teoria !== 'concluida' && (!itens.length || itens.some(function (x) { return x.assunto_id === a.id; })); }).reduce(function (s, a) { return s + (Number(a.esforco_min) || Number(setting('est.esforco_padrao_min', 120))); }, 0);
    var dias = conc && conc.data_prova ? Math.max(0, Utils.diffDays(Utils.today(), conc.data_prova)) : null;
    var capAteProva = dias != null ? Math.round(capUtil / 7 * dias) : null;
    var avisos = [];
    if (!cap) avisos.push('Informe a disponibilidade por dia da semana para o plano calcular a distribuição.');
    if (capAteProva != null && esforcoPend > capAteProva) avisos.push('Tempo insuficiente: faltam cerca de ' + Math.round(esforcoPend / 60) + ' h de teoria pendente e a capacidade até a prova é de ' + Math.round(capAteProva / 60) + ' h. Priorize os assuntos de maior peso ou aumente a disponibilidade.');
    if (dias != null && dias <= 30) avisos.push('Faltam ' + dias + ' dias para a prova: o cronograma reserva mais tempo para revisão e simulados.');
    var preview = schedule_(plano, rows, Number(p.dias) || 7, dias);
    return { plano: plano, capacidade_semana_min: cap, capacidade_util_min: capUtil, folga_pct: Math.round(folga * 100), dias_para_prova: dias, esforco_pendente_min: esforcoPend, capacidade_ate_prova_min: capAteProva, distribuicao: rows.sort(function (a, b) { return b.score - a.score; }), cronograma: preview.itens, conflitos: preview.conflitos, avisos: avisos, criterio: 'peso no edital (questões ou peso de cada item) × dificuldade média (0,8 + 0,1 × nota) × desempenho nas últimas 6 semanas (1 + 0,7 − precisão, só com 10+ respostas) × pendência (0,6 + 0,8 × % de assuntos sem teoria concluída) × seu ajuste manual' };
  }

  /** Prévia de N dias seguindo o ciclo (retoma de ciclo_pos) e respeitando compromissos já marcados. */
  function schedule_(plano, rows, ndias, diasProva) {
    var ciclo = T('est_ciclo_itens').list().filter(function (c) { return c.plano_id === plano.id; }).sort(function (a, b) { return a.ordem - b.ordem; });
    if (!ciclo.length) ciclo = rows.filter(function (r) { return r.minutos_semana > 0; }).map(function (r, i) { return { disciplina_id: r.disciplina_id, minutos: Math.max(Number(plano.sessao_min) || 50, 25), tipo: 'teoria', ordem: i }; });
    var disp = plano.disponibilidade_json || {}, sess = Math.max(15, Number(plano.sessao_min) || 50), pausa = Math.max(0, Number(plano.pausa_min) || 0);
    var tasks = T('tar_tarefas').list().filter(function (t) { return t.status !== 'cancelada' && t.data_vencimento; });
    var ass = T('est_assuntos').list(), out = [], conflitos = [], pos = Number(plano.ciclo_pos) || 0;
    var nextAss = {};
    function assuntoFor(did) {
      var lst = ass.filter(function (a) { return a.disciplina_id === did && a.teoria !== 'concluida'; }).sort(function (a, b) { return (Number(b.prioridade) || 2) - (Number(a.prioridade) || 2) || (a.ordem || 0) - (b.ordem || 0); });
      nextAss[did] = (nextAss[did] || 0); var a = lst[nextAss[did] % Math.max(1, lst.length)]; nextAss[did]++; return a || null;
    }
    if (!ciclo.length) return { itens: [], conflitos: ['Sem disciplinas no plano: cadastre o edital ou o ciclo.'] };
    for (var i = 1; i <= ndias; i++) {
      var date = Utils.addDays(Utils.today(), i), dow = Utils.parseDate(date).getDay();
      var cap = Number(disp[dow]) || 0;
      var fixos = tasks.filter(function (t) { return t.data_vencimento === date && (t.est_chave || t.est_tipo); });
      var ocupado = fixos.reduce(function (s, t) { return s + (Number(t.duracao_estimada_min) || sess); }, 0);
      var livre = cap - ocupado;
      if (cap > 0 && livre < sess) { conflitos.push(Utils.brDate(date) + ': ' + (ocupado ? 'compromissos de estudo já ocupam o dia' : 'disponibilidade menor que uma sessão')); continue; }
      var guard = 0;
      while (livre >= sess && guard++ < 20) {
        var c = ciclo[pos % ciclo.length]; pos++;
        var reviewDay = diasProva != null && diasProva - i <= 30 && guard % 3 === 0;
        var tipo = reviewDay ? 'revisao' : (c.tipo || 'teoria');
        var a = c.assunto_id ? ass.filter(function (x) { return x.id === c.assunto_id; })[0] : (tipo === 'teoria' ? assuntoFor(c.disciplina_id) : null);
        var mins = Math.min(livre, Math.max(sess, Number(c.minutos) || sess));
        out.push({ data: date, disciplina_id: c.disciplina_id, assunto_id: a ? a.id : null, tipo: tipo, minutos: mins, chave: 'plan:' + plano.id + ':' + date + ':' + out.filter(function (x) { return x.data === date; }).length });
        livre -= mins + pausa;
      }
    }
    return { itens: out, conflitos: conflitos, pos_final: pos };
  }

  /** Cria as tarefas escolhidas da prévia (idempotente por chave) sem mexer em prazos oficiais nem no passado. */
  function planApply(p) {
    var plano = own('est_planos', p.plano_id, 'Plano');
    var hoje = Utils.today(), have = {}, discs = {}, ass = {};
    T('tar_tarefas').list().forEach(function (t) { if (t.est_chave) have[t.est_chave] = t; });
    T('est_disciplinas').list().forEach(function (d) { discs[d.id] = d; });
    T('est_assuntos').list().forEach(function (a) { ass[a.id] = a; });
    var rows = [], pulados = 0;
    (p.itens || []).forEach(function (x) {
      if (!x.chave || !/^plan:/.test(x.chave) || have[x.chave]) { pulados++; return; }
      if (!x.data || x.data <= hoje) { pulados++; return; }
      if (!discs[x.disciplina_id]) throw Utils.error('NOT_FOUND', 'Disciplina não encontrada.');
      if (x.assunto_id && !ass[x.assunto_id]) throw Utils.error('NOT_FOUND', 'Assunto não encontrado.');
      var label = { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão', simulado: 'Simulado', discursiva: 'Discursiva' }[x.tipo] || 'Estudo';
      rows.push({ titulo: label + ' · ' + discs[x.disciplina_id].nome + (x.assunto_id ? ' — ' + ass[x.assunto_id].titulo : ''), data_vencimento: x.data, duracao_estimada_min: Number(x.minutos) || null, prioridade: 2, status: 'a_fazer', est_concurso_id: plano.concurso_id || null, est_disciplina_id: x.disciplina_id, est_assunto_id: x.assunto_id || null, est_tipo: x.tipo || 'teoria', est_chave: x.chave, est_criterio: x.tipo === 'questoes' ? 'Resolver e registrar as questões' : 'Encerrar a sessão de estudo com o resumo do que viu' });
    });
    var saved = rows.length ? T('tar_tarefas').insertMany(rows) : [];
    if (p.ciclo_pos != null) T('est_planos').update(plano.id, { ciclo_pos: Number(p.ciclo_pos) }, { silent: true });
    return { criadas: saved.length, puladas: pulados, tarefas: saved };
  }

  /** Exporta cartões (CSV no Drive, mesmo formato da importação). */
  function exportCards(p) {
    var discs = {}; T('est_disciplinas').list().forEach(function (d) { discs[d.id] = d.nome; });
    var ass = {}; T('est_assuntos').list().forEach(function (a) { ass[a.id] = a.titulo; });
    var rows = T('est_flashcards').list().filter(function (c) { return !p.baralho || c.baralho === p.baralho; });
    var q = function (v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = [['baralho', 'frente', 'verso', 'disciplina', 'assunto', 'tags']].concat(rows.map(function (c) { return [c.baralho, c.frente, c.verso, discs[c.disciplina_id] || '', ass[c.assunto_id] || '', c.tags || '']; })).map(function (r) { return r.map(q).join(';'); }).join('\n');
    var f = StudyFiles.folder_('exportacoes').createFile(Utilities.newBlob('\uFEFF' + csv, 'text/csv', 'flashcards_' + Utils.fmt(new Date(), 'yyyyMMdd_HHmm') + '.csv'));
    return { total: rows.length, url: 'https://drive.google.com/file/d/' + f.getId() + '/view' };
  }

  // ================= métricas para Metas =================
  /** Valor atual das metas automáticas de Estudos (usado por Goals.currentValue). */
  function goalValue(m) {
    var since = m.data_inicio || '0000';
    switch (m.origem_metrica) {
      case 'est_horas': return Math.round(T('est_sessoes').list().filter(function (s) { return s.status === 'encerrada' && String(s.inicio).slice(0, 10) >= since; }).reduce(function (a, s) { return a + (Number(s.liquido_s) || 0); }, 0) / 360) / 10;
      case 'est_questoes': return T('est_tentativas').list().filter(function (t) { return String(t.created_at).slice(0, 10) >= since; }).length;
      case 'est_precisao': {
        var v = T('est_tentativas').list().filter(function (t) { var r = t.resultado_atual || t.resultado; return String(t.created_at).slice(0, 10) >= since && (r === 'certa' || r === 'errada'); });
        return v.length ? Math.round(v.filter(function (t) { return (t.resultado_atual || t.resultado) === 'certa'; }).length / v.length * 1000) / 10 : 0;
      }
      case 'est_revisoes': return T('est_revisoes').list().filter(function (r) { return r.status === 'feita' && String(r.feita_em).slice(0, 10) >= since; }).length;
      case 'est_redacoes': return T('est_discursivas').list().filter(function (d) { return d.status !== 'rascunho' && String(d.created_at).slice(0, 10) >= since; }).length;
      case 'est_cobertura': return StudyReports.coverage(m.origem_id || null).pct || 0;
      default: return Number(m.valor_atual || 0);
    }
  }

  return { routes: routes, goalValue: goalValue, judge_: judge_, score_: score_, rangesToSet_: rangesToSet_, intervals: intervals, own: own, openSession_: openSession_ };
})();
