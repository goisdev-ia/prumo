// Telegram: catálogo de comandos (tela Configurações › Comandos do Telegram) conferido contra o bot de verdade —
// cada exemplo é enviado e precisa ser tratado (não cair na ajuda genérica); menu "/" (setMyCommands) só pelo dono;
// questão com texto de apoio cabe no limite de 4.096 caracteres.
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };
c.setup();
const TOKEN = '8123456789:AAH' + 'k'.repeat(32);
let updates = [], uid = 5000, nextMsg = 10;
G.setTg((method, body) => {
  if (method === 'getMe') return { ok: true, result: { id: 1, is_bot: true, first_name: 'Prumo', username: 'prumo_teste_bot' } };
  if (method === 'deleteWebhook' || method === 'setMyCommands') return { ok: true, result: true };
  if (method === 'getUpdates') return { ok: true, result: updates.filter((u) => u.update_id >= (body.offset || 0)) };
  if (method === 'sendMessage' || method === 'sendDocument') return { ok: true, result: { message_id: nextMsg++, document: { file_id: 'F' + nextMsg } } };
  if (method === 'getFile') return { ok: true, result: { file_path: 'x.bin' } };
  return { ok: false, error_code: 404 };
});
const eu = G.devLogin('voce@exemplo.com'), ana = G.devLogin('ana@exemplo.com');
must(api('tg.saveConfig', { token: TOKEN }, eu), 'cfg');
const link = must(api('tg.linkCode', {}, eu), 'link').url.split('start=')[1];
updates.push({ update_id: ++uid, message: { message_id: 1, from: { id: 777, first_name: 'Gois' }, chat: { id: 777, type: 'private' }, text: '/start ' + link } });
c.triggerFrequente();
const say = (text) => { G.tgCalls.length = 0; updates.push({ update_id: ++uid, message: { message_id: uid, from: { id: 777, first_name: 'Gois' }, chat: { id: 777, type: 'private' }, date: 1, text } }); G.resetMemo(); c.triggerFrequente(); return G.tgCalls.filter((x) => x.method === 'sendMessage' || x.method === 'sendDocument').map((x) => x.body.text || x.body.caption || '[documento]').join('\n---\n'); };
// dados mínimos para os comandos terem o que responder
const conc = must(api('db.save', { table: 'est_concursos', row: { nome: 'BB', principal: true } }, eu), 'c').row;
must(api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [{ disciplina: 'Língua Portuguesa', assunto: 'Crase' }] }, eu), 'ed');
must(api('est.questionSave', { tipo: 'multipla', enunciado: 'Uso da crase: vou à praia', alternativas_json: [{ letra: 'A', texto: 'certo' }, { letra: 'B', texto: 'errado' }], gabarito: 'A', tags: 'crase' }, eu), 'q');

const generica = say('/comando_que_nao_existe');
ok(/\/hoje — resumo do dia/.test(generica), 'mensagem desconhecida recebe a ajuda genérica');
const cat = must(api('tg.commands', {}, eu), 'cat');
ok(cat.comandos.length >= 24 && cat.outros.length >= 8 && cat.bot === 'prumo_teste_bot' && cat.dono === true, `catálogo: ${cat.comandos.length} comandos + ${cat.outros.length} respostas/frases/arquivos`);
const naoTratados = [];
cat.comandos.forEach((x) => {
  const r = say(x.exemplo);
  if (!r || r === generica) naoTratados.push(x.exemplo);
  (x.aliases || []).forEach((al) => { const r2 = say(al + x.exemplo.slice(x.cmd.length)); if (!r2 || r2 === generica) naoTratados.push(al); });
  if (/\/cancelar|\/status/.test(x.cmd)) return;
  say('cancelar');
});
ok(!naoTratados.length, 'cada comando do catálogo (e cada apelido) é tratado pelo bot' + (naoTratados.length ? ' → não tratados: ' + naoTratados.join(', ') : ''));
ok(/rotinas|tarefas|Nada pendente|Prumo · hoje/i.test(say('hoje')), '"hoje" sem barra também funciona');
const outros = cat.outros.map((x) => x.cmd).join(' | ');
ok(/1, 2, 3/.test(outros) && /A, B, C, D, E/.test(outros) && /PDF, planilha ou foto/.test(outros) && /relatório da semana em pdf/.test(outros), 'catálogo inclui respostas numeradas, letras da série, frases e envio de arquivos');
// menu "/" do Telegram
G.tgCalls.length = 0;
const m = must(api('tg.setCommands', {}, eu), 'menu');
const sc = G.tgCalls.find((x) => x.method === 'setMyCommands');
ok(m.total >= 20 && sc && sc.body.commands.length === m.total && sc.body.commands.every((x) => /^[a-z0-9_]{1,32}$/.test(x.command) && x.description.length <= 256), `"Publicar no menu" manda ${m.total} comandos válidos (setMyCommands)`);
ok(api('tg.setCommands', {}, ana).error.code === 'FORBIDDEN', 'só o dono publica o menu do bot');
ok(api('tg.commands', {}, ana).ok && !api('tg.commands', {}, ana).data.dono, 'qualquer pessoa logada vê a lista de comandos');
// questão com texto de apoio longo no Telegram
const q2 = must(api('est.questionSave', { tipo: 'multipla', texto_base: 'Texto longo de apoio. '.repeat(400), enunciado: 'Segundo o texto, a ideia central é', alternativas_json: 'ABCDE'.split('').map((l) => ({ letra: l, texto: 'Opção ' + l + ' '.repeat(5) + 'x'.repeat(200) })), gabarito: 'C', tags: 'apoio' }, eu), 'q2').questao;
G.tgCalls.length = 0;
must(api('est.tgSend', { tipo: 'quiz', ids: [q2.id] }, eu), 'quiz');
const msg = G.tgCalls.filter((x) => x.method === 'sendMessage').map((x) => x.body.text).find((t) => /Segundo o texto/.test(t));
ok(msg && msg.length <= 4096 && /Texto de apoio/.test(msg) && /texto completo no Prumo/.test(msg) && /<b>E\)<\/b>/.test(msg), `questão com texto de apoio cabe numa mensagem (${msg ? msg.length : 0} caracteres), com o texto cortado e avisado`);

// ---------- bloco 9: /funcoes com registro único ----------
const enviados = (text) => { G.tgCalls.length = 0; updates.push({ update_id: ++uid, message: { message_id: uid, from: { id: 777, first_name: 'Gois' }, chat: { id: 777, type: 'private' }, date: 1, text } }); G.resetMemo(); c.triggerFrequente(); return G.tgCalls.filter((x) => x.method === 'sendMessage').map((x) => x.body); };
const fx = enviados('/funcoes'), ftxt = fx.map((b) => b.text).join('\n');
ok(fx.length >= 1 && fx.every((b) => b.text.length <= 4096 && b.parse_mode === 'HTML'), '/funcoes responde em HTML, em partes de até 4.096 caracteres (' + fx.length + ' parte(s), ' + ftxt.length + ' caracteres)');
const pos = ['<b>Geral</b>', '<b>Estudos</b>', '<b>IA</b>', '<b>Arquivos e relatórios</b>'].map((g) => ftxt.indexOf(g));
ok(pos.every((x) => x >= 0) && pos.every((x, i) => !i || x > pos[i - 1]), 'grupos na ordem: Geral, Estudos, IA, Arquivos e relatórios');
ok(cat.comandos.every((x) => ftxt.includes(x.cmd)) && /Ex\.: <code>\/pdf M1<\/code>/.test(ftxt) && /\(também \/comandos\)/.test(ftxt), 'todos os comandos do registro aparecem, com exemplo e apelidos');
ok(!/<(?!\/?(b|i|code)>)[^>]*>/.test(ftxt.replace(/&lt;|&gt;|&amp;|&quot;/g, '')) && /&quot;me envie o PDF de Português&quot;|"me envie o PDF de Português"/.test(ftxt), 'HTML só com tags permitidas (b, i, code); o resto vai escapado');
const cx = enviados('/comandos').map((b) => b.text).join('\n');
ok(cx === ftxt, '/comandos é apelido de /funcoes (mesma resposta)');
const aj = enviados('/ajuda').map((b) => b.text).join('\n');
ok(/<b>Geral<\/b>/.test(aj) && /\/funcoes/.test(aj) && aj.length < ftxt.length, '/ajuda (lista curta) vem do mesmo registro e aponta para /funcoes');
ok(cat.grupos.join('|') === 'Geral|Estudos|IA|Arquivos e relatórios' && cat.comandos.some((x) => x.cmd === '/funcoes' && x.aliases.includes('/comandos')), 'a tela do app usa o mesmo registro (grupos e /funcoes)');
G.tgCalls.length = 0; must(api('tg.setCommands', {}, eu), 'menu2');
ok(G.tgCalls.find((x) => x.method === 'setMyCommands').body.commands.some((x) => x.command === 'funcoes'), 'o menu "/" do Telegram (setMyCommands) inclui /funcoes, a partir do mesmo registro');
// chat não conectado: só a instrução
G.tgCalls.length = 0;
updates.push({ update_id: ++uid, message: { message_id: uid, from: { id: 999, first_name: 'Estranho' }, chat: { id: 999, type: 'private' }, date: 1, text: '/funcoes' } }); G.resetMemo(); c.triggerFrequente();
const ne = G.tgCalls.filter((x) => x.method === 'sendMessage');
ok(ne.length === 1 && String(ne[0].body.chat_id) === '999' && /Para conectar/.test(ne[0].body.text) && !/\/pdf/.test(ne[0].body.text), 'chat não conectado recebe só a instrução de conexão');
// /parar e /parar_estudos continuam iguais
ok(/Avisos automáticos desligados/.test(enviados('/parar').map((b) => b.text).join()), '/parar continua desligando os avisos gerais');
ok(/Avisos automáticos de Estudos desligados/.test(enviados('/parar_estudos').map((b) => b.text).join()), '/parar_estudos continua desligando só os de Estudos');
ok(/Funções do Prumo/.test(enviados('/funcoes@prumo_teste_bot').map((b) => b.text).join()), '/funcoes@bot também funciona');
