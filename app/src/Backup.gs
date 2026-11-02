/**
 * Backup da planilha (cópia completa na pasta backups, mantém as últimas N),
 * exportação de todos os dados do usuário em JSON e restauração a partir dele.
 */
function backupNow() { return Backup.run(); }

var Backup = (function () {
  function run() {
    var folder = Setup.folder('backups');
    var name = 'Prumo backup ' + Utils.fmt(new Date(), 'yyyy-MM-dd HHmm');
    var copy = DriveApp.getFileById(CONFIG.SHEET_ID).makeCopy(name, folder);
    var files = [], it = folder.getFiles();
    while (it.hasNext()) { var f = it.next(); if (/^Prumo backup /.test(f.getName())) files.push(f); }
    files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    var keep = Number(Auth.setting('sys.backups_manter', CONFIG.BACKUP_KEEP)) || CONFIG.BACKUP_KEEP;
    files.slice(keep).forEach(function (f) { f.setTrashed(true); });
    AppLog.info('sistema', 'backup', 'Backup criado: ' + name);
    return { nome: name, url: copy.getUrl(), mantidos: Math.min(files.length, keep) };
  }

  function runRoute() { return run(); }

  /** Exporta todas as tabelas do usuário num único JSON. */
  function exportAll() {
    var data = { app: CONFIG.APP_NAME, versao: CONFIG.VERSION, schema: CONFIG.SCHEMA_VERSION, exportado_em: Utils.nowIso(), email: Auth.email(), tabelas: {} };
    CONFIG.CLIENT_WRITABLE.concat(CONFIG.EST_ROUTE_ONLY).forEach(function (n) { data.tabelas[n] = Db.table(n).list({ withDeleted: true }); });
    data.perfil = Auth.profile();
    return Files.saveExport('prumo_dados_' + Utils.fmt(new Date(), 'yyyyMMdd_HHmm') + '.json', 'application/json', JSON.stringify(data));
  }

  /**
   * Restaura um JSON exportado (upsert por id). Retoma por tabela se o tempo acabar.
   * @param {{json:string}} p
   */
  function importAll(p) {
    var data = Utils.parseJson(p.json, null);
    if (!data || !data.tabelas) throw Utils.error('VALIDATION', 'Arquivo de backup inválido.');
    var t0 = Date.now(), report = {}, pendentes = [];
    Object.keys(data.tabelas).forEach(function (n) {
      if (CONFIG.CLIENT_WRITABLE.indexOf(n) < 0 && CONFIG.EST_ROUTE_ONLY.indexOf(n) < 0) return;
      if (Date.now() - t0 > CONFIG.TIME_BUDGET_MS) { pendentes.push(n); return; }
      var t = Db.table(n), have = {};
      t.list({ withDeleted: true }).forEach(function (r) { have[r.id] = 1; });
      var rows = (data.tabelas[n] || []).filter(function (r) { return r && r.id && !have[r.id] && !r.deleted_at; });
      if (rows.length) t.insertMany(rows, { silent: true, keepDates: true });
      report[n] = rows.length;
    });
    AppLog.info('sistema', 'restaurar', JSON.stringify(report));
    return { inseridos: report, pendentes: pendentes };
  }

  return { run: run, runRoute: runRoute, exportAll: exportAll, importAll: importAll };
})();
