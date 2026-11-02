/**
 * Telegram (Bot API oficial, gratuita): avisos do Prumo no Telegram, sem servidor próprio.
 *
 * - O dono cria um bot no @BotFather e cola o token em Configurações › Telegram (fica só nas propriedades do script).
 * - Cada pessoa conecta o próprio Telegram por um link (t.me/<bot>?start=<código>) e toca em "Iniciar".
 * - Recebimento por consulta (getUpdates) a cada 5 min no gatilho triggerTelegram, ou na hora pelo botão "Verificar":
 *   evita o webhook, que o Apps Script responde com redirecionamento 302.
 * - Envio por sendMessage (HTML). Sem janela de 24 h e sem custo; limite diário por pessoa contra excesso.
 * - Comandos: /hoje (resumo do dia), /ajuda, /parar (desliga os avisos automáticos).
 * - Chave de deduplicação por envio; vários avisos viram uma mensagem só; update_id controla o que já foi lido.
 */

/** Rode no editor para ver a situação do bot (sem mostrar o token). */
function telegramStatus() { console.log(JSON.stringify(Telegram.adminInfo_(), null, 2)); }

/** Gatilho (5 min): lê as mensagens novas do bot. */
function triggerTelegram() { Telegram.poll_(); }

var Telegram = (function () {
  var API = 'https://api.telegram.org/bot';
  var DEF_DIA = 30, MAX_DIA = 200;
  var TIPOS = ['alarme', 'tarefa', 'rotina', 'evento', 'conta', 'fatura', 'meta', 'sistema'];
  var DEF_TIPOS = ['alarme', 'tarefa', 'rotina', 'evento', 'conta', 'fatura', 'meta'];
  var ROTULO = { alarme: 'Alarme', tarefa: 'Tarefa', rotina: 'Rotina', evento: 'Evento', conta: 'Conta', fatura: 'Fatura', meta: 'Meta', sistema: 'Prumo' };

  function props_() { return PropertiesService.getScriptProperties(); }
  function cfg_() {
    var p = props_().getProperties();
    return { token: p.TG_TOKEN || '', bot: p.TG_BOT_USERNAME || '', nome: p.TG_BOT_NOME || '', ativo: p.TG_ATIVO !== 'false' };
  }
  function owner_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }
  function esc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function mask_(s) { s = String(s || ''); return s ? '••••' + s.slice(-4) : ''; }
  /** Nunca deixa o token aparecer em log ou mensagem de erro (ele vai na URL da API). */
  function scrub_(s) { var t = cfg_().token; s = String(s || ''); return t ? s.split(t).join('<token>') : s; }

  // ---------- preferências do usuário (aba configuracoes) ----------
  function saveVals_(vals) {
    var out = {};
    Object.keys(vals).forEach(function (k) { out[k] = typeof vals[k] === 'string' ? JSON.stringify(vals[k]) : vals[k]; });
    Auth.saveSettings({ values: out });
  }
  function user_() {
    var s = Auth.settings();
    var g = function (k, def) { var v = s['tg.' + k]; return v === undefined || v === null ? def : v; };
    return {
      chatId: g('chat_id', '') ? String(g('chat_id', '')) : '', nome: String(g('nome', '') || ''),
      ativo: g('ativo', false) === true, automatico: g('automatico', false) === true, resumo: g('resumo', false) === true,
      // Alarmes chegaram na 1.5: entram para quem já tinha escolhido tipos, a menos que a pessoa desmarque
      tipos: (function (t) { t = Array.isArray(t) ? t.slice() : DEF_TIPOS.slice(); if (t.indexOf('alarme') < 0 && g('sem_alarme', false) !== true) t.unshift('alarme'); return t; })(g('tipos', null)),
      limiteDia: Math.max(1, Math.min(MAX_DIA, Number(g('limite_dia', DEF_DIA)) || DEF_DIA)), desde: String(g('desde', '') || '')
    };
  }
  function tabela_() { return Db.table('tg_mensagens'); }

  // ---------- chamada à Bot API ----------
  function call_(method, body, token) {
    token = token || cfg_().token;
    if (!token) throw Utils.error('VALIDATION', 'Configure o token do bot em Configurações › Telegram.');
    var res = UrlFetchApp.fetch(API + token + '/' + method, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body || {}), muteHttpExceptions: true });
    var json = {}; try { json = JSON.parse(res.getContentText()); } catch (e) { json = {}; }
    return { http: res.getResponseCode(), ok: json.ok === true, result: json.result, desc: json.description || '', code: json.error_code || res.getResponseCode(), retry: json.parameters && json.parameters.retry_after };
  }
  function erro_(r) {
    var M = {
      401: 'Token do bot inválido. Gere de novo no @BotFather (/token) e salve.',
      403: 'O bot foi bloqueado ou a conversa foi apagada no Telegram. Conecte de novo.',
      400: 'O Telegram recusou a mensagem: ' + r.desc,
      429: 'Limite de velocidade do Telegram. O Prumo tenta de novo depois.'
    };
    return { codigo: String(r.code), mensagem: M[r.code] || ('Telegram: ' + scrub_(r.desc || ('HTTP ' + r.http))) };
  }

  /** Envia texto (HTML) para o chat do usuário atual. */
  function enviar_(texto, chave, origem, refIds, chatId) {
    var u = user_(), t = tabela_(), c = cfg_();
    chatId = chatId || u.chatId;
    var base = { direcao: 'saida', chave: chave, origem: origem, ref_ids: (refIds || []).join(',').slice(0, 1800), chat_id: chatId, corpo: String(texto).replace(/<[^>]+>/g, '').slice(0, 1000) };
    if (chave && t.list().some(function (m) { return m.chave === chave && m.status === 'enviado'; })) return { status: 'duplicado' };
    var bloq = function (motivo) { t.insert(Object.assign(base, { status: 'bloqueado', erro_msg: motivo }), { silent: true }); return { status: 'bloqueado', erro: { mensagem: motivo } }; };
    if (!c.token) return bloq('Bot do Telegram não configurado.');
    if (!c.ativo) return bloq('O bot está desligado pelo dono do app.');
    if (!chatId) return bloq('Conecte o seu Telegram primeiro.');
    var hoje = Utils.today();
    var n = t.list().filter(function (m) { return m.direcao === 'saida' && m.status === 'enviado' && String(m.created_at).slice(0, 10) === hoje; }).length;
    if (origem !== 'resposta' && n >= u.limiteDia) return bloq('Limite diário de ' + u.limiteDia + ' mensagens atingido.');
    var r;
    try { r = call_('sendMessage', { chat_id: chatId, text: String(texto).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }); }
    catch (ex) { t.insert(Object.assign(base, { status: 'falhou', erro_codigo: 'rede', erro_msg: scrub_(ex.message).slice(0, 300) }), { silent: true }); AppLog.warn('telegram', 'envio', scrub_(ex.message)); return { status: 'falhou', erro: { mensagem: 'Falha de comunicação com o Telegram.' } }; }
    if (r.ok) {
      t.insert(Object.assign(base, { status: 'enviado', msg_id: String(r.result && r.result.message_id || '') }), { silent: true });
      AppLog.info('telegram', 'enviado', 'Mensagem enviada (' + origem + ')');
      return { status: 'enviado' };
    }
    var er = erro_(r);
    t.insert(Object.assign(base, { status: 'falhou', erro_codigo: er.codigo, erro_msg: er.mensagem }), { silent: true });
    AppLog.warn('telegram', 'falhou', er.codigo + ' · ' + er.mensagem);
    if (r.code === 403) { saveVals_({ 'tg.ativo': false }); }
    if (r.code === 401) { props_().setProperty('TG_ATIVO', 'false'); AppLog.error('telegram', 'token', new Error('Token do bot inválido: envios desligados até salvar um token novo.')); }
    return { status: 'falhou', erro: er };
  }

  // ---------- rotas ----------
  function adminInfo_() { var c = cfg_(); return { configurado: !!c.token, ativo: c.ativo, bot: c.bot, nome: c.nome, token: mask_(c.token), offset: Number(props_().getProperty('TG_OFFSET') || 0) }; }

  function status() {
    var u = user_(), info = adminInfo_(), dono = Auth.email() === owner_();
    if (!dono) delete info.token;
    var hoje = Utils.today();
    var rows = tabela_().list();
    return {
      dono: dono, bot: info, tipos: TIPOS,
      usuario: { conectado: !!u.chatId, nome: u.nome, ativo: u.ativo, automatico: u.automatico, resumo: u.resumo, tipos: u.tipos, limiteDia: u.limiteDia },
      uso: { hoje: rows.filter(function (m) { return m.direcao === 'saida' && m.status === 'enviado' && String(m.created_at).slice(0, 10) === hoje; }).length },
      historico: rows.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 25)
        .map(function (m) { return { direcao: m.direcao, status: m.status, origem: m.origem, corpo: String(m.corpo || '').slice(0, 160), erro: m.erro_msg || '', em: m.created_at }; })
    };
  }

  /** Rota (dono): salva o token, confere com getMe, desliga webhook antigo e garante o gatilho de leitura. */
  function saveConfig(p) {
    var pr = props_();
    if (p.token) {
      var tk = String(p.token).trim();
      if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(tk)) throw Utils.error('VALIDATION', 'Token inválido: ele tem o formato 123456789:AAH… (copie inteiro do @BotFather).', 'token');
      var me = call_('getMe', {}, tk);
      if (!me.ok) throw Utils.error('VALIDATION', me.code === 401 ? 'O Telegram não reconheceu esse token. Copie de novo do @BotFather.' : 'Telegram: ' + me.desc, 'token');
      call_('deleteWebhook', { drop_pending_updates: false }, tk);
      pr.setProperties({ TG_TOKEN: tk, TG_BOT_USERNAME: me.result.username || '', TG_BOT_NOME: me.result.first_name || '', TG_ATIVO: 'true' });
      ensureTrigger_();
      AppLog.audit('telegram', 'configurar', 'bot', null, { bot: me.result.username });   // nunca registra o token
    }
    if (p.ativo !== undefined) { pr.setProperty('TG_ATIVO', p.ativo === true ? 'true' : 'false'); AppLog.audit('telegram', 'configurar', 'bot', null, { ativo: p.ativo === true }); }
    return status();
  }

  function ensureTrigger_() {
    try {
      if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'triggerTelegram' || t.getHandlerFunction() === 'triggerFrequente'; })) ScriptApp.newTrigger('triggerFrequente').timeBased().everyMinutes(5).create();
    } catch (e) { AppLog.warn('telegram', 'gatilho', 'Rode setup() para criar o gatilho do Telegram: ' + e.message); }
  }

  /** Rota: gera o link de conexão (vale 30 min). */
  function linkCode() {
    var c = cfg_();
    if (!c.token || !c.bot) throw Utils.error('VALIDATION', 'O dono do app ainda não configurou o bot do Telegram.');
    var code = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    CacheService.getScriptCache().put('tg_link_' + code, Auth.email(), 1800);
    return { url: 'https://t.me/' + c.bot + '?start=' + code, bot: c.bot };
  }

  /** Rota: lê as mensagens novas na hora (o gatilho faz isso a cada 5 min). */
  function pollRoute() { var n = poll_(); var s = status(); s.lidas = n; return s; }

  function saveUser(p) {
    var vals = {};
    ['ativo', 'automatico', 'resumo'].forEach(function (k) { if (p[k] !== undefined) vals['tg.' + k] = p[k] === true; });
    if (vals['tg.ativo'] === true && !user_().chatId) throw Utils.error('VALIDATION', 'Conecte o seu Telegram primeiro.');
    if (p.automatico === true) vals['tg.desde'] = Utils.nowIso();
    if (p.tipos !== undefined) vals['tg.tipos'] = (p.tipos || []).filter(function (x) { return TIPOS.indexOf(x) >= 0; });
    if (p.tipos !== undefined) vals['tg.sem_alarme'] = (p.tipos || []).indexOf('alarme') < 0;
    if (p.limiteDia !== undefined) {
      var n = Math.round(Number(p.limiteDia));
      if (!(n >= 1 && n <= MAX_DIA)) throw Utils.error('VALIDATION', 'Limite diário de 1 a ' + MAX_DIA + '.', 'limiteDia');
      vals['tg.limite_dia'] = n;
    }
    saveVals_(vals);
    return status();
  }

  function unlink() {
    var u = user_();
    if (u.chatId) props_().deleteProperty('TG_CHAT_' + u.chatId);
    saveVals_({ 'tg.chat_id': '', 'tg.nome': '', 'tg.ativo': false, 'tg.automatico': false });
    AppLog.info('telegram', 'desconectado', 'Telegram desconectado');
    return status();
  }

  function sendTest() {
    var r = enviar_('<b>Prumo</b>\nTeste de envio pelo Telegram em ' + Utils.fmt(new Date(), 'dd/MM HH:mm') + '. Está tudo certo.', 'teste:' + Utils.fmt(new Date(), 'yyyy-MM-dd HH:mm'), 'teste', []);
    if (r.status === 'falhou' || r.status === 'bloqueado') throw Utils.error('VALIDATION', r.erro.mensagem);
    return { resultado: r.status, status: status() };
  }

  // ---------- recebimento (getUpdates) ----------
  /** Lê e trata as mensagens novas de todos. Seguro para rodar em paralelo (trava) e idempotente (offset). */
  function poll_() {
    var c = cfg_();
    if (!c.token) return 0;
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return 0;
    var quem = Auth.email(), lidas = 0, dono = owner_();
    AppLog.begin('telegram.poll', 'telegram');
    try {
      var offset = Number(props_().getProperty('TG_OFFSET') || 0);
      var r = call_('getUpdates', { offset: offset, timeout: 0, limit: 50, allowed_updates: ['message'] });
      if (!r.ok) { AppLog.warn('telegram', 'leitura', erro_(r).mensagem); return 0; }
      (r.result || []).forEach(function (up) {
        // Recepção durável: o update é registrado antes de ser tratado; se já foi tratado, só avança o offset.
        Auth.as(dono);
        var tu = Db.table('tg_updates'), reg = tu.list().filter(function (x) { return x.update_id === String(up.update_id); })[0];
        if (reg && (reg.status === 'processado' || reg.status === 'ignorado')) { offset = Math.max(offset, up.update_id + 1); props_().setProperty('TG_OFFSET', String(offset)); return; }
        var m = up.message || {};
        if (!reg) reg = tu.insert({ update_id: String(up.update_id), chat_id: m.chat ? String(m.chat.id) : '', tipo: m.document ? 'documento' : m.photo ? 'foto' : 'texto', texto: String(m.text || m.caption || '').slice(0, 500), status: 'recebido' }, { silent: true });
        var st = 'processado', er = null;
        try { handle_(up); lidas++; } catch (e) { st = 'erro'; er = scrub_(e.message).slice(0, 300); AppLog.error('telegram', 'update', new Error(er)); }
        Auth.as(dono);
        try { Db.table('tg_updates').update(reg.id, { status: st, erro: er }, { silent: true }); } catch (x) { /* registro removido */ }
        offset = Math.max(offset, up.update_id + 1);
        props_().setProperty('TG_OFFSET', String(offset));   // avança depois de registrar e tratar
      });
    } finally {
      AppLog.flush();
      Auth.as(quem);
      try { lock.releaseLock(); } catch (e) { /* ok */ }
    }
    return lidas;
  }

  function handle_(up) {
    var m = up.message;
    if (!m || !m.chat || m.chat.type !== 'private') return;
    var chatId = String(m.chat.id), texto = String(m.text || m.caption || '').trim(), nome = (m.from && (m.from.first_name || m.from.username)) || '';
    var start = texto.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})$/);
    if (start) {
      var email = CacheService.getScriptCache().get('tg_link_' + start[1]);
      if (!email) { call_('sendMessage', { chat_id: chatId, text: 'Esse link venceu. Gere outro em Configurações › Telegram no Prumo.' }); return; }
      CacheService.getScriptCache().remove('tg_link_' + start[1]);
      var antigo = props_().getProperty('TG_CHAT_' + chatId);
      if (antigo && antigo !== email) { Auth.as(antigo); saveVals_({ 'tg.chat_id': '', 'tg.ativo': false, 'tg.automatico': false }); }
      Auth.as(email);
      var anterior = user_().chatId; if (anterior && anterior !== chatId) props_().deleteProperty('TG_CHAT_' + anterior);
      props_().setProperty('TG_CHAT_' + chatId, email);
      saveVals_({ 'tg.chat_id': chatId, 'tg.nome': nome, 'tg.ativo': true });
      tabela_().insert({ direcao: 'entrada', status: 'recebido', origem: 'conexao', chave: 'in:' + up.update_id, chat_id: chatId, corpo: '/start' }, { silent: true });
      AppLog.audit('telegram', 'conectar', 'chat', null, { nome: nome });
      enviar_('<b>Prumo conectado</b>\nOlá, ' + esc_(nome) + '! A partir de agora os avisos do Prumo podem chegar aqui.\n\nComandos: /hoje (resumo do dia) · /ajuda · /parar', 'conectado:' + chatId + ':' + up.update_id, 'resposta', []);
      return;
    }
    var dono = props_().getProperty('TG_CHAT_' + chatId);
    if (!dono) { call_('sendMessage', { chat_id: chatId, text: 'Este bot é do Prumo. Para conectar, toque em "Conectar meu Telegram" em Configurações › Telegram no app.' }); return; }
    Auth.as(dono);
    tabela_().insert({ direcao: 'entrada', status: 'recebido', origem: m.document || m.photo ? 'arquivo' : 'comando', chave: 'in:' + up.update_id, chat_id: chatId, corpo: (m.document ? '[arquivo] ' + (m.document.file_name || '') + ' ' : m.photo ? '[foto] ' : '') + texto.slice(0, 500) }, { silent: true });
    if (StudyTelegram.handle(up, m, chatId, texto)) return;
    var cmd = canon(texto) || texto.toLowerCase().split(/\s+/)[0];
    if (cmd === '/hoje' || cmd === 'hoje') enviar_(resumoHoje_(), 'resp:' + up.update_id, 'resposta', []);
    else if (cmd === '/parar') { saveVals_({ 'tg.automatico': false }); enviar_('Avisos automáticos desligados. Para ligar de novo, vá em Configurações › Telegram no Prumo.', 'resp:' + up.update_id, 'resposta', []); }
    else enviar_((texto.charAt(0) === '/' && !canon(texto) ? 'Não conheço o comando ' + esc_(texto.split(/\s+/)[0].slice(0, 40)) + '. Veja a lista abaixo ou todas as funções em /funcoes.\n\n' : '') + ajuda_(), 'resp:' + up.update_id, 'resposta', []);
  }

  function resumoHoje_() {
    var hoje = Utils.today();
    var tarefas = Db.table('tar_tarefas').list().filter(function (x) { return x.status !== 'feito' && x.status !== 'cancelada' && x.data_vencimento && x.data_vencimento <= hoje; });
    var rotinas = Routines.forDate(hoje);
    var contas = Db.table('fin_lancamentos').list().filter(function (l) { return l.status !== 'pago' && l.tipo === 'despesa' && l.data <= Utils.addDays(hoje, 3); });
    var out = ['<b>Prumo · hoje, ' + Utils.brDate(hoje) + '</b>', ''];
    out.push('<b>Rotinas</b>'); out.push(rotinas.length ? rotinas.slice(0, 8).map(function (r) { return '• ' + (r.hora_inicio ? r.hora_inicio + ' ' : '') + esc_(r.titulo); }).join('\n') : 'Nenhuma rotina hoje.');
    out.push(''); out.push('<b>Tarefas</b>'); out.push(tarefas.length ? tarefas.slice(0, 8).map(function (x) { return '• ' + esc_(x.titulo) + (x.data_vencimento < hoje ? ' <i>(atrasada)</i>' : ''); }).join('\n') : 'Nada pendente.');
    if (contas.length) { out.push(''); out.push('<b>Contas a vencer</b>'); out.push(contas.slice(0, 6).map(function (l) { return '• ' + esc_(l.descricao) + ' — ' + Utils.money(l.valor) + ' (' + Utils.brDate(l.data).slice(0, 5) + ')'; }).join('\n')); }
    return out.join('\n');
  }
  function ajuda_() { return ajudaText(); }

  // ---------- envio automático (gatilhos) ----------
  /** Junta as notificações novas do usuário numa mensagem só (só com autorização explícita). */
  function dispatch() {
    var u = user_(), c = cfg_();
    if (!c.token || !c.ativo || !u.ativo || !u.automatico || !u.chatId) return { enviados: 0 };
    var feitas = {};
    tabela_().list().forEach(function (m) { if (m.direcao === 'saida' && m.status === 'enviado') String(m.ref_ids || '').split(',').forEach(function (id) { if (id) feitas[id] = 1; }); });
    var desde = u.desde || Utils.nowIso(), limiteIdade = new Date(Date.now() - 12 * 3600000).toISOString();
    var novas = Db.table('notificacoes').list().filter(function (n) {
      return !n.lida && !feitas[n.id] && u.tipos.indexOf(n.tipo || 'sistema') >= 0 && String(n.created_at) >= String(desde) && new Date(n.created_at).toISOString() >= limiteIdade;
    }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; }).slice(0, 10);
    if (!novas.length) return { enviados: 0 };
    var hoje = Utils.today(), jaHoje = tabela_().list().filter(function (m) { return m.direcao === 'saida' && String(m.created_at).slice(0, 10) === hoje && (m.status === 'enviado' || (m.status === 'bloqueado' && /Limite/.test(m.erro_msg || ''))); });
    if (jaHoje.some(function (m) { return m.status === 'bloqueado'; }) && jaHoje.filter(function (m) { return m.status === 'enviado'; }).length >= u.limiteDia) return { enviados: 0, status: 'limite' };
    var linhas = novas.map(function (n) { return '• <b>' + (ROTULO[n.tipo] || 'Prumo') + ':</b> ' + esc_(n.titulo) + (n.corpo ? ' — ' + esc_(n.corpo) : ''); });
    var texto = '<b>' + (novas.length === 1 ? 'Prumo' : 'Prumo · ' + novas.length + ' avisos') + '</b>\n' + linhas.join('\n');
    var ids = novas.map(function (n) { return n.id; });
    var r = enviar_(texto, 'lote:' + Utils.sha256(ids.join(',')).slice(0, 32), 'automatico', ids);
    return { enviados: r.status === 'enviado' ? 1 : 0, status: r.status };
  }

  /** Resumo do dia às 7h, para quem ligou. */
  function daily() {
    var u = user_(), c = cfg_();
    if (!c.token || !c.ativo || !u.ativo || !u.resumo || !u.chatId) return;
    enviar_(resumoHoje_(), 'resumo:' + Utils.today(), 'resumo', []);
  }

  // ================= catálogo de comandos (tela Configurações › Telegram › Comandos e menu "/" do bot) =================
  /** Fonte única dos comandos aceitos hoje. O teste manda cada exemplo ao bot e confere que foi tratado. */
  var COMANDOS = [
    { grupo: 'Geral', cmd: '/start', exemplo: '/start', desc: 'Conecta o seu Telegram ao Prumo (vem pelo link "Conectar meu Telegram" do app). Sem o código do link, mostra a ajuda.', menu: false },
    { grupo: 'Geral', cmd: '/hoje', exemplo: '/hoje', desc: 'Resumo do dia: rotinas, tarefas pendentes e contas a vencer. Também funciona escrevendo só "hoje".', menu: 'Resumo do dia (rotinas, tarefas, contas)' },
    { grupo: 'Geral', cmd: '/parar', exemplo: '/parar', desc: 'Desliga os avisos automáticos gerais (alarmes, tarefas, contas). Para ligar de novo: Configurações › Telegram no app.', menu: 'Desligar os avisos automáticos' },
    { grupo: 'Geral', cmd: '/ajuda', exemplo: '/ajuda', aliases: ['/help'], desc: 'Lista curta dos comandos.', menu: 'Lista curta de comandos' },
    { grupo: 'Geral', cmd: '/funcoes', exemplo: '/funcoes', aliases: ['/comandos'], desc: 'Todas as funções, por grupo, com explicação e exemplo.', menu: 'Todas as funções, com exemplos' },
    { grupo: 'Estudos', cmd: '/estudos', exemplo: '/estudos', desc: 'Menu de Estudos com opções numeradas (hoje, progresso, revisões, plano, relatório, concurso): responda com o número.', menu: 'Menu de Estudos' },
    { grupo: 'Estudos', cmd: '/estudos_hoje', exemplo: '/estudos_hoje', desc: 'Atividades de estudo e revisões de hoje.', menu: 'Atividades e revisões de hoje' },
    { grupo: 'Estudos', cmd: '/concursos', exemplo: '/concursos', desc: 'Escolhe o concurso usado como contexto nos outros comandos.', menu: 'Escolher o concurso' },
    { grupo: 'Estudos', cmd: '/plano', args: '[semana]', exemplo: '/plano semana', desc: 'Plano de estudo do dia ou, com "semana", da semana.', menu: 'Plano do dia ou da semana' },
    { grupo: 'Estudos', cmd: '/progresso', exemplo: '/progresso', desc: 'Indicadores dos últimos 7 dias (horas, questões, precisão, revisões), com os totais usados no cálculo.', menu: 'Progresso dos últimos 7 dias' },
    { grupo: 'Estudos', cmd: '/revisoes', exemplo: '/revisoes', desc: 'Revisões pendentes (atrasadas primeiro).', menu: 'Revisões pendentes' },
    { grupo: 'Estudos', cmd: '/erros', args: 'termo', exemplo: '/erros crase', desc: 'Caderno de erros filtrado pelo termo.', menu: 'Caderno de erros' },
    { grupo: 'Estudos', cmd: '/flashcards', args: 'termo', exemplo: '/flashcards crase', desc: 'Cartões que vencem hoje (ou do termo) para revisar no chat.', menu: 'Flashcards' },
    { grupo: 'Estudos', cmd: '/questoes', args: 'termo', exemplo: '/questoes crase', desc: 'Série de até 5 questões do banco: responda com a letra; o placar sai no fim.', menu: 'Treinar questões' },
    { grupo: 'Estudos', cmd: '/parar_estudos', exemplo: '/parar_estudos', desc: 'Desliga só os avisos automáticos de Estudos (os pedidos continuam funcionando).', menu: 'Desligar avisos de Estudos' },
    { grupo: 'IA', cmd: '/ia', args: 'pergunta', exemplo: '/ia diferença entre aval e fiança', desc: 'Pergunta ao assistente (modelo padrão escolhido pelo dono). Funciona só com a IA configurada; a resposta chega pela fila.', menu: 'Perguntar ao assistente de IA', ia: true },
    { grupo: 'IA', cmd: '/gerar_questoes', args: 'tema [quantidade]', exemplo: '/gerar_questoes garantias 3', aliases: ['/gerarquestoes'], desc: 'A IA cria até 10 questões, guarda no banco como "geradas por IA, a revisar" (gabarito preliminar) e começa a série no chat.', menu: 'Gerar questões com IA', ia: true },
    { grupo: 'IA', cmd: '/resumo_ia', args: 'tema', exemplo: '/resumo_ia sistema financeiro nacional', desc: 'Resumo pela IA usando suas anotações e PDFs sobre o tema; vira anotação (rascunho).', menu: 'Resumo pela IA', ia: true },
    { grupo: 'IA', cmd: '/resumir', args: 'código páginas', exemplo: '/resumir M1 1-5', desc: 'Resumo novo das páginas do PDF: pela IA, se configurada (rascunho identificado); senão, compilação das suas marcações.', menu: 'Resumir páginas de um PDF' },
    { grupo: 'Arquivos e relatórios', cmd: '/materiais', args: 'termo', exemplo: '/materiais português', desc: 'Busca na biblioteca e lista os materiais numerados para você escolher.', menu: 'Buscar na biblioteca' },
    { grupo: 'Arquivos e relatórios', cmd: '/pdf', args: 'código [anotado]', exemplo: '/pdf M1', desc: 'Envia o PDF original ou, com "anotado", a cópia com as suas marcações (avisa se a cópia for de uma revisão antiga).', menu: 'Receber um PDF da biblioteca' },
    { grupo: 'Arquivos e relatórios', cmd: '/resumo', args: 'assunto', exemplo: '/resumo crase', desc: 'Suas anotações e resumos salvos sobre o assunto.', menu: 'Minhas anotações sobre um assunto' },
    { grupo: 'Arquivos e relatórios', cmd: '/relatorio', args: '[hoje|semana|mes] [pdf]', exemplo: '/relatorio semana', desc: 'Relatório de estudos em texto ou em PDF.', menu: 'Relatório de estudos' },
    { grupo: 'Arquivos e relatórios', cmd: '/status', args: 'código', exemplo: '/status J1', desc: 'Situação de um pedido da fila (J1, J2…).', menu: 'Situação de um pedido' },
    { grupo: 'Arquivos e relatórios', cmd: '/cancelar', args: 'código', exemplo: '/cancelar J1', desc: 'Cancela um pedido da fila que ainda não foi enviado.', menu: 'Cancelar um pedido' }
  ];
  var GRUPOS = ['Geral', 'Estudos', 'IA', 'Arquivos e relatórios'];
  /** Comando canônico (resolve apelidos e @bot) a partir do registro único; null se não é um comando conhecido. */
  function canon(t) {
    var c = String(t || '').trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
    if (c.charAt(0) !== '/') return null;
    for (var i = 0; i < COMANDOS.length; i++) if (COMANDOS[i].cmd === c || (COMANDOS[i].aliases || []).indexOf(c) >= 0) return COMANDOS[i].cmd;
    return null;
  }
  /** /ajuda: lista curta, gerada do registro. */
  function ajudaText() {
    var ia = StudyAI.status().configurado;
    return '<b>Prumo no Telegram</b>\n' + GRUPOS.map(function (g) {
      return '<b>' + esc_(g) + '</b>\n' + COMANDOS.filter(function (x) { return x.grupo === g && x.menu; }).map(function (x) { return x.cmd + (x.args ? ' ' + esc_(x.args) : '') + ' — ' + esc_(String(x.menu).charAt(0).toLowerCase() + String(x.menu).slice(1)) + (x.ia && !ia ? ' <i>(IA desligada)</i>' : ''); }).join('\n');
    }).join('\n\n') + '\n\nTodas as funções com explicação e exemplo: /funcoes';
  }
  /** /funcoes (e /comandos): tudo, por grupo, com descrição, apelidos e exemplo. HTML escapado. */
  function funcoesText() {
    var ia = StudyAI.status().configurado, out = ['<b>Funções do Prumo no Telegram</b>', '<i>Toque num comando para usar. Entre colchetes, o que é opcional.</i>'];
    GRUPOS.forEach(function (g) {
      out.push(''); out.push('<b>' + esc_(g) + '</b>');
      COMANDOS.filter(function (x) { return x.grupo === g; }).forEach(function (x) {
        out.push(x.cmd + (x.args ? ' <i>' + esc_(x.args) + '</i>' : '') + ' — ' + esc_(x.desc) + ((x.aliases || []).length ? ' (também ' + x.aliases.join(', ') + ')' : '') + (x.ia && !ia ? ' <i>IA desligada no momento.</i>' : ''));
        if (x.exemplo !== x.cmd) out.push('   Ex.: <code>' + esc_(x.exemplo) + '</code>');
      });
    });
    var outros = {}; RESPOSTAS.forEach(function (r) { (outros[r.grupo] = outros[r.grupo] || []).push(r); });
    Object.keys(outros).forEach(function (g) { out.push(''); out.push('<b>' + esc_(g) + '</b>'); outros[g].forEach(function (r) { out.push(esc_(r.cmd) + ' — ' + esc_(r.desc)); }); });
    return out.join('\n');
  }
  var RESPOSTAS = [
    { grupo: 'Respostas durante uma conversa', cmd: '1, 2, 3…', desc: 'Escolhe um item de uma lista numerada (menu, materiais, concursos). A escolha vale por 30 minutos.' },
    { grupo: 'Respostas durante uma conversa', cmd: 'A, B, C, D, E · C/E · certo/errado', desc: 'Responde a questão da série em andamento (registra a tentativa e manda a próxima).' },
    { grupo: 'Respostas durante uma conversa', cmd: 'original · anotado', desc: 'Escolhe a versão do PDF quando o bot perguntar.' },
    { grupo: 'Respostas durante uma conversa', cmd: 'cancelar · sair', desc: 'Encerra a escolha ou a série em andamento.' },
    { grupo: 'Frases em português', cmd: '"me envie o PDF de Português"', desc: 'Busca o material e oferece para enviar (também "mande", "quero", "preciso" + "pdf/material/apostila/arquivo de/sobre …").' },
    { grupo: 'Frases em português', cmd: '"relatório da semana em pdf"', desc: 'Relatório (hoje, semana ou mês; em PDF se a frase tiver "pdf").' },
    { grupo: 'Frases em português', cmd: '"resumo de crase"', desc: 'Suas anotações sobre o assunto.' },
    { grupo: 'Frases em português', cmd: '"erros de crase"', desc: 'Caderno de erros do assunto.' },
    { grupo: 'Frases em português', cmd: '"revisões" · "progresso" · "o que estudar hoje"', desc: 'Revisões pendentes, indicadores de 7 dias e atividades de hoje.' },
    { grupo: 'Arquivos e relatórios', cmd: 'Enviar PDF, planilha ou foto', desc: 'O arquivo vai para a sua biblioteca de Estudos (até 20 MB, limite do Telegram para bots). O bot pergunta a categoria (responda com o número; sem resposta em 30 minutos, fica em Outros).' }
  ];
  function commands() {
    var c = cfg_();
    return { grupos: GRUPOS, comandos: COMANDOS.map(function (x) { return { grupo: x.grupo, cmd: x.cmd, args: x.args || '', exemplo: x.exemplo, aliases: x.aliases || [], desc: x.desc, menu: !!x.menu, ia: !!x.ia }; }), outros: RESPOSTAS,
      bot: c.bot || null, ia: !!(StudyAI.status().configurado), dono: owner_() === Auth.email() };
  }
  /** Dono: publica a lista no menu "/" do Telegram (setMyCommands). */
  function setCommands() {
    var c = cfg_(); if (!c.token) throw Utils.error('VALIDATION', 'Configure o bot primeiro.');
    var list = COMANDOS.filter(function (x) { return x.menu; }).map(function (x) { return { command: x.cmd.slice(1), description: String(x.menu).slice(0, 256) }; });
    var r = call_('setMyCommands', { commands: list });
    if (!r || !r.ok) throw Utils.error('VALIDATION', 'O Telegram recusou a lista de comandos' + (r && r.desc ? ': ' + scrub_(r.desc) : '.'));
    AppLog.audit('telegram', 'menu_comandos', 'bot', null, { total: list.length });
    return { ok: true, total: list.length };
  }

  return { status: status, saveConfig: saveConfig, linkCode: linkCode, pollRoute: pollRoute, saveUser: saveUser, unlink: unlink, sendTest: sendTest, commands: commands, setCommands: setCommands, canon: canon, ajudaText: ajudaText, funcoesText: funcoesText,
    dispatch: dispatch, daily: daily, poll_: poll_, adminInfo_: adminInfo_,
    // internos usados por StudyTelegram (mesmo token, vínculo, histórico e limites)
    _x: { call_: call_, cfg_: cfg_, user_: user_, enviar_: enviar_, erro_: erro_, scrub_: scrub_, esc_: esc_, saveVals_: saveVals_, tabela_: tabela_, owner_: owner_, props_: props_, API: API } };
})();
