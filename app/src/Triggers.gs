/**
 * Gatilhos instaláveis (idempotentes) e seus handlers.
 *  - triggerDaily     07h: recorrências, faturas, notificações e resumo por e-mail
 *  - triggerReminders a cada 15 min: lembretes de tarefas
 *  - triggerWeekly    domingo 03h: backup, limpeza de ocr_tmp e retenção de logs
 *  - triggerFrequente a cada 5 min: alarmes, respostas e pedidos do Telegram (fila de Estudos) e avisos de Estudos (Alarms.gs)
 */
function setupTriggers() { return Triggers.setup(); }
function triggerDaily() { Triggers.run_('diario', Triggers.daily_); }
function triggerReminders() { Triggers.run_('lembretes', function () { Tasks.sendReminders(); Notifications.soon(); Push.dispatch(); Triggers.wa_(); Triggers.tg_(); }); }
function triggerWeekly() { Triggers.weeklyGlobal_(); Triggers.run_('semanal', Triggers.weekly_); }

var Triggers = (function () {
  var HANDLERS = ['triggerDaily', 'triggerReminders', 'triggerWeekly', 'triggerTelegram', 'triggerFrequente'];

  function setup() {
    var existing = ScriptApp.getProjectTriggers();
    existing.forEach(function (t) {
      if (HANDLERS.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('triggerDaily').timeBased().everyDays(1).atHour(CONFIG.DIGEST_HOUR).inTimezone(CONFIG.TIMEZONE).create();
    ScriptApp.newTrigger('triggerReminders').timeBased().everyMinutes(15).create();
    ScriptApp.newTrigger('triggerWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).inTimezone(CONFIG.TIMEZONE).create();
    // Um gatilho só de 5 min para Telegram (respostas) e alarmes: economiza a cota diária do Apps Script
    ScriptApp.newTrigger('triggerFrequente').timeBased().everyMinutes(5).create();
    return ['Gatilhos instalados: diário (' + CONFIG.DIGEST_HOUR + 'h), lembretes (15 min), semanal (dom 3h), alarmes e Telegram (5 min)'];
  }

  function setupRoute() { return { resultado: setup() }; }

  /** Lê os e-mails cadastrados direto da aba (gatilho roda fora de sessão). */
  function users_() {
    var sh = Db.ss().getSheetByName('usuarios');
    if (!sh || sh.getLastRow() < 2) return [Auth.email()];
    var values = sh.getDataRange().getValues(), head = values[0].map(String), ix = head.indexOf('email'), dx = head.indexOf('deleted_at');
    var out = [];
    for (var i = 1; i < values.length; i++) if (values[i][ix] && !values[i][dx]) out.push(String(values[i][ix]).toLowerCase());
    return out.length ? out : [Auth.email()];
  }

  function run_(name, fn) {
    var t0 = Date.now();
    users_().forEach(function (email) {
      Auth.as(email);
      AppLog.begin('gatilho.' + name, 'gatilho');
      try { fn(); } catch (e) { AppLog.error('sistema', 'gatilho_' + name, e); } finally { AppLog.flush(); }
    });
    Auth.as(null);
    console.log('Gatilho ' + name + ' em ' + (Date.now() - t0) + ' ms');
  }

  function daily_() {
    Finance.generateRecurring();
    Db.table('fin_faturas').list().forEach(function (f) { if (f.status === 'aberta' && Utils.today() >= f.data_fechamento) Finance.touchInvoice(f.id); });
    Notifications.generate();
    Push.dispatch();
    wa_();
    try { Telegram.daily(); } catch (e) { AppLog.error('telegram', 'resumo', e); }
    tg_();
    Notifications.sendDigest();
  }

  /** Parte global (uma vez, não por usuário): backup da planilha, temporários do OCR e sessões vencidas. */
  /** WhatsApp não pode derrubar os outros avisos: erro vai para o log e segue. */
  function wa_() { try { WhatsApp.dispatch(); } catch (e) { AppLog.error('whatsapp', 'gatilho', e); } }
  function tg_() { try { Telegram.dispatch(); } catch (e) { AppLog.error('telegram', 'gatilho', e); } }

  function weeklyGlobal_() {
    Auth.as(null);
    AppLog.begin('gatilho.semanal', 'gatilho');
    try {
      Backup.run();
      var tmp = Setup.folder('ocr_tmp'), it = tmp.getFiles(), n = 0;
      while (it.hasNext()) { var f = it.next(); if (Date.now() - f.getDateCreated().getTime() > 86400000) { f.setTrashed(true); n++; } }
      if (n) AppLog.info('sistema', 'limpeza_ocr', n + ' temporário(s) removido(s)');
      var s = Login.purge_(false);
      if (s) AppLog.info('sistema', 'sessoes', s + ' sessão(ões) vencida(s) removida(s)');
    } catch (e) { AppLog.warn('sistema', 'semanal_global', e.message); } finally { AppLog.flush(); }
  }

  function weekly_() {
    AppLog.purge({ dias: Number(Auth.setting('sys.log_retencao_dias', CONFIG.LOG_RETENTION_DAYS)) });
    // Estudos: manifesto + cópia das anotações e dos originais (uma por hash), com orçamento de tempo
    try { if (Db.table('arquivos').list().some(function (a) { return a.modulo === 'estudos'; })) StudyFiles.backup(90000); } catch (e) { AppLog.error('estudos', 'backup', e); }
    try { var lim = Utils.addMonths(Utils.today(), -2); Db.table('tg_updates').hardDelete(function (r) { return String(r.created_at) < lim; }); } catch (e) { /* aba nova */ }
    var cutoff = Utils.addDays(Utils.today(), -60);
    Db.table('notificacoes').hardDelete(function (r) { return r.lida && String(r.data_ref || '') < cutoff; });
  }

  return { users_: users_, setup: setup, setupRoute: setupRoute, run_: run_, daily_: daily_, weekly_: weekly_, weeklyGlobal_: weeklyGlobal_, wa_: wa_, tg_: tg_ };
})();
