/**
 * Log de auditoria e erros na aba "logs". Bufferiza na requisição e grava em lote no fim.
 * (Namespace AppLog para não colidir com o Logger nativo do Apps Script.)
 */
var AppLog = (function () {
  var buffer_ = [];
  var ctx_ = { modulo: '', dispositivo: '', t0: 0 };
  var MAX_JSON = 20000;

  function trim_(o) {
    if (o === null || o === undefined) return null;
    var s = JSON.stringify(o);
    if (s.length <= MAX_JSON) return o;
    return { truncado: true, previa: s.slice(0, 2000) };
  }

  /** Contexto da requisição (rota e dispositivo do cliente). */
  function begin(route, device) {
    ctx_ = { modulo: String(route || '').split('.')[0], dispositivo: String(device || '').slice(0, 160), t0: Date.now(), route: route };
  }

  function push_(nivel, modulo, acao, entidade, id, antes, depois, msg) {
    buffer_.push({
      ts: Utils.nowIso(), nivel: nivel, modulo: modulo || ctx_.modulo, acao: acao || ctx_.route || '',
      entidade: entidade || null, entidade_id: id || null, antes_json: trim_(antes), depois_json: trim_(depois),
      mensagem: msg ? String(msg).slice(0, 4000) : null, dispositivo: ctx_.dispositivo || null,
      duracao_ms: ctx_.t0 ? Date.now() - ctx_.t0 : null,
      _u: Auth.email()
    });
  }

  function audit(entidade, acao, id, antes, depois) {
    if (entidade === 'logs') return;
    var mod = String(entidade).split('_')[0];
    push_('audit', { fin: 'financas', fit: 'fitness', nut: 'alimentacao', tar: 'tarefas', met: 'metas', rot: 'rotinas' }[mod] || entidade, acao, entidade, id, antes, depois, null);
  }

  function info(modulo, acao, msg) { push_('info', modulo, acao, null, null, null, null, msg); }
  function warn(modulo, acao, msg) { push_('warn', modulo, acao, null, null, null, null, msg); }

  function error(modulo, acao, err, extra) {
    var msg = (err && err.message) ? err.message : String(err);
    var stack = err && err.stack ? String(err.stack).split('\n').slice(0, 6).join('\n') : '';
    push_('error', modulo, acao, null, null, null, extra || null, msg + (stack ? '\n' + stack : ''));
    try { console.error(msg, stack); } catch (e) { /* noop */ }
  }

  /** Grava o buffer. Nunca lança: log não pode derrubar a requisição. */
  function flush() {
    if (!buffer_.length) return;
    var items = buffer_; buffer_ = [];
    var byUser = {};
    items.forEach(function (it) { var u = it._u; delete it._u; (byUser[u] = byUser[u] || []).push(it); });
    try { Object.keys(byUser).forEach(function (u) { Db.table('logs').insertMany(byUser[u], { silent: true, userId: u }); }); } catch (e) { try { console.error('Falha ao gravar logs', e); } catch (x) { /* noop */ } }
  }

  /** Rota: erros do cliente enviados em lote. @param {{items:Object[]}} p */
  function clientErrors(p) {
    (p.items || []).slice(0, 30).forEach(function (it) {
      push_('error', 'cliente', String(it.acao || 'erro_js').slice(0, 40), null, null, null, { url: it.url, linha: it.linha }, String(it.mensagem || '').slice(0, 2000));
    });
    return { recebidos: Math.min((p.items || []).length, 30) };
  }

  /** Rota: lista logs com filtros e paginação. */
  function list(p) {
    p = p || {};
    var q = Utils.norm(p.q || '');
    var rows = Db.table('logs').list().filter(function (r) {
      if (p.nivel && r.nivel !== p.nivel) return false;
      if (p.modulo && r.modulo !== p.modulo) return false;
      if (p.de && String(r.ts).slice(0, 10) < p.de) return false;
      if (p.ate && String(r.ts).slice(0, 10) > p.ate) return false;
      if (q && Utils.norm([r.acao, r.entidade, r.mensagem, r.entidade_id].join(' ')).indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var total = rows.length, offset = p.offset || 0, limit = p.all ? total : Math.min(p.limit || 50, 200);
    return { total: total, items: rows.slice(offset, offset + limit) };
  }

  /** Rota: remove logs mais antigos que N dias. */
  function purge(p) {
    var days = Math.max(7, Number(p && p.dias) || CONFIG.LOG_RETENTION_DAYS);
    var cutoff = Utils.addDays(Utils.today(), -days);
    var email = Auth.email();
    var n = Db.table('logs').hardDelete(function (r) { return r.user_id === email && String(r.ts).slice(0, 10) < cutoff; });
    info('sistema', 'limpar_logs', n + ' registros removidos (anteriores a ' + Utils.brDate(cutoff) + ')');
    return { removidos: n };
  }

  /** Rota: exporta logs filtrados em CSV para a pasta exportacoes. */
  function exportCsv(p) {
    var all = list(Object.assign({}, p, { offset: 0, all: true })).items;
    var head = ['ts', 'nivel', 'modulo', 'acao', 'entidade', 'entidade_id', 'mensagem', 'duracao_ms'];
    var csv = [head.join(';')].concat(all.map(function (r) {
      return head.map(function (h) { return '"' + String(r[h] === null || r[h] === undefined ? '' : r[h]).replace(/"/g, '""') + '"'; }).join(';');
    })).join('\n');
    return Files.saveExport('logs_' + Utils.fmt(new Date(), 'yyyyMMdd_HHmm') + '.csv', 'text/csv', '﻿' + csv);
  }

  return { begin: begin, audit: audit, info: info, warn: warn, error: error, flush: flush, clientErrors: clientErrors, list: list, purge: purge, exportCsv: exportCsv };
})();
