/**
 * Instalação idempotente: abas e cabeçalhos, formatos, validações, pastas do Drive, dados de referência e gatilhos.
 * Rode setup() uma vez pelo editor (e sempre que atualizar o schema).
 */
function setup() {
  var report = Setup.run();
  console.log(report.join('\n'));
  return report;
}

var Setup = (function () {
  var TAB_COLORS = { fin: '#F2B705', fit: '#C4684A', nut: '#5F9E8F', tar: '#8FA3B8', met: '#B98900', rot: '#F6D365' };
  var TEXT_TYPES = { s: 1, t: 1, d: 1, dt: 1, e: 1, r: 1, j: 1 };

  function hex_(h) {
    var n = parseInt(h.slice(1), 16);
    return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
  }

  function formatFor_(col) {
    if (!col) return '@';
    if (TEXT_TYPES[col.type]) return '@';
    if (col.type === 'i') return '0';
    if (col.type === 'm') return '0.00';
    if (col.type === 'n') return '0.###';
    return null;
  }

  function formatSheet_(sh, sc, head) {
    var need = head.length;
    if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
    var rows = Math.max(sh.getMaxRows() - 1, 1);
    sh.getRange(1, 1, 1, need).setFontWeight('bold').setBackground('#1A1A1A').setFontColor('#FFF3D6');
    sh.setFrozenRows(1);
    // formatos em blocos contíguos (poucas chamadas)
    var start = 0;
    for (var c = 1; c <= need; c++) {
      var cur = formatFor_(sc.byName[head[start]]);
      var nxt = c < need ? formatFor_(sc.byName[head[c]]) : '__end__';
      if (nxt !== cur) {
        if (cur) sh.getRange(2, start + 1, rows, c - start).setNumberFormat(cur);
        start = c;
      }
    }
    head.forEach(function (h, i) {
      var col = sc.byName[h];
      if (!col) return;
      sh.setColumnWidth(i + 1, col.sys ? 96 : (col.type === 't' || col.type === 'j' || (col.len && col.len > 100) ? 220 : 130));
      if (col.type === 'e') {
        var rule = SpreadsheetApp.newDataValidation().requireValueInList(col.opts, true).setAllowInvalid(true).build();
        sh.getRange(2, i + 1, rows, 1).setDataValidation(rule);
      }
    });
    var prefix = sc.name.split('_')[0];
    if (TAB_COLORS[prefix]) { try { sh.setTabColor(TAB_COLORS[prefix]); } catch (e) { /* opcional */ } }
  }

  /** Cria abas que faltam e acrescenta colunas novas no fim (migração não destrutiva). */
  function ensureSchema() {
    var ss = Db.ss(), report = [];
    var meta = ss.getSheetByName('_meta');
    if (!meta) { meta = ss.insertSheet('_meta'); meta.hideSheet(); }
    var metaMap = {};
    if (meta.getLastRow() > 0) meta.getRange(1, 1, meta.getLastRow(), 2).getValues().forEach(function (r) { if (r[0]) metaMap[String(r[0])] = r[1]; });
    Object.keys(SCHEMA).forEach(function (name) {
      var sc = Db.schema(name);
      var sh = ss.getSheetByName(name), created = false;
      if (!sh) { sh = ss.insertSheet(name); created = true; }
      var lastCol = sh.getLastColumn();
      var head = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
      while (head.length && head[head.length - 1] === '') head.pop();
      var missing = sc.headers.filter(function (h) { return head.indexOf(h) < 0; });
      if (missing.length) {
        if (sh.getMaxColumns() < head.length + missing.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length + missing.length - sh.getMaxColumns());
        sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
        head = head.concat(missing);
      }
      var fmtKey = 'formatado:' + name;
      if (created || missing.length || String(metaMap[fmtKey]) !== String(CONFIG.SCHEMA_VERSION + ':' + head.length)) {
        formatSheet_(sh, sc, head);
        metaMap[fmtKey] = CONFIG.SCHEMA_VERSION + ':' + head.length;
        report.push(created ? 'Aba criada: ' + name : (missing.length ? 'Colunas adicionadas em ' + name + ': ' + missing.join(', ') : 'Formatos aplicados: ' + name));
      }
    });
    metaMap.schema_version = CONFIG.SCHEMA_VERSION; metaMap.app_version = CONFIG.VERSION; metaMap.atualizado_em = Utils.nowIso();
    var rows = Object.keys(metaMap).map(function (k) { return [k, metaMap[k]]; });
    meta.getRange(1, 1, rows.length, 2).setValues(rows);
    ['Página1', 'Sheet1', 'Planilha1'].forEach(function (n) {
      var s = ss.getSheetByName(n);
      if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) { ss.deleteSheet(s); report.push('Aba vazia removida: ' + n); }
    });
    Db.resetMemo();
    Cache.clearAll();
    return report;
  }

  function props_() { return PropertiesService.getScriptProperties(); }

  /** Pasta (subpasta da raiz) com id em cache nas propriedades. */
  function folder(name) {
    var key = 'folder:' + name, id = props_().getProperty(key);
    if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recria */ } }
    var root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    var it = root.getFoldersByName(name);
    var folder = it.hasNext() ? it.next() : root.createFolder(name);
    props_().setProperty(key, folder.getId());
    return folder;
  }

  function subfolder(parent, name) {
    var key = 'folder:' + parent + '/' + name, id = props_().getProperty(key);
    if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recria */ } }
    var p = folder(parent);
    var it = p.getFoldersByName(name);
    var sub = it.hasNext() ? it.next() : p.createFolder(name);
    props_().setProperty(key, sub.getId());
    return sub;
  }

  function ensureFolders() {
    return CONFIG.SUBFOLDERS.map(function (n) { folder(n); return 'Pasta ok: ' + n; });
  }

  function run() {
    var t0 = Date.now(), report = [];
    report = report.concat(ensureSchema());
    report = report.concat(ensureFolders());
    report = report.concat(Seed.reference());
    report = report.concat(Triggers.setup());
    report.push('Concluído em ' + Math.round((Date.now() - t0) / 1000) + ' s.');
    AppLog.info('sistema', 'setup', report.join(' | '));
    AppLog.flush();
    return report;
  }

  /** Rota: diagnóstico do ambiente. */
  function diagnostics() {
    var checks = [];
    function check(id, label, fn) {
      try { var d = fn(); checks.push({ id: id, label: label, ok: true, detail: d }); }
      catch (e) { checks.push({ id: id, label: label, ok: false, detail: e.message }); }
    }
    check('planilha', 'Planilha (banco de dados)', function () {
      var ss = Db.ss(), missing = Object.keys(SCHEMA).filter(function (n) { return !ss.getSheetByName(n); });
      if (missing.length) throw new Error('Abas faltando: ' + missing.join(', ') + '. Rode setup().');
      return ss.getName() + ' · ' + Object.keys(SCHEMA).length + ' abas';
    });
    check('drive', 'Pasta do Drive', function () { return DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).getName(); });
    check('ocr', 'Serviço Drive API (OCR)', function () { if (typeof Drive === 'undefined') throw new Error('Serviço avançado Drive não habilitado.'); return 'habilitado'; });
    check('sheets', 'Serviço Sheets API (carga rápida)', function () { if (typeof Sheets === 'undefined') throw new Error('Opcional: habilite para o boot ficar mais rápido.'); return 'habilitado'; });
    check('gatilhos', 'Gatilhos automáticos', function () {
      var names = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
      if (names.length < 3) throw new Error('Só ' + names.length + ' gatilho(s). Use "Reinstalar gatilhos".');
      return names.join(', ');
    });
    check('email', 'Cota de e-mail hoje', function () { return MailApp.getRemainingDailyQuota() + ' envios restantes'; });
    check('duplicados', 'Arquivos de Estudos (duplicados e órfãos)', function () {
      var d = StudyFiles.dupScan(), o = StudyFiles.orphans(), mb = function (b) { return (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; };
      var txt = d.itens.length + ' duplicado(s) (' + mb(d.bytes) + ' a liberar) · ' + o.registros.length + ' registro(s) sem uso · ' + o.no_drive.length + ' arquivo(s) no Drive que o app não conhece';
      if (d.itens.length) throw new Error(txt + '. Use Estudos › Preferências › Procurar duplicados.');
      return txt;
    });
    check('cache', 'Cache', function () { Cache.put('diag', 'x', { ok: 1 }, 60); if (!Cache.get('diag', 'x')) throw new Error('Cache indisponível'); return 'ok'; });
    return { checks: checks, version: CONFIG.VERSION, schema: CONFIG.SCHEMA_VERSION, email: Auth.email(), fuso: CONFIG.TIMEZONE };
  }

  return { run: run, ensureSchema: ensureSchema, ensureFolders: ensureFolders, folder: folder, subfolder: subfolder, diagnostics: diagnostics, hex: hex_ };
})();
