const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
c.setup();
const TOKEN = '8123456789:AAH' + 'k'.repeat(32);
let updates = [], nextMsg = 100, sendFail = null;
G.setTg((method, body, url) => {
  if (!url.includes(TOKEN)) return { ok: false, error_code: 401, description: 'Unauthorized' };
  if (method === 'getMe') return { ok: true, result: { id: 8123456789, is_bot: true, first_name: 'Prumo', username: 'prumo_teste_bot' } };
  if (method === 'deleteWebhook') return { ok: true, result: true };
  if (method === 'getUpdates') return { ok: true, result: updates.filter((u) => u.update_id >= (body.offset || 0)) };
  if (method === 'sendMessage') { if (sendFail) return sendFail; return { ok: true, result: { message_id: nextMsg++, chat: { id: body.chat_id } } }; }
  return { ok: false, error_code: 404, description: 'Not Found' };
});
const sends = () => G.tgCalls.filter((x) => x.method === 'sendMessage');
const dono = G.devLogin('voce@exemplo.com'), ana = G.devLogin('ana@exemplo.com');
ok(G.triggers.some((t) => t.getHandlerFunction() === 'triggerFrequente'), 'setup cria o gatilho de 5 min (Telegram + alarmes)');

let r = api('tg.status', {}, dono);
ok(r.ok && !r.data.bot.configurado && !r.data.usuario.conectado, 'começa sem bot e sem conexão');
r = api('tg.saveConfig', { token: TOKEN }, ana);
ok(!r.ok && r.error.code === 'FORBIDDEN', 'só o dono configura o bot');
r = api('tg.saveConfig', { token: 'abc' }, dono);
ok(!r.ok && r.error.field === 'token', 'formato de token inválido recusado');
r = api('tg.saveConfig', { token: '8123456789:AAH' + 'x'.repeat(32) }, dono);
ok(!r.ok && /não reconheceu/.test(r.error.message), 'token que o Telegram recusa (401) não é salvo');
r = api('tg.saveConfig', { token: TOKEN }, dono);
ok(r.ok && r.data.bot.configurado && r.data.bot.bot === 'prumo_teste_bot' && r.data.bot.token === '••••' + TOKEN.slice(-4), 'token conferido com getMe, @bot salvo, token só mascarado');
ok(G.tgCalls.some((x) => x.method === 'deleteWebhook'), 'desliga webhook antigo (para usar getUpdates)');
ok(!JSON.stringify(api('tg.status', {}, ana)).includes(TOKEN) && !JSON.stringify(r).includes(TOKEN), 'token nunca vai ao navegador');

// conexão por deep link
r = api('tg.linkCode', {}, dono);
const code = r.data.url.split('start=')[1];
ok(r.ok && /^https:\/\/t\.me\/prumo_teste_bot\?start=[a-f0-9]{20}$/.test(r.data.url), 'link de conexão t.me/<bot>?start=<código>');
updates.push({ update_id: 5001, message: { message_id: 1, from: { id: 777, first_name: 'Gois' }, chat: { id: 777, type: 'private' }, date: 1, text: '/start ' + code } });
r = api('tg.poll', {}, dono);
ok(r.ok && r.data.usuario.conectado && r.data.usuario.nome === 'Gois' && r.data.usuario.ativo, '"Verificar" lê o /start e conecta o chat ao usuário certo');
ok(sends().length === 1 && sends()[0].body.chat_id === '777' && /Prumo conectado/.test(sends()[0].body.text) && sends()[0].body.parse_mode === 'HTML', 'confirmação enviada no Telegram');
ok(G.props.get('TG_OFFSET') === '5002', 'offset avança: o update não é lido de novo');
r = api('tg.poll', {}, dono);
ok(sends().length === 1, 'segunda leitura não repete nada');

// estranho e link vencido
updates.push({ update_id: 5002, message: { message_id: 2, from: { id: 999, first_name: 'X' }, chat: { id: 999, type: 'private' }, text: 'oi' } });
updates.push({ update_id: 5003, message: { message_id: 3, from: { id: 998 }, chat: { id: 998, type: 'private' }, text: '/start ' + 'f'.repeat(20) } });
c.triggerTelegram();
ok(sends().filter((s) => s.body.chat_id === '999' || s.body.chat_id === '998').length === 2 && !api('tg.status', {}, ana).data.usuario.conectado, 'quem não está conectado recebe só instruções; link inválido não conecta ninguém');

// teste e comandos
r = api('tg.sendTest', {}, dono);
ok(r.ok && r.data.resultado === 'enviado', 'mensagem de teste enviada');
updates.push({ update_id: 5004, message: { message_id: 4, from: { id: 777 }, chat: { id: 777, type: 'private' }, text: '/hoje' } });
c.triggerTelegram();
ok(/Prumo · hoje/.test(sends()[sends().length - 1].body.text), '/hoje responde com o resumo do dia');
updates.push({ update_id: 5005, message: { message_id: 5, from: { id: 777 }, chat: { id: 777, type: 'private' }, text: 'qualquer coisa' } });
c.triggerTelegram();
ok(/\/hoje/.test(sends()[sends().length - 1].body.text), 'texto livre recebe a ajuda');

// automáticos
api('tg.saveUser', { automatico: true, tipos: ['tarefa', 'conta'] }, dono);
G.resetMemo(); c.Auth.as('voce@exemplo.com');
c.Db.table('notificacoes').insertMany([
  { tipo: 'tarefa', titulo: 'Pagar <internet>', corpo: 'Vence 10:00', data_ref: '2026-10-30' },
  { tipo: 'conta', titulo: 'Luz', corpo: 'R$ 180,00', data_ref: '2026-10-30' },
  { tipo: 'meta', titulo: 'Meta X', data_ref: '2026-10-30' }], { silent: true });
let n0 = sends().length; G.resetMemo(); c.triggerReminders();
const lote = sends()[sends().length - 1].body.text;
ok(sends().length === n0 + 1 && /2 avisos/.test(lote) && /Pagar &lt;internet&gt;/.test(lote) && !/Meta X/.test(lote), 'gatilho junta os avisos escolhidos numa mensagem (HTML escapado)');
n0 = sends().length; G.resetMemo(); c.triggerReminders();
ok(sends().length === n0, 'não reenvia os mesmos avisos');
updates.push({ update_id: 5006, message: { message_id: 6, from: { id: 777 }, chat: { id: 777, type: 'private' }, text: '/parar' } });
c.triggerTelegram();
ok(api('tg.status', {}, dono).data.usuario.automatico === false, '/parar desliga os avisos automáticos');

// resumo diário
api('tg.saveUser', { resumo: true }, dono);
n0 = sends().length; G.resetMemo(); c.triggerDaily();
ok(sends().slice(n0).some((s) => /Prumo · hoje/.test(s.body.text)), 'resumo das 7h enviado');
n0 = sends().length; G.resetMemo(); c.triggerDaily();
ok(!sends().slice(n0).some((s) => /Prumo · hoje/.test(s.body.text)), 'resumo não duplica no mesmo dia');

// limite diário
api('tg.saveUser', { limiteDia: 1, automatico: true }, dono);
G.resetMemo(); c.Auth.as('voce@exemplo.com'); c.Db.table('notificacoes').insert({ tipo: 'tarefa', titulo: 'Acima do limite', data_ref: '2026-10-30' }, { silent: true });
n0 = sends().length; G.resetMemo(); c.triggerReminders();
ok(sends().length === n0 && api('tg.status', {}, dono).data.historico.some((m) => m.status === 'bloqueado' && /Limite diário/.test(m.erro)), 'limite diário respeitado (bloqueia e registra)');
api('tg.saveUser', { limiteDia: 30 }, dono);

// erros
sendFail = { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
G.resetMemo(); c.Auth.as('voce@exemplo.com'); c.Db.table('notificacoes').insert({ tipo: 'tarefa', titulo: 'Y', data_ref: '2026-10-30' }, { silent: true });
api('tg.saveUser', { automatico: true }, dono);
G.resetMemo(); c.Auth.as('voce@exemplo.com'); c.Db.table('notificacoes').insert({ tipo: 'tarefa', titulo: 'Z', data_ref: '2026-10-30' }, { silent: true });
G.resetMemo(); c.triggerReminders();
let s = api('tg.status', {}, dono).data;
ok(!s.usuario.ativo && s.historico.some((m) => m.status === 'falhou' && /bloqueado/.test(m.erro)), '403 (bot bloqueado): desliga para o usuário e explica');
sendFail = null;

// logs sem token
G.resetMemo(); c.Auth.as('voce@exemplo.com');
ok(!JSON.stringify(c.Db.table('logs').list()).includes(TOKEN), 'token nunca vai para os logs');
ok(G.SS.getSheets().every((sh) => !JSON.stringify(sh.getDataRange().getValues()).includes(TOKEN)), 'token não aparece na planilha');
r = api('tg.unlink', {}, dono);
ok(r.ok && !r.data.usuario.conectado && !G.props.has('TG_CHAT_777'), 'desconectar remove o vínculo');
