/**
 * Notificações push (Web Push com VAPID), entregues mesmo com o app fechado.
 *
 * Como funciona:
 *  1. O app instalado (casca PWA em pwa/) pede permissão e cria a inscrição no navegador do celular.
 *  2. O app manda a inscrição para cá (rota push.subscribe) e ela fica na aba push_inscricoes, no nome do usuário.
 *  3. Os gatilhos (lembretes a cada 15 min e o diário das 7h) chamam Push.dispatch(): se o usuário tem
 *     notificações novas, enviamos um "toque" vazio ao serviço de push do aparelho (FCM, Apple, Mozilla).
 *  4. O service worker acorda, busca o conteúdo em  <url do app>?push=<pid>  (doGet) e mostra a notificação.
 *
 * O toque vai sem conteúdo, então não é preciso criptografar payload; só assinamos o cabeçalho VAPID
 * (JWT ES256). A assinatura ECDSA P-256 é feita aqui mesmo, com BigInt.
 */

/** Rode no editor para ver/gerar a chave pública VAPID (a casca PWA não precisa dela; o app pede sozinho). */
function chavePush() { console.log(Push.config().publicKey); }

var Push = (function () {
  // ---------- Curva P-256 ----------
  var P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  var N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  var GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
  var GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  var ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), THREE = BigInt(3), FOUR = BigInt(4), EIGHT = BigInt(8);

  function mod(a, m) { var r = a % m; return r < ZERO ? r + m : r; }
  function inv(a, m) {
    var lm = ONE, hm = ZERO, low = mod(a, m), high = m;
    while (low > ONE) { var r = high / low; var nm = hm - lm * r, nw = high - low * r; hm = lm; lm = nm; high = low; low = nw; }
    return mod(lm, m);
  }
  // Coordenadas jacobianas (X, Y, Z); a = -3.
  function dbl(p) {
    if (p[2] === ZERO || p[1] === ZERO) return [ZERO, ONE, ZERO];
    var X = p[0], Y = p[1], Z = p[2];
    var ZZ = mod(Z * Z, P), YY = mod(Y * Y, P), S = mod(FOUR * X * YY, P);
    var M = mod(THREE * (X - ZZ) * (X + ZZ), P);
    var X3 = mod(M * M - TWO * S, P);
    var Y3 = mod(M * (S - X3) - EIGHT * YY * YY, P);
    var Z3 = mod(TWO * Y * Z, P);
    return [X3, Y3, Z3];
  }
  function add(p, q) {
    if (p[2] === ZERO) return q;
    if (q[2] === ZERO) return p;
    var Z1Z1 = mod(p[2] * p[2], P), Z2Z2 = mod(q[2] * q[2], P);
    var U1 = mod(p[0] * Z2Z2, P), U2 = mod(q[0] * Z1Z1, P);
    var S1 = mod(p[1] * q[2] * Z2Z2, P), S2 = mod(q[1] * p[2] * Z1Z1, P);
    if (U1 === U2) return S1 === S2 ? dbl(p) : [ZERO, ONE, ZERO];
    var H = mod(U2 - U1, P), R = mod(S2 - S1, P);
    var HH = mod(H * H, P), HHH = mod(H * HH, P), V = mod(U1 * HH, P);
    var X3 = mod(R * R - HHH - TWO * V, P);
    var Y3 = mod(R * (V - X3) - S1 * HHH, P);
    var Z3 = mod(H * p[2] * q[2], P);
    return [X3, Y3, Z3];
  }
  function mul(k, x, y) {
    var R = [ZERO, ONE, ZERO], Q = [x, y, ONE];
    while (k > ZERO) { if (k & ONE) R = add(R, Q); Q = dbl(Q); k >>= ONE; }
    var zi = inv(R[2], P), zi2 = mod(zi * zi, P);
    return [mod(R[0] * zi2, P), mod(R[1] * zi2 * zi, P)];
  }

  // ---------- bytes / hex / base64url ----------
  function hex32(b) { var s = b.toString(16); while (s.length < 64) s = '0' + s; return s; }
  function hexToBytes(h) { var out = []; for (var i = 0; i < h.length; i += 2) { var v = parseInt(h.substr(i, 2), 16); out.push(v > 127 ? v - 256 : v); } return out; }
  function bytesToHex(b) { return b.map(function (x) { var h = (x & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join(''); }
  function b64u(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
  function b64uStr(s) { return b64u(Utilities.newBlob(s).getBytes()); }
  function sha256Hex(s) { return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
  function randomScalar() {
    var seed = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
    var k = mod(BigInt('0x' + sha256Hex(seed)), N - ONE) + ONE;
    return k;
  }

  // ---------- chaves VAPID ----------
  function keys_() {
    var props = PropertiesService.getScriptProperties();
    var d = props.getProperty('VAPID_PRIVATE'), pub = props.getProperty('VAPID_PUBLIC');
    if (d && pub) return { d: BigInt('0x' + d), pub: pub };
    var k = randomScalar(), Q = mul(k, GX, GY);
    pub = b64u(hexToBytes('04' + hex32(Q[0]) + hex32(Q[1])));
    props.setProperty('VAPID_PRIVATE', hex32(k));
    props.setProperty('VAPID_PUBLIC', pub);
    return { d: k, pub: pub };
  }

  /** Assinatura ES256 (r||s, 64 bytes) de uma string. */
  function signES256(msg, d) {
    var e = BigInt('0x' + sha256Hex(msg));
    for (var i = 0; i < 8; i++) {
      var k = randomScalar(), R = mul(k, GX, GY), r = mod(R[0], N);
      if (r === ZERO) continue;
      var s = mod(inv(k, N) * (e + r * d), N);
      if (s === ZERO) continue;
      return hexToBytes(hex32(r) + hex32(s));
    }
    throw new Error('Falha ao assinar');
  }

  function jwt_(audience) {
    var cacheKey = 'vapid_' + sha256Hex(audience).slice(0, 16);
    var c = CacheService.getScriptCache().get(cacheKey);
    if (c) return c;
    var k = keys_();
    var owner = ''; try { owner = Session.getEffectiveUser().getEmail(); } catch (e) { owner = ''; }
    var head = b64uStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    var body = b64uStr(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + (owner || 'prumo@example.com') }));
    var unsigned = head + '.' + body;
    var token = unsigned + '.' + b64u(signES256(unsigned, k.d));
    CacheService.getScriptCache().put(cacheKey, token, 6 * 3600);
    return token;
  }

  // ---------- rotas ----------
  function config() { return { publicKey: keys_().pub }; }

  function pid_(endpoint) { return sha256Hex('push:' + endpoint).slice(0, 48); }

  /** @param {{sub:{endpoint:string, keys:Object}, dispositivo:string}} p */
  function subscribe(p) {
    var sub = p.sub || {};
    if (!/^https:\/\//.test(String(sub.endpoint || ''))) throw Utils.error('VALIDATION', 'Inscrição de push inválida.');
    var pid = pid_(sub.endpoint), t = Db.table('push_inscricoes');
    var row = t.list({ where: { pid: pid } })[0];
    var data = { pid: pid, endpoint: sub.endpoint, p256dh: (sub.keys && sub.keys.p256dh) || null, auth: (sub.keys && sub.keys.auth) || null,
      dispositivo: String(p.dispositivo || '').slice(0, 160), ativo: true, falhas: 0, entregue_ate: Utils.nowIso(), entregues_json: [] };
    if (row) t.update(row.id, data); else t.insert(data);
    PropertiesService.getScriptProperties().setProperty('push_' + pid, Auth.email());
    return { pid: pid, ativos: t.list({ where: { ativo: true } }).length };
  }

  /** @param {{endpoint:string}} p */
  function unsubscribe(p) {
    var pid = pid_(String(p.endpoint || '')), t = Db.table('push_inscricoes');
    t.list({ where: { pid: pid } }).forEach(function (r) { t.update(r.id, { ativo: false }); });
    try { PropertiesService.getScriptProperties().deleteProperty('push_' + pid); } catch (e) { /* ok */ }
    return { ok: true };
  }

  function status() {
    return { aparelhos: Db.table('push_inscricoes').list({ where: { ativo: true } }).map(function (r) { return { pid: r.pid, dispositivo: r.dispositivo, desde: r.created_at, ultimo_envio: r.ultimo_envio }; }) };
  }

  /** Rota: cria uma notificação de teste e dispara na hora. */
  function test() {
    Db.table('notificacoes').insert({ tipo: 'sistema', titulo: 'Notificações ativadas', corpo: 'É assim que os lembretes do Prumo vão aparecer neste aparelho.', data_ref: Utils.today(), link: '#/' }, { silent: true });
    var n = dispatch(true);
    if (!n.enviados) throw Utils.error('VALIDATION', n.ativos ? 'Não foi possível entregar agora. Tente de novo em instantes.' : 'Nenhum aparelho com push ativo. Ative neste celular primeiro.');
    return n;
  }

  /** Envia o "toque" para cada aparelho do usuário atual que tem notificação nova. */
  function dispatch(force) {
    if (!force && Auth.setting('notif.push', true) === false) return { enviados: 0, ativos: 0 };
    var t = Db.table('push_inscricoes'), subs = t.list({ where: { ativo: true } });
    if (!subs.length) return { enviados: 0, ativos: 0 };
    var notifs = Db.table('notificacoes').list().filter(function (n) { return !n.lida; });
    var sent = 0;
    subs.forEach(function (s) {
      if (!pending_(s, notifs).length) return;
      var res = send_(s.endpoint);
      if (res.ok) { sent++; t.update(s.id, { ultimo_envio: Utils.nowIso(), falhas: 0 }, { silent: true }); }
      else if (res.gone || (s.falhas || 0) >= 9) { t.update(s.id, { ativo: false }, { silent: true }); AppLog.info('notificacoes', 'push_removido', 'Aparelho sem inscrição válida: ' + (s.dispositivo || '')); }
      else t.update(s.id, { falhas: (s.falhas || 0) + 1 }, { silent: true });
    });
    return { enviados: sent, ativos: subs.length };
  }

  function send_(endpoint) {
    var aud = endpoint.match(/^https:\/\/[^/]+/)[0];
    try {
      var r = UrlFetchApp.fetch(endpoint, {
        method: 'post', muteHttpExceptions: true, contentType: 'application/octet-stream', payload: Utilities.newBlob([]).getBytes(),
        headers: { Authorization: 'vapid t=' + jwt_(aud) + ', k=' + keys_().pub, TTL: '86400', Urgency: 'high' }
      });
      var code = r.getResponseCode();
      if (code >= 200 && code < 300) return { ok: true };
      if (code === 404 || code === 410) return { gone: true };
      AppLog.warn('notificacoes', 'push_falhou', 'HTTP ' + code + ': ' + String(r.getContentText()).slice(0, 300));
      return { ok: false };
    } catch (e) { AppLog.warn('notificacoes', 'push_falhou', e.message); return { ok: false }; }
  }

  /** Notificações ainda não entregues a esta inscrição (marca d'água por data + ids já entregues). */
  function pending_(s, notifs) {
    var since = String(s.entregue_ate || s.created_at), done = {};
    (Array.isArray(s.entregues_json) ? s.entregues_json : []).forEach(function (id) { done[id] = 1; });
    return notifs.filter(function (n) { return !n.lida && String(n.created_at) >= since && !done[n.id]; });
  }

  /** doGet ?push=<pid>: o service worker busca o que mostrar. Público, mas só responde a quem tem o pid. */
  function pull(pid) {
    pid = String(pid || '').replace(/[^a-f0-9]/g, '').slice(0, 48);
    var email = pid.length === 48 ? PropertiesService.getScriptProperties().getProperty('push_' + pid) : null;
    if (!email) return { itens: [] };
    Auth.as(email);
    var t = Db.table('push_inscricoes'), s = t.list({ where: { pid: pid } })[0];
    if (!s || !s.ativo) return { itens: [] };
    var novas = pending_(s, Db.table('notificacoes').list()).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    if (novas.length) {
      var ids = (Array.isArray(s.entregues_json) ? s.entregues_json : []).concat(novas.map(function (n) { return n.id; })).slice(-80);
      t.update(s.id, { entregue_ate: novas[novas.length - 1].created_at, entregues_json: ids }, { silent: true });
    }
    var itens = novas.slice(-4).map(function (n) { return { id: n.id, titulo: n.titulo, corpo: n.corpo || '', link: n.link || '#/', tipo: n.tipo || '' }; });
    if (novas.length > 4) itens[0] = { id: 'resumo', titulo: novas.length + ' novidades no Prumo', corpo: novas.map(function (n) { return n.titulo; }).slice(0, 4).join(' · '), link: '#/', tipo: 'resumo' };
    return { itens: novas.length > 4 ? [itens[0]] : itens };
  }

  return { config: config, subscribe: subscribe, unsubscribe: unsubscribe, status: status, test: test, dispatch: dispatch, pull: pull,
    _ec: { mul: mul, signES256: signES256, keys_: keys_, GX: GX, GY: GY, N: N, jwt_: jwt_ } };
})();
