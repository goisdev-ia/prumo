/**
 * Entrada do Web App e roteador único da API.
 * O cliente só enxerga: doGet, include, api, apiBatch.
 */

/** Serve o app. */
function doGet(e) {
  // Verificação do webhook do WhatsApp (Meta): devolve o hub.challenge em texto puro.
  if (e && e.parameter && e.parameter['hub.mode']) {
    var ch = null;
    try { ch = WhatsApp.verify(e.parameter); } catch (err) { ch = null; } finally { AppLog.flush(); }
    return ContentService.createTextOutput(ch === null ? 'forbidden' : ch);
  }
  // ?push=<pid>: o service worker do app instalado busca o conteúdo da notificação.
  if (e && e.parameter && e.parameter.push) {
    var body;
    try { body = Push.pull(e.parameter.push); } catch (err) { body = { itens: [] }; } finally { AppLog.flush(); }
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
  // ALLOWALL: o app instalado (casca PWA) abre esta página dentro de um iframe.
  var out = HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (CONFIG.FAVICON_URL) out.setFaviconUrl(CONFIG.FAVICON_URL);
  return out;
}

/** Notificações do WhatsApp (webhook opcional). Responde rápido; o processamento é idempotente. */
function doPost(e) {
  var out = 'ok';
  AppLog.begin('whatsapp.webhook', 'meta');
  try { out = WhatsApp.webhook((e && e.parameter) || {}, e && e.postData ? e.postData.contents : ''); }
  catch (err) { AppLog.error('whatsapp', 'webhook', err); }
  finally { AppLog.flush(); }
  return ContentService.createTextOutput(out);
}

/** Inclui um parcial HTML sem avaliar scriptlets. */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Ponto único de entrada do cliente.
 * @param {string} route rota whitelistada
 * @param {Object} payload dados
 * @param {string=} device identificação curta do dispositivo
 * @return {{ok:boolean, data:*, error:Object, meta:Object}}
 */
function api(route, payload, device, token) {
  return Api.handle(route, payload, device, token);
}

/**
 * Executa várias rotas numa única ida ao servidor.
 * @param {{route:string, payload:Object}[]} calls
 */
function apiBatch(calls, device, token) {
  return Api.batch(calls, device, token);
}

var Api = (function () {
  var MESSAGES = {
    VALIDATION: 'Confira os dados informados.',
    NOT_FOUND: 'Não encontramos esse registro.',
    LOCKED: 'Outra gravação está em andamento. Tente de novo em alguns segundos.',
    QUOTA: 'Limite diário do Google atingido. Tente novamente mais tarde.',
    OCR_FAILED: 'Não foi possível ler a imagem. Tente uma foto mais nítida.',
    FORBIDDEN: 'Você não tem acesso a esse recurso.',
    CONFLICT: 'Este registro foi alterado em outro lugar. Confira antes de salvar.',
    AUTH: 'Sua sessão expirou. Entre novamente.',
    UNKNOWN: 'Algo deu errado do nosso lado. Tente novamente.'
  };

  /** Tabela de rotas — resolvida em tempo de chamada (sem dependência de ordem de carga). */
  function routes_() {
    var r = {
      'auth.login': function (p) { return Login.login(p, ctx_.device); },
      'auth.logout': function () { return Login.logout({}, ctx_.token); },

      'boot': Boot.load,
      'db.list': DbRoutes.list,
      'db.save': DbRoutes.save,
      'db.saveMany': DbRoutes.saveMany,
      'db.remove': DbRoutes.remove,
      'db.restore': DbRoutes.restore,

      'profile.save': Auth.saveProfile,
      'settings.save': Auth.saveSettings,
      'auth.setPin': Auth.setPin,
      'auth.verifyPin': Auth.verifyPin,

      'push.config': Push.config,
      'push.subscribe': Push.subscribe,
      'push.unsubscribe': Push.unsubscribe,
      'push.status': Push.status,
      'push.test': Push.test,

      'tg.status': Telegram.status,
      'tg.saveConfig': Telegram.saveConfig,
      'tg.linkCode': Telegram.linkCode,
      'tg.poll': Telegram.pollRoute,
      'tg.saveUser': Telegram.saveUser,
      'tg.unlink': Telegram.unlink,
      'tg.sendTest': Telegram.sendTest,
      'tg.commands': Telegram.commands,
      'tg.setCommands': Telegram.setCommands,

      'wa.status': WhatsApp.status,
      'wa.saveConfig': WhatsApp.saveConfig,
      'wa.testConnection': WhatsApp.testConnection,
      'wa.saveUser': WhatsApp.saveUser,
      'wa.markWindow': WhatsApp.markWindow,
      'wa.sendTest': WhatsApp.sendTest,

      'files.upload': Files.upload,
      'files.data': Files.dataUrl,
      'files.rename': Files.rename,
      'files.trash': Files.trash,
      'files.link': Files.link,
      'ocr.extract': Ocr.extract,

      'fin.saveTx': Finance.saveTx,
      'fin.removeGroup': Finance.removeGroup,
      'fin.payInvoice': Finance.payInvoice,
      'fin.reconcile': Finance.reconcile,
      'fin.aporte': Finance.aporte,
      'fin.generateRecurring': Finance.generateRecurringRoute,
      'fin.copyBudget': Finance.copyBudget,
      'fin.import': Finance.importRows,
      'fin.exportCsv': Finance.exportCsv,

      'fit.saveSession': Fitness.saveSession,
      'nut.barcode': Nutrition.barcode,
      'nut.saveGoal': Nutrition.saveGoal,
      'alarm.ack': Alarms.ack,
      'tasks.calendar': Tasks.syncCalendar,

      'logs.list': AppLog.list,
      'logs.client': AppLog.clientErrors,
      'logs.purge': AppLog.purge,
      'logs.export': AppLog.exportCsv,

      'sys.diagnostics': Setup.diagnostics,
      'sys.backup': Backup.runRoute,
      'sys.exportAll': Backup.exportAll,
      'sys.importAll': Backup.importAll,
      'sys.seedDemo': SeedDemo.runRoute,
      'sys.clearDemo': SeedDemo.clearRoute,
      'sys.setupTriggers': Triggers.setupRoute,
      'sys.clearCache': function () { Cache.clearAll(); return { ok: true }; }
    };
    Object.assign(r, Studies.routes(), StudyTelegram.routes());
    return r;
  }

  // Rotas abertas (antes do login) e rotas só do dono da planilha (mexem no Drive/Agenda/gatilhos dele).
  var PUBLIC = { 'auth.login': 1 };
  var OWNER_ONLY = { 'sys.backup': 1, 'sys.setupTriggers': 1, 'tasks.calendar': 1, 'wa.saveConfig': 1, 'wa.testConnection': 1, 'tg.saveConfig': 1, 'est.aiConfig': 1, 'tg.setCommands': 1 };
  var ctx_ = { device: '', token: '', email: null };

  function owner_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }

  /** Exige sessão válida e fixa o usuário da requisição. */
  function guard_(route) {
    if (PUBLIC[route]) return;
    if (ctx_.email === null) ctx_.email = Login.resolve(ctx_.token) || '';
    if (!ctx_.email) throw Utils.error('AUTH', MESSAGES.AUTH);
    Auth.as(ctx_.email);
    if (OWNER_ONLY[route] && ctx_.email !== owner_()) throw Utils.error('FORBIDDEN', 'Disponível só para a conta dona do app.');
  }

  function envelope_(fn, route, payload) {
    var t0 = Date.now();
    try {
      if (typeof route !== 'string' || route.length > 40) throw Utils.error('NOT_FOUND', 'Rota inválida.');
      var handler = routes_()[route];
      if (!handler) throw Utils.error('NOT_FOUND', 'Rota desconhecida: ' + route);
      guard_(route);
      if (payload !== undefined && payload !== null && typeof payload !== 'object') throw Utils.error('VALIDATION', 'Payload inválido.');
      var data = handler(payload || {});
      return { ok: true, data: Utils.plain(data), error: null, meta: { ms: Date.now() - t0 } };
    } catch (e) {
      var code = e.code || (/limite|quota|too many|Service invoked too many/i.test(String(e.message)) ? 'QUOTA' : 'UNKNOWN');
      if (code === 'UNKNOWN' || code === 'QUOTA' || code === 'OCR_FAILED') AppLog.error(String(route).split('.')[0], route, e, { payload_keys: payload ? Object.keys(payload) : [] });
      var message = (code === 'UNKNOWN') ? MESSAGES.UNKNOWN : (e.message || MESSAGES[code]);
      return { ok: false, data: null, error: { code: code, message: message, field: e.field || null, data: e.data ? Utils.plain(e.data) : null }, meta: { ms: Date.now() - t0 } };
    }
  }

  function handle(route, payload, device, token) {
    ctx_ = { device: device || '', token: token || '', email: null };
    AppLog.begin(route, device);
    try { return envelope_(null, route, payload); } finally { AppLog.flush(); }
  }

  function batch(calls, device, token) {
    ctx_ = { device: device || '', token: token || '', email: null };
    AppLog.begin('batch', device);
    try {
      if (!Array.isArray(calls) || calls.length > 20) return { ok: false, error: { code: 'VALIDATION', message: 'Lote inválido.' } };
      return { ok: true, results: calls.map(function (c) { return envelope_(null, c && c.route, c && c.payload); }) };
    } finally { AppLog.flush(); }
  }

  return { handle: handle, batch: batch };
})();

/** Carga inicial: perfil, preferências e dados recentes de todos os módulos numa só chamada. */
var Boot = (function () {
  var EXCLUDE = { usuarios: 1, logs: 1, configuracoes: 1, push_inscricoes: 1, wa_mensagens: 1, tg_mensagens: 1, tg_updates: 1, est_versoes: 1 };

  function load() {
    var names = Object.keys(SCHEMA).filter(function (n) { return !EXCLUDE[n] && CONFIG.EST_LAZY.indexOf(n) < 0; });
    Db.preload(names.concat(['usuarios', 'configuracoes']));
    if (!Db.table('fin_categorias').count()) Seed.reference();
    var profile = Auth.profile();
    Auth.touch();
    var tables = {};
    var windows = {};
    var finBase = {};
    names.forEach(function (n) {
      var rows = Db.table(n).list();
      var w = CONFIG.BOOT_WINDOW[n];
      if (w) {
        var since = Utils.addMonths(Utils.today(), -w[1]).slice(0, 10);
        if (n === 'fin_lancamentos') finBase = oldBalances_(rows, since);
        rows = rows.filter(function (r) { return !r[w[0]] || String(r[w[0]]) >= since; });
        windows[n] = since;
      }
      if (n === 'arquivos') rows = rows.map(function (r) { var c = Object.assign({}, r); delete c.ocr_texto; return c; });
      tables[n] = rows;
    });
    return {
      profile: profile,
      settings: Auth.settings(),
      tables: tables,
      windows: windows,
      finBase: finBase,
      today: Utils.today(),
      now: Utils.nowIso(),
      version: CONFIG.VERSION,
      pwaUrl: CONFIG.PWA_URL || '',
      execUrl: (function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })(),
      email: Auth.email(),
      hasDemo: (tables.fin_lancamentos || []).some(function (r) { return String(r.id).indexOf('demo-') === 0; }),
      setupOk: true
    };
  }

  /** Saldo acumulado por conta dos lançamentos fora da janela do boot (para o cliente somar ao que carregou). */
  function oldBalances_(rows, since) {
    var out = {};
    rows.forEach(function (l) {
      if (l.data >= since || l.status !== 'pago') return;
      var v = Utils.toCents(l.valor);
      var add = function (id, c) { if (id) out[id] = (out[id] || 0) + c; };
      if (l.tipo === 'receita' && !l.cartao_id) add(l.conta_id, v);
      else if (l.tipo === 'despesa' && !l.cartao_id) add(l.conta_id, -v);
      else if (l.tipo === 'transferencia') { add(l.conta_id, -v); add(l.conta_destino_id, v); }
    });
    Object.keys(out).forEach(function (k) { out[k] = Utils.fromCents(out[k]); });
    return out;
  }

  return { load: load };
})();

/** Rotas genéricas de CRUD, restritas às tabelas permitidas e ao usuário atual. */
var DbRoutes = (function () {
  function check_(table) {
    if (CONFIG.CLIENT_WRITABLE.indexOf(table) < 0 && table !== 'arquivos') throw Utils.error('FORBIDDEN', 'Tabela não permitida: ' + table);
    return Db.table(table);
  }

  /** @param {{table:string, de:string=, ate:string=, col:string=}} p */
  function list(p) {
    var t = check_(p.table);
    var col = p.col || (CONFIG.BOOT_WINDOW[p.table] ? CONFIG.BOOT_WINDOW[p.table][0] : null);
    var rows = t.list();
    if (col && (p.de || p.ate)) rows = rows.filter(function (r) { return (!p.de || r[col] >= p.de) && (!p.ate || r[col] <= p.ate); });
    return { rows: rows };
  }

  /** @param {{table:string, row:Object}} p */
  function save(p) {
    if (p.table === 'arquivos') throw Utils.error('FORBIDDEN', 'Use as rotas de arquivos.');
    var t = check_(p.table);
    if (!p.row || typeof p.row !== 'object') throw Utils.error('VALIDATION', 'Registro inválido.');
    return { row: t.upsert(p.row) };
  }

  /** @param {{table:string, rows:Object[]}} p */
  function saveMany(p) {
    var t = check_(p.table);
    var rows = p.rows || [];
    if (rows.length > 500) throw Utils.error('VALIDATION', 'Máximo de 500 registros por vez.');
    var inserts = [], out = [];
    rows.forEach(function (r) { if (r.id && t.get(r.id)) out.push(t.upsert(r)); else inserts.push(r); });
    return { rows: out.concat(t.insertMany(inserts)) };
  }

  /** @param {{table:string, id:string}} p */
  function remove(p) {
    var t = check_(p.table);
    var row = t.softDelete(p.id);
    if (p.table === 'fin_lancamentos' && row.fatura_id) Finance.touchInvoice(row.fatura_id);
    return { row: row };
  }

  function restore(p) {
    var t = check_(p.table);
    return { row: t.restore(p.id) };
  }

  return { list: list, save: save, saveMany: saveMany, remove: remove, restore: restore };
})();
