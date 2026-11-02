const crypto = require('crypto');
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
c.setup();
const b64u = (s) => Buffer.from(s, 'base64url');

// 1) chave pública derivada bate com a do Node
const t0 = Date.now();
const tok = G.devLogin('ana@exemplo.com');
let r = api('push.config', {}, tok);
ok(r.ok && b64u(r.data.publicKey).length === 65 && b64u(r.data.publicKey)[0] === 4, 'chave pública VAPID (65 bytes, 0x04) em ' + (Date.now() - t0) + ' ms');
const priv = Buffer.from(G.props.get('VAPID_PRIVATE'), 'hex');
const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(priv);
ok(ecdh.getPublicKey().equals(b64u(r.data.publicKey)), 'chave pública = d·G conferida pelo OpenSSL');
const pub = b64u(r.data.publicKey);
const jwk = { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') };
const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });

// 2) assinaturas ES256 verificadas pelo OpenSSL
let good = 0; const t1 = Date.now();
for (let i = 0; i < 20; i++) {
  const msg = 'mensagem ' + i + ' ' + Math.random();
  const sig = Buffer.from(c.Push._ec.signES256(msg, BigInt('0x' + G.props.get('VAPID_PRIVATE'))).map((b) => (b < 0 ? b + 256 : b)));
  if (sig.length === 64 && crypto.verify('sha256', Buffer.from(msg), { key, dsaEncoding: 'ieee-p1363' }, sig)) good++;
}
ok(good === 20, `20/20 assinaturas ES256 válidas (${good}) · ${Math.round((Date.now() - t1) / 20)} ms cada`);

// 3) inscrição, disparo e busca
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'x', auth: 'y' } };
r = api('push.subscribe', { sub, dispositivo: 'Android' }, tok);
ok(r.ok && r.data.pid.length === 48 && r.data.ativos === 1, 'inscrição salva no nome do usuário');
const pid = r.data.pid;
G.pushCalls.length = 0;
r = api('push.test', {}, tok);
ok(r.ok && r.data.enviados === 1 && G.pushCalls.length === 1, 'teste dispara 1 push');
const call = G.pushCalls[0];
const m = call.opts.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
ok(m && m[2] === jwk.x && false || (m && b64u(m[2]).equals(pub)), 'cabeçalho vapid t=…, k=chave pública');
const [h, p, s] = m[1].split('.');
const claims = JSON.parse(b64u(p).toString());
ok(claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000 && /^mailto:/.test(claims.sub), 'JWT: aud = origem do endpoint, exp, sub mailto');
ok(crypto.verify('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' }, b64u(s)), 'JWT do push com assinatura válida');
ok(call.opts.headers.TTL && call.opts.method === 'post', 'TTL e POST');
let out = JSON.parse(c.doGet({ parameter: { push: pid } }).getContent());
ok(out.itens.length === 1 && out.itens[0].titulo === 'Notificações ativadas', 'service worker busca o conteúdo pelo pid');
out = JSON.parse(c.doGet({ parameter: { push: pid } }).getContent());
ok(out.itens.length === 0, 'não repete o que já foi entregue');
out = JSON.parse(c.doGet({ parameter: { push: 'f'.repeat(48) } }).getContent());
ok(out.itens.length === 0, 'pid desconhecido não vê nada');

// 4) gatilho: lembrete de tarefa vira push
G.resetMemo(); c.Auth.as('ana@exemplo.com');
const agora = new Date(Date.now() + 10 * 60000);
const pad = (n) => String(n).padStart(2, '0');
api('db.save', { table: 'tar_tarefas', row: { titulo: 'Pagar internet', data_vencimento: `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`, hora: `${pad(agora.getHours())}:${pad(agora.getMinutes())}`, lembrete_min_antes: 15 } }, tok);
G.pushCalls.length = 0; G.resetMemo();
c.triggerReminders();
ok(G.pushCalls.length >= 1, 'gatilho de 15 min envia push do lembrete');
out = JSON.parse(c.doGet({ parameter: { push: pid } }).getContent());
ok(out.itens.some((i) => i.titulo === 'Pagar internet' && i.link === '#/tar'), 'conteúdo do lembrete chega ao aparelho');
G.pushCalls.length = 0; G.resetMemo(); c.triggerReminders();
ok(G.pushCalls.length === 0, 'sem novidade, sem push');

// 5) inscrição expirada é desativada
G.setPushStatus(410);
r = api('push.test', {}, tok);
G.setPushStatus(201);
r = api('push.status', {}, tok);
ok(r.ok && r.data.aparelhos.length === 0, 'endpoint 410 desativa a inscrição');

// 6) outro usuário não recebe nem vê
const tokB = G.devLogin('bruno@exemplo.com');
r = api('push.status', {}, tokB);
ok(r.ok && r.data.aparelhos.length === 0, 'Bruno não vê aparelhos da Ana');
