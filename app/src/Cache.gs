/**
 * Cache do script com versão por namespace (invalidação O(1)) e fragmentação de valores grandes.
 */
var Cache = (function () {
  var MAX_TOTAL = 2500000; // acima disso não vale a pena cachear

  function store_() { return CacheService.getScriptCache(); }

  function version_(ns) {
    var key = 'v:' + ns;
    var v = store_().get(key);
    if (!v) { v = String(Date.now()); store_().put(key, v, CONFIG.CACHE_TTL_S); }
    return v;
  }

  /** Invalida todas as chaves de um namespace. */
  function bump(ns) {
    store_().put('v:' + ns, String(Date.now()) + Math.random().toString(36).slice(2, 6), CONFIG.CACHE_TTL_S);
  }

  function base_(ns, key) { return 'd:' + ns + ':' + version_(ns) + ':' + key; }

  /** @return {*} valor ou null */
  function get(ns, key) {
    try {
      var base = base_(ns, key);
      var head = store_().get(base);
      if (!head) return null;
      var meta = JSON.parse(head);
      if (!meta.n) return meta.v;
      var keys = [];
      for (var i = 0; i < meta.n; i++) keys.push(base + ':' + i);
      var parts = store_().getAll(keys);
      var s = '';
      for (var j = 0; j < keys.length; j++) {
        if (parts[keys[j]] === undefined || parts[keys[j]] === null) return null;
        s += parts[keys[j]];
      }
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  }

  function put(ns, key, value, ttl) {
    try {
      var base = base_(ns, key);
      var s = JSON.stringify(value);
      var t = ttl || CONFIG.CACHE_TTL_S;
      if (s.length > MAX_TOTAL) return;
      if (s.length <= CONFIG.CACHE_CHUNK) { store_().put(base, JSON.stringify({ n: 0, v: value }), t); return; }
      var chunks = {}, n = 0;
      for (var i = 0; i < s.length; i += CONFIG.CACHE_CHUNK) { chunks[base + ':' + n] = s.slice(i, i + CONFIG.CACHE_CHUNK); n++; }
      store_().putAll(chunks, t);
      store_().put(base, JSON.stringify({ n: n }), t);
    } catch (e) {
      // cache é otimização: falha silenciosa
    }
  }

  function clearAll() {
    Object.keys(SCHEMA).forEach(function (t) { bump('t:' + t); });
    bump('files'); bump('off');
  }

  return { get: get, put: put, bump: bump, clearAll: clearAll };
})();
