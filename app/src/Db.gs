/**
 * Repositório genérico sobre Google Sheets.
 * - Lê cada aba no máximo uma vez por requisição (memo) e usa CacheService versionado entre requisições.
 * - Valida/coage tipos pelo SCHEMA, preenche colunas de sistema, grava em lote, audita e invalida cache.
 */
var Db = (function () {
  var COMMON = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at'];
  var SPEC_RE = /^(\w+):([a-z]+)(\d*)(?:\(([^)]*)\))?(!?)(?:=(.*))?$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var LABELS = {
    descricao: 'Descrição', valor: 'Valor', data: 'Data', nome: 'Nome', titulo: 'Título', tipo: 'Tipo',
    categoria_id: 'Categoria', conta_id: 'Conta', limite: 'Limite', dia_fechamento: 'Dia de fechamento',
    dia_vencimento: 'Dia de vencimento', kcal: 'Calorias', ml: 'Quantidade', refeicao: 'Refeição',
    padrao: 'Padrão', valor_planejado: 'Valor planejado', saldo_devedor: 'Saldo devedor', credor: 'Credor',
    competencia: 'Competência', inicio: 'Início', email: 'E-mail', exercicio_id: 'Exercício', treino_id: 'Treino'
  };

  var ss_ = null;
  var memo_ = {};
  var schemas_ = {};
  var lockDepth_ = 0;

  /** @return {Spreadsheet} */
  function ss() {
    if (!ss_) ss_ = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    return ss_;
  }

  function label_(name) {
    return LABELS[name] || name.replace(/_id$/, '').replace(/_/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); });
  }

  function castDefault_(type, raw) {
    if (type === 'b') return raw === 'true';
    if (type === 'i' || type === 'n' || type === 'm') return Number(raw);
    return raw;
  }

  /**
   * Schema parseado de uma tabela.
   * @param {string} name
   * @return {{name:string, cols:Object[], byName:Object, headers:string[]}}
   */
  function schema(name) {
    if (schemas_[name]) return schemas_[name];
    var spec = SCHEMA[name];
    if (!spec) throw Utils.error('NOT_FOUND', 'Tabela desconhecida: ' + name);
    var cols = COMMON.map(function (n) {
      return { name: n, type: /_at$/.test(n) ? 'dt' : 's', len: 120, sys: true };
    });
    spec.split(/\s+/).forEach(function (tok) {
      var m = tok.match(SPEC_RE);
      if (!m) throw Utils.error('UNKNOWN', 'Schema inválido em ' + name + ': ' + tok);
      cols.push({
        name: m[1], type: m[2], len: m[3] ? Number(m[3]) : null,
        opts: m[4] ? m[4].split(',') : null, req: m[5] === '!',
        def: m[6] !== undefined ? castDefault_(m[2], m[6]) : undefined
      });
    });
    var byName = {};
    cols.forEach(function (c) { byName[c.name] = c; });
    schemas_[name] = { name: name, cols: cols, byName: byName, headers: cols.map(function (c) { return c.name; }) };
    return schemas_[name];
  }

  function isEmpty_(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

  /** Normaliza valor vindo da planilha (tolerante, nunca lança). */
  function readValue_(col, v) {
    if (v === '' || v === null || v === undefined) return null;
    switch (col.type) {
      case 'd':
        if (v instanceof Date) return Utils.fmt(v, 'yyyy-MM-dd');
        var br = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        return br ? br[3] + '-' + br[2] + '-' + br[1] : String(v).slice(0, 10);
      case 'dt': return v instanceof Date ? Utils.fmt(v, "yyyy-MM-dd'T'HH:mm:ssXXX") : String(v);
      case 'i': case 'n': case 'm': var n = Number(v); return isFinite(n) ? n : null;
      case 'b': return v === true || v === 'TRUE' || v === 'true' || v === 1;
      case 'j': return Utils.parseJson(v, null);
      default:
        if (v instanceof Date) {
          if (v.getFullYear() < 1900) return Utils.fmt(v, 'HH:mm');
          if (col.name === 'competencia') return Utils.fmt(v, 'yyyy-MM');
          return Utils.fmt(v, 'yyyy-MM-dd');
        }
        return String(v);
    }
  }

  /** Coage e valida valor vindo do cliente. Lança VALIDATION. */
  function coerce_(col, v) {
    if (isEmpty_(v)) return null;
    var lbl = label_(col.name);
    switch (col.type) {
      case 's': case 't': case 'r':
        var s = String(v).trim();
        var max = col.type === 't' ? 20000 : (col.len || 255);
        if (s.length > max) throw Utils.error('VALIDATION', lbl + ': máximo de ' + max + ' caracteres.', col.name);
        if (col.type === 'r' && !Utils.isUuid(s)) throw Utils.error('VALIDATION', lbl + ': referência inválida.', col.name);
        return s;
      case 'i': case 'n': case 'm':
        var n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
        if (!isFinite(n)) throw Utils.error('VALIDATION', lbl + ': número inválido.', col.name);
        if (Math.abs(n) > 1e12) throw Utils.error('VALIDATION', lbl + ': valor fora do limite.', col.name);
        return col.type === 'i' ? Math.round(n) : (col.type === 'm' ? Utils.round2(n) : n);
      case 'd':
        if (v instanceof Date) return Utils.fmt(v);
        var d = String(v).slice(0, 10);
        if (!DATE_RE.test(d) || !Utils.parseDate(d)) throw Utils.error('VALIDATION', lbl + ': data inválida.', col.name);
        return d;
      case 'dt':
        if (v instanceof Date) return Utils.fmt(v, "yyyy-MM-dd'T'HH:mm:ssXXX");
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v))) throw Utils.error('VALIDATION', lbl + ': data/hora inválida.', col.name);
        return String(v).slice(0, 40);
      case 'b':
        return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';
      case 'e':
        var e = String(v);
        if (col.opts.indexOf(e) < 0) throw Utils.error('VALIDATION', lbl + ': opção inválida.', col.name);
        return e;
      case 'j':
        var obj = typeof v === 'string' ? Utils.parseJson(v, undefined) : v;
        if (obj === undefined) throw Utils.error('VALIDATION', lbl + ': JSON inválido.', col.name);
        if (JSON.stringify(obj).length > 45000) throw Utils.error('VALIDATION', lbl + ': conteúdo grande demais.', col.name);
        return obj;
      default:
        return v;
    }
  }

  /** Converte valor normalizado em célula. Strings iniciadas por "=" viram texto literal (sem fórmula). */
  function toCell_(col, v) {
    if (v === null || v === undefined) return '';
    if (col && col.type === 'j') return JSON.stringify(v);
    if (col && col.type === 'b') return v === true;
    if (typeof v === 'string' && /^[=+@]/.test(v) && col && col.type !== 'n') return "'" + v;
    return v;
  }

  /**
   * Valida um objeto contra o schema.
   * @param {string} name
   * @param {Object} input dados recebidos
   * @param {Object=} existing registro atual (update) — ausente em insert
   * @return {Object} somente campos de negócio coagidos
   */
  function validate(name, input, existing) {
    var sc = schema(name), out = {};
    sc.cols.forEach(function (col) {
      if (col.sys) return;
      if (Object.prototype.hasOwnProperty.call(input, col.name)) out[col.name] = coerce_(col, input[col.name]);
      else if (!existing && col.def !== undefined) out[col.name] = col.def;
    });
    sc.cols.forEach(function (col) {
      if (!col.req) return;
      var v = Object.prototype.hasOwnProperty.call(out, col.name) ? out[col.name] : (existing ? existing[col.name] : null);
      if (isEmpty_(v)) throw Utils.error('VALIDATION', 'Informe ' + label_(col.name).toLowerCase() + '.', col.name);
    });
    return out;
  }

  function sheet_(name) {
    var sh = ss().getSheetByName(name);
    if (!sh && SCHEMA[name]) {
      // Tabela nova de uma versão recente: cria a aba na hora (migração não destrutiva) em vez de quebrar o app
      try { Setup.ensureSchema(); } catch (e) { /* segue para o erro abaixo */ }
      sh = ss().getSheetByName(name);
    }
    if (!sh) throw Utils.error('NOT_FOUND', 'A aba "' + name + '" não existe. Rode setup() no editor do Apps Script.');
    return sh;
  }

  /** Monta a estrutura em memória a partir da matriz de valores (linha 0 = cabeçalho). */
  function build_(name, values) {
    var head = (values[0] || []).map(String);
    var sc = schema(name);
    var idIdx = head.indexOf('id');
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      if (idIdx < 0 || !r || !r[idIdx]) continue;
      var o = { _r: i + 1 };
      for (var j = 0; j < head.length; j++) {
        var col = sc.byName[head[j]];
        if (col) o[head[j]] = readValue_(col, r[j]);
      }
      rows.push(o);
    }
    return { head: head, rows: rows, lastRow: values.length };
  }

  /** Lê a aba inteira (todas as pessoas). Usa memo da requisição e cache entre requisições. */
  function read_(name, fresh) {
    if (!fresh && memo_[name]) return memo_[name];
    if (!fresh) {
      var cached = Cache.get('t:' + name, 'rows');
      if (cached) { memo_[name] = cached; return cached; }
    }
    var data = build_(name, sheet_(name).getDataRange().getValues());
    memo_[name] = data;
    Cache.put('t:' + name, 'rows', data);
    return data;
  }

  /**
   * Pré-carrega várias abas numa única chamada (serviço avançado Sheets), para o boot frio.
   * Sem o serviço, cai no modo aba a aba sob demanda.
   * @param {string[]} names
   */
  function preload(names) {
    var need = names.filter(function (n) {
      if (memo_[n]) return false;
      var c = Cache.get('t:' + n, 'rows');
      if (c) { memo_[n] = c; return false; }
      return true;
    });
    if (!need.length || typeof Sheets === 'undefined') return;
    try {
      var res = Sheets.Spreadsheets.Values.batchGet(CONFIG.SHEET_ID, {
        ranges: need.map(function (n) { return "'" + n + "'"; }),
        valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
      });
      (res.valueRanges || []).forEach(function (vr, i) {
        var data = build_(need[i], vr.values || []);
        memo_[need[i]] = data;
        Cache.put('t:' + need[i], 'rows', data);
      });
    } catch (e) {
      // segue no modo aba a aba
    }
  }

  function strip_(o) {
    var c = {};
    for (var k in o) if (k !== '_r') c[k] = o[k];
    return c;
  }

  function withLock(fn) {
    if (lockDepth_ > 0) return fn();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(CONFIG.LOCK_WAIT_MS)) {
      throw Utils.error('LOCKED', 'Outra gravação está em andamento. Tente de novo em alguns segundos.');
    }
    lockDepth_++;
    try { return fn(); } finally { lockDepth_--; lock.releaseLock(); }
  }

  function changed_(before, after) {
    var b = {}, a = {};
    Object.keys(after).forEach(function (k) {
      if (k === 'updated_at') return;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
    });
    return { before: b, after: a };
  }

  function matches_(row, where) {
    if (!where) return true;
    if (typeof where === 'function') return where(row);
    for (var k in where) if (row[k] !== where[k]) return false;
    return true;
  }

  function sorter_(orderBy) {
    var parts = String(orderBy).split(/\s+/), key = parts[0], dir = parts[1] === 'desc' ? -1 : 1;
    return function (a, b) {
      var x = a[key], y = b[key];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return x > y ? dir : -dir;
    };
  }

  /**
   * Repositório de uma tabela, sempre escopado ao usuário atual.
   * @param {string} name nome da aba
   */
  function table(name) {
    schema(name);

    function mine_(withDeleted) {
      var email = Auth.email();
      return read_(name).rows.filter(function (r) {
        return r.user_id === email && (withDeleted || !r.deleted_at);
      });
    }

    /** @param {{where:(Object|Function)=, orderBy:string=, limit:number=, offset:number=, withDeleted:boolean=}=} opt */
    function list(opt) {
      opt = opt || {};
      var rows = mine_(opt.withDeleted).filter(function (r) { return matches_(r, opt.where); });
      if (opt.orderBy) rows.sort(sorter_(opt.orderBy));
      if (opt.offset || opt.limit) rows = rows.slice(opt.offset || 0, (opt.offset || 0) + (opt.limit || rows.length));
      return rows.map(strip_);
    }

    function get(id) {
      var r = mine_(true).filter(function (x) { return x.id === id; })[0];
      return r ? strip_(r) : null;
    }

    function count(where) { return mine_(false).filter(function (r) { return matches_(r, where); }).length; }

    /** Insere vários registros numa única escrita. opts.silent desliga auditoria. */
    function insertMany(objs, opts) {
      opts = opts || {};
      if (!objs.length) return [];
      return withLock(function () {
        var data = read_(name, true);
        var sc = schema(name), email = opts.userId || Auth.email(), now = Utils.nowIso();
        var existingIds = {};
        data.rows.forEach(function (r) { existingIds[r.id] = true; });
        var clean = objs.map(function (o) {
          var v = validate(name, o, null);
          var id = (Utils.isUuid(o.id) && !existingIds[o.id]) ? o.id : Utils.uuid();
          existingIds[id] = true;
          return Object.assign({ id: id, user_id: email, created_at: o.created_at && opts.keepDates ? o.created_at : now, updated_at: now, deleted_at: null }, v);
        });
        var head = data.head.length ? data.head : sc.headers;
        var matrix = clean.map(function (o) { return head.map(function (h) { return toCell_(sc.byName[h], o[h]); }); });
        var sh = sheet_(name);
        var start = Math.max(sh.getLastRow(), 1) + 1;
        sh.getRange(start, 1, matrix.length, head.length).setValues(matrix);
        clean.forEach(function (o, i) { var m = Object.assign({ _r: start + i }, o); data.rows.push(m); });
        data.lastRow = start + matrix.length - 1;
        Cache.bump('t:' + name);
        if (!opts.silent) clean.forEach(function (o) { AppLog.audit(name, 'criar', o.id, null, o); });
        return clean;
      });
    }

    function insert(obj, opts) { return insertMany([obj], opts)[0]; }

    /** Atualiza campos de um registro (merge). */
    function update(id, patch, opts) {
      opts = opts || {};
      return withLock(function () {
        var data = read_(name, true);
        var email = Auth.email();
        var row = data.rows.filter(function (r) { return r.id === id && r.user_id === email; })[0];
        if (!row) throw Utils.error('NOT_FOUND', 'Registro não encontrado.');
        var before = strip_(row);
        var v = validate(name, patch, before);
        if (opts.sys) ['deleted_at'].forEach(function (k) { if (k in patch) v[k] = patch[k]; });
        var after = Object.assign({}, before, v, { updated_at: Utils.nowIso() });
        var sc = schema(name);
        var head = data.head;
        sheet_(name).getRange(row._r, 1, 1, head.length).setValues([head.map(function (h) { return toCell_(sc.byName[h], after[h]); })]);
        Object.assign(row, after);
        Cache.bump('t:' + name);
        if (!opts.silent) {
          var diff = changed_(before, after);
          var action = ('deleted_at' in v || 'deleted_at' in patch) ? (after.deleted_at ? 'excluir' : 'restaurar') : 'editar';
          AppLog.audit(name, action, id, diff.before, diff.after);
        }
        return after;
      });
    }

    /** Insere se o id não existe para o usuário; senão atualiza. */
    function upsert(obj, opts) {
      if (obj.id && get(obj.id)) {
        var patch = Object.assign({}, obj);
        COMMON.forEach(function (k) { delete patch[k]; });
        return update(obj.id, patch, opts);
      }
      return insert(obj, opts);
    }

    function softDelete(id) { return update(id, { deleted_at: Utils.nowIso() }, { sys: true }); }
    function restore(id) { return update(id, { deleted_at: null }, { sys: true }); }

    /** Remove fisicamente linhas (uso interno: limpeza de demo e retenção de logs). */
    function hardDelete(predicate) {
      return withLock(function () {
        var sh = sheet_(name);
        var values = sh.getDataRange().getValues();
        if (values.length < 2) return 0;
        var data = read_(name, true);
        var keepIdx = {};
        data.rows.forEach(function (r) { if (!predicate(r)) keepIdx[r._r] = true; });
        var kept = [];
        for (var i = 1; i < values.length; i++) if (keepIdx[i + 1] || !values[i][data.head.indexOf('id')]) { if (values[i].join('') !== '') kept.push(values[i]); }
        var removed = (values.length - 1) - kept.length;
        if (!removed) return 0;
        sh.getRange(2, 1, values.length - 1, values[0].length).clearContent();
        if (kept.length) sh.getRange(2, 1, kept.length, values[0].length).setValues(kept);
        delete memo_[name];
        Cache.bump('t:' + name);
        return removed;
      });
    }

    return {
      name: name, list: list, get: get, count: count, insert: insert, insertMany: insertMany,
      update: update, upsert: upsert, softDelete: softDelete, restore: restore, hardDelete: hardDelete
    };
  }

  /** Esquece o memo da requisição (usado após setup). */
  function resetMemo() { memo_ = {}; }

  return { ss: ss, preload: preload, schema: schema, validate: validate, table: table, withLock: withLock, resetMemo: resetMemo, COMMON: COMMON };
})();
