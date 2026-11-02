/**
 * Utilitários puros e helpers de erro/data. Sem dependências em tempo de carga.
 */
var Utils = (function () {
  var UUID_RE = /^(demo-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Cria um erro de aplicação com código padronizado.
   * @param {string} code VALIDATION | NOT_FOUND | LOCKED | QUOTA | OCR_FAILED | FORBIDDEN | UNKNOWN
   * @param {string} message mensagem humana em pt-BR
   * @param {string=} field campo relacionado (validação)
   * @return {Error}
   */
  function error(code, message, field) {
    var e = new Error(message);
    e.code = code;
    if (field) e.field = field;
    return e;
  }

  function tz_() { return CONFIG.TIMEZONE; }

  /** @return {string} data/hora ISO 8601 com fuso. */
  function nowIso() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX"); }

  /** @return {string} hoje em yyyy-MM-dd. */
  function today() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

  function fmt(date, pattern) { return Utilities.formatDate(date, tz_(), pattern || 'yyyy-MM-dd'); }

  /** Converte 'yyyy-MM-dd' em Date local (meio-dia, evita borda de fuso). */
  function parseDate(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }

  function addDays(s, n) {
    var d = parseDate(s); d.setDate(d.getDate() + n);
    return fmt(d);
  }

  /** Soma meses preservando o dia quando possível (31/01 + 1 mês = 28 ou 29/02). */
  function addMonths(s, n) {
    var d = parseDate(s);
    var day = d.getDate();
    var target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
    var last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, last));
    return fmt(target);
  }

  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }

  function monthKey(s) { return String(s).slice(0, 7); }

  function shiftMonthKey(key, n) {
    var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + (m < 9 ? '0' : '') + (m + 1);
  }

  function daysInMonth(key) {
    return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  }

  function uuid() { return Utilities.getUuid(); }
  function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }

  /** Dinheiro: sempre somar em centavos inteiros. */
  function toCents(v) { return Math.round(Number(v || 0) * 100); }
  function fromCents(c) { return Math.round(c) / 100; }
  function round2(v) { return Math.round(Number(v || 0) * 100) / 100; }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function parseJson(s, fallback) {
    if (s === null || s === undefined || s === '') return fallback;
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  /** Remove acentos e baixa caixa (busca e regras). */
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function sha256(s) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
    return bytes.map(function (b) { var h = (b & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
  }

  function sha256Bytes(bytes) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    return digest.map(function (b) { var h = (b & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
  }

  /** Garante que só tipos serializáveis voltem ao cliente (Date vira string). */
  function plain(obj) { return JSON.parse(JSON.stringify(obj === undefined ? null : obj)); }

  function groupBy(arr, key) {
    var out = {};
    arr.forEach(function (o) { var k = typeof key === 'function' ? key(o) : o[key]; (out[k] = out[k] || []).push(o); });
    return out;
  }

  function sum(arr, fn) { return arr.reduce(function (a, o) { return a + (fn ? fn(o) : o); }, 0); }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(v) {
    var c = toCents(v), neg = c < 0; c = Math.abs(c);
    var int = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + 'R$ ' + int + ',' + ('0' + (c % 100)).slice(-2);
  }

  function brDate(s) { return s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : ''; }

  return {
    error: error, nowIso: nowIso, today: today, fmt: fmt, parseDate: parseDate, addDays: addDays, addMonths: addMonths,
    diffDays: diffDays, monthKey: monthKey, shiftMonthKey: shiftMonthKey, daysInMonth: daysInMonth,
    uuid: uuid, isUuid: isUuid, toCents: toCents, fromCents: fromCents, round2: round2, clamp: clamp,
    parseJson: parseJson, norm: norm, sha256: sha256, sha256Bytes: sha256Bytes, plain: plain, groupBy: groupBy, sum: sum,
    escapeHtml: escapeHtml, money: money, brDate: brDate
  };
})();
