const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
const posts = () => G.graphCalls.filter((x) => x.opts.method === 'post');
c.setup();
const TOKEN = 'EAAG' + 'x'.repeat(120);
const dono = G.devLogin('voce@exemplo.com'), ana = G.devLogin('ana@exemplo.com');

let r = api('wa.status', {}, dono);
ok(r.ok && !r.data.conta.configurado && !r.data.usuario.ativo && r.data.usuario.modoTeste, 'começa desligado e em modo de teste');
r = api('wa.saveUser', { numero: '(11) 98765-4321', ativo: true }, dono);
ok(r.ok && r.data.usuario.numero === '5511987654321' && r.data.usuario.ativo, 'número normalizado com DDI 55');
r = api('wa.sendTest', {}, dono);
ok(r.ok && r.data.resultado === 'simulado' && G.graphCalls.length === 0, 'modo de teste: simula e não chama a Meta');
r = api('wa.saveUser', { numero: '11 98765-4321' }, ana);
ok(!r.ok && /outra pessoa/.test(r.error.message), 'mesmo número não pode ser de duas pessoas');

r = api('wa.saveConfig', { token: TOKEN, phoneId: '123456789012345' }, ana);
ok(!r.ok && r.error.code === 'FORBIDDEN', 'só o dono configura a conta da Meta');
r = api('wa.saveConfig', { token: 'curto', phoneId: '123456789012345' }, dono);
ok(!r.ok && r.error.field === 'token', 'token inválido recusado');
r = api('wa.saveConfig', { token: TOKEN, phoneId: '123456789012345', limiteMes: 5000 }, dono);
ok(!r.ok && r.error.field === 'limiteMes', 'limite mensal acima de 1.000 recusado');
r = api('wa.saveConfig', { token: TOKEN, phoneId: '123456789012345', versao: 'v26.0', limiteMes: 900 }, dono);
ok(r.ok && r.data.conta.configurado && r.data.conta.token === '••••' + TOKEN.slice(-4) && !r.data.conta.ativo, 'credenciais salvas, token só mascarado, envios reais ainda desligados');
ok(!JSON.stringify(r).includes(TOKEN) && !JSON.stringify(api('wa.status', {}, ana)).includes(TOKEN), 'token nunca volta ao navegador');
const sa = api('wa.status', {}, ana).data;
ok(!sa.conta.webhookUrl && !sa.conta.verifyToken && !sa.conta.phoneId, 'outros usuários não veem webhook nem IDs');
ok(G.SS.getSheets().every((s) => !JSON.stringify(s.getDataRange().getValues()).includes(TOKEN)), 'token não aparece em nenhuma aba da planilha');

G.setGraph((url, o) => (o.method === 'get' ? { code: 200, body: { display_phone_number: '+1 555-010-4567', verified_name: 'Test Number', quality_rating: 'GREEN', id: '123456789012345' } } : { code: 200, body: { messages: [{ id: 'wamid.T' + Math.random() }] } }));
r = api('wa.testConnection', {}, dono);
ok(r.ok && r.data.numero === '+1 555-010-4567' && G.graphCalls[0].url === 'https://graph.facebook.com/v26.0/123456789012345?fields=display_phone_number,verified_name,quality_rating,code_verification_status', 'teste de conexão é só leitura (GET no número)');
ok(G.graphCalls[0].opts.headers.Authorization === 'Bearer ' + TOKEN, 'token vai só no cabeçalho para a Meta');

r = api('wa.saveUser', { modo_teste: false }, dono);
r = api('wa.sendTest', {}, dono);
ok(!r.ok && /desligados pelo dono/.test(r.error.message) && posts().length === 0, 'sem liberar o envio real, nada sai');
api('wa.saveConfig', { ativo: true }, dono);
r = api('wa.sendTest', {}, dono);
ok(!r.ok && /Janela de 24 h fechada/.test(r.error.message) && posts().length === 0, 'janela fechada: não envia (evita erro e template)');
api('wa.markWindow', {}, dono);
r = api('wa.sendTest', {}, dono);
const p1 = posts()[0];
const body1 = p1 && JSON.parse(p1.opts.payload);
ok(r.ok && r.data.resultado === 'enviado' && body1.type === 'text' && body1.to === '+5511987654321' && !('template' in body1) && body1.messaging_product === 'whatsapp', 'envio real: texto livre para +55…, nunca template');
ok(p1.url === 'https://graph.facebook.com/v26.0/123456789012345/messages', 'endpoint oficial /{phone-number-id}/messages');
r = api('wa.sendTest', {}, dono);
ok(r.ok && r.data.resultado === 'duplicado' && posts().length === 1, 'clique repetido no mesmo minuto não duplica');

// automático: junta avisos numa mensagem só
G.resetMemo(); c.Auth.as('voce@exemplo.com');
api('wa.saveUser', { automatico: true, tipos: ['tarefa', 'conta'] }, dono);
G.resetMemo(); c.Auth.as('voce@exemplo.com');
c.Db.table('notificacoes').insertMany([
  { tipo: 'tarefa', titulo: 'Pagar internet', corpo: 'Vence 10:00', data_ref: '2026-10-29' },
  { tipo: 'conta', titulo: 'Conta de luz', corpo: 'R$ 180,00', data_ref: '2026-10-29' },
  { tipo: 'meta', titulo: 'Meta atrasada', corpo: '', data_ref: '2026-10-29' }], { silent: true });
let n0 = posts().length; G.resetMemo(); c.triggerReminders();
const lote = JSON.parse(posts()[posts().length - 1].opts.payload).text.body;
ok(posts().length === n0 + 1 && /2 avisos/.test(lote) && /Pagar internet/.test(lote) && /Conta de luz/.test(lote) && !/Meta atrasada/.test(lote), 'gatilho junta os avisos escolhidos numa mensagem só');
n0 = posts().length; G.resetMemo(); c.triggerReminders();
ok(posts().length === n0, 'rodar de novo não reenvia');

// limite diário
api('wa.saveUser', { limiteDia: 2 }, dono);
G.resetMemo(); c.Auth.as('voce@exemplo.com');
c.Db.table('notificacoes').insert({ tipo: 'tarefa', titulo: 'Outra tarefa', data_ref: '2026-10-29' }, { silent: true });
n0 = posts().length; G.resetMemo(); c.triggerReminders();
ok(posts().length === n0, 'limite diário atingido (2): pausa os automáticos');
G.resetMemo(); c.Auth.as('voce@exemplo.com');
ok(c.Db.table('logs').list().some((l) => l.modulo === 'whatsapp' && l.acao === 'limite'), 'aviso de limite no log');
api('wa.saveUser', { limiteDia: 20 }, dono);
// limite mensal global
const mk = [...G.props.keys()].find((k) => k.startsWith('WA_MES_'));
ok(G.props.get(mk) === '2', 'contador do mês conta só envios reais (2)');
G.props.set(mk, '900'); n0 = posts().length; G.resetMemo(); c.triggerReminders();
ok(posts().length === n0, 'limite mensal (900) atingido: nada sai');
G.props.set(mk, '2');

// erros da Meta
G.setGraph(() => ({ code: 400, body: { error: { message: 'Re-engagement message', code: 131047, error_data: { details: 'More than 24 hours' } } } }));
G.resetMemo(); c.Auth.as('voce@exemplo.com'); n0 = posts().length; G.resetMemo(); c.triggerReminders();
let st = api('wa.status', {}, dono).data;
ok(posts().length === n0 + 1 && !st.usuario.janelaAberta && st.historico.some((m) => m.status === 'falhou' && /janela/.test(m.erro)), '131047: marca a janela como fechada e registra a falha');
G.resetMemo(); c.Auth.as('voce@exemplo.com'); n0 = posts().length; G.resetMemo(); c.triggerReminders();
ok(posts().length === n0, 'com a janela fechada, não insiste');
api('wa.markWindow', {}, dono);
G.setGraph(() => ({ code: 401, body: { error: { message: 'Error validating access token', code: 190 } } }));
G.resetMemo(); c.Auth.as('voce@exemplo.com'); c.Db.table('notificacoes').insert({ tipo: 'tarefa', titulo: 'Depois do 190', data_ref: '2026-10-29' }, { silent: true });
G.resetMemo(); c.triggerReminders();
st = api('wa.status', {}, dono).data;
ok(st.conta.ativo === false && st.historico.some((m) => m.status === 'falhou' && /token/.test(m.erro)), '190: token inválido desliga os envios reais e explica no histórico');
api('wa.saveConfig', { ativo: true }, dono);
G.setGraph((url, o) => ({ code: 200, body: { messages: [{ id: 'wamid.W' + Math.random() }] } }));

// webhook
const info = api('wa.status', {}, dono).data.conta;
const key = info.webhookUrl.split('?wa=')[1];
ok(c.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': info.verifyToken, 'hub.challenge': '1158201444' } }).getContent() === '1158201444', 'webhook: devolve o hub.challenge em texto puro');
ok(c.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '1' } }).getContent() === 'forbidden', 'webhook: verify token errado é recusado');
api('wa.saveUser', { numero: '' }, dono); api('wa.saveUser', { numero: '+55 11 98765-4321', ativo: true }, dono);
st = api('wa.status', {}, dono).data;
ok(!st.usuario.janelaAberta, 'trocar o número fecha a janela');
const payload = (txt, id) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550104567', phone_number_id: '123456789012345' }, contacts: [{ wa_id: '551187654321' }], messages: [{ from: '551187654321', id: id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: txt } }] } }] }] });
ok(c.doPost({ parameter: {}, postData: { contents: payload('hoje', 'wamid.IN1') } }).getContent() === 'ignorado', 'POST sem a chave secreta é ignorado');
n0 = posts().length; G.resetMemo();
c.doPost({ parameter: { wa: key }, postData: { contents: payload('hoje', 'wamid.IN1') } });
st = api('wa.status', {}, dono).data;
ok(st.usuario.janelaAberta && st.usuario.janelaOrigem === 'webhook', 'mensagem recebida abre a janela (wa_id sem o 9º dígito reconhecido)');
const resp = posts().slice(n0).map((x) => JSON.parse(x.opts.payload).text.body);
ok(resp.length === 1 && /Prumo · hoje/.test(resp[0]), 'comando "hoje" responde com o resumo do dia');
G.resetMemo(); c.doPost({ parameter: { wa: key }, postData: { contents: payload('hoje', 'wamid.IN1') } });
ok(posts().length === n0 + 1, 'reentrega da Meta não duplica a resposta');
const sent = st.historico.find((m) => m.status === 'enviado' || m.status === 'entregue');
G.resetMemo(); c.Auth.as('voce@exemplo.com');
const row = c.Db.table('wa_mensagens').list().find((m) => m.origem === 'resposta');
G.resetMemo();
c.doPost({ parameter: { wa: key }, postData: { contents: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '123456789012345' }, statuses: [{ id: row.wamid, status: 'read', recipient_id: '551187654321' }] } }] }] }) } });
G.resetMemo(); c.Auth.as('voce@exemplo.com');
ok(c.Db.table('wa_mensagens').get(row.id).status === 'lido', 'status do webhook (lido) atualiza o histórico');
G.resetMemo(); c.doPost({ parameter: { wa: key }, postData: { contents: payload('oi', 'wamid.FAKE').replace('123456789012345', '999') } });
G.resetMemo(); c.Auth.as('voce@exemplo.com');
ok(!c.Db.table('wa_mensagens').list().some((m) => m.wamid === 'wamid.FAKE'), 'POST de outro número comercial é ignorado');
ok(G.graphCalls.every((x) => !x.opts.payload || !JSON.parse(x.opts.payload).template), 'nenhuma chamada com template em todo o teste');
G.resetMemo(); c.Auth.as('voce@exemplo.com');
ok(!JSON.stringify(c.Db.table('logs').list()).includes(TOKEN), 'token nunca vai para os logs');
c.whatsappDesligar(); ok(api('wa.status', {}, dono).data.conta.ativo === false, 'whatsappDesligar() corta tudo');
