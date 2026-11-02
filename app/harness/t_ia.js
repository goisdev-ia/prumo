// Estudos — IA (servidor): provedores (nome, URL, chave, modelos, cabeçalhos), máscara de segredos, formato OpenAI e
// Anthropic, escolha do modelo, fontes (dados da planilha, edital, anotações, questões, arquivos/Drive), geração de
// questões e resumos, resposta por IA, comentários, exclusão em lote, importação por concurso/área, simulado com filtros
// e treino pelo Telegram.
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };

c.setup();
const eu = G.devLogin('voce@exemplo.com'), ana = G.devLogin('ana@exemplo.com');
const props = G.props;
// respostas no formato do provedor chamado (OpenAI-compatível ou Anthropic)
const fmt = (url, txt) => (/\/messages$/.test(url) ? { code: 200, body: { content: [{ type: 'text', text: txt }] } } : { code: 200, body: { choices: [{ message: { content: txt } }] } });
const lastSys = () => { const b = G.aiCalls[G.aiCalls.length - 1].body; return b.system || b.messages[0].content; };

// ---------- provedores ----------
let r = api('est.aiConfig', { acao: 'salvar', nome: 'Groq', base: 'https://api.groq.com/openai/v1/', formato: 'openai', chave: 'gsk_segredo1234', modelos: [{ id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B' }, { id: 'llama-3.3-70b-versatile', nome: 'Llama 3.3 70B' }], headers: [{ nome: 'X-Title', valor: 'Prumo' }, { nome: 'X-Api-Token', valor: 'tok-secreto-9876' }] }, eu);
let st = must(r, 'salvar provedor');
const groq = st.provedores.find((p) => p.nome === 'Groq');
ok(groq && groq.base === 'https://api.groq.com/openai/v1' && groq.modelos.length === 2 && groq.tem_chave, 'provedor salvo com URL normalizada e 2 modelos');
ok(groq.chave_mask === '••••1234' && !JSON.stringify(st).includes('gsk_segredo1234') && !JSON.stringify(st).includes('tok-secreto-9876'), 'chave e cabeçalho secreto nunca voltam ao navegador (só mascarados)');
ok(groq.headers.find((h) => h.nome === 'X-Title').valor === 'Prumo' && groq.headers.find((h) => h.nome === 'X-Api-Token').secreto, 'cabeçalho comum visível; secreto marcado');
ok(st.padrao && st.padrao.provedor === groq.id && st.padrao.modelo === 'openai/gpt-oss-120b', 'primeiro provedor vira o padrão');
ok(!api('est.aiConfig', { acao: 'salvar', nome: 'X', base: 'http://inseguro.com', modelos: [{ id: 'm' }] }, eu).ok, 'URL sem https é recusada');
ok(!api('est.aiConfig', { acao: 'salvar', nome: 'X', base: 'https://a.com/v1', modelos: [] }, eu).ok, 'provedor sem modelo é recusado');
ok(!api('est.aiConfig', { acao: 'salvar', nome: 'X', base: 'https://a.com/v1', modelos: [{ id: 'm' }], headers: [{ nome: 'Host', valor: 'x' }] }, eu).ok, 'cabeçalho proibido (Host) é recusado');
ok(api('est.aiConfig', { acao: 'salvar', nome: 'X', base: 'https://a.com/v1', modelos: [{ id: 'm' }] }, ana).error.code === 'FORBIDDEN', 'só o dono configura provedores');
// edição mantendo segredos mascarados
r = must(api('est.aiConfig', { acao: 'salvar', id: groq.id, nome: 'Groq (grátis)', base: groq.base, formato: 'openai', chave: '••••1234', modelos: groq.modelos, headers: [{ nome: 'X-Title', valor: 'Prumo' }, { nome: 'X-Api-Token', valor: '••••9876' }] }, eu), 'editar');
ok(props.get('AI_KEY:' + groq.id) === 'gsk_segredo1234' && JSON.parse(props.get('AI_PROVIDERS')).find((p) => p.id === groq.id).headers.find((h) => h.nome === 'X-Api-Token').valor === 'tok-secreto-9876', 'editar sem redigitar mantém a chave e o cabeçalho secreto');
const anth = must(api('est.aiConfig', { acao: 'salvar', nome: 'Claude', base: 'https://api.anthropic.com/v1', formato: 'anthropic', chave: 'sk-ant-xyz', modelos: [{ id: 'claude-haiku-5-5', nome: 'Haiku' }] }, eu), 'anthropic').provedores.find((p) => p.nome === 'Claude');

// testar conexão e listar modelos
G.setAi((url, body, headers) => {
  if (/\/models$/.test(url)) return { code: 200, body: { data: [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3.6-27b' }] } };
  if (/anthropic/.test(url)) return { code: 200, body: { content: [{ type: 'text', text: 'OK claude' }] } };
  if (body && body.max_tokens && /gpt-oss/.test(body.model) && G.__exigeMct) return { code: 400, body: { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'." } } };
  return { code: 200, body: { choices: [{ message: { content: '<think>pensando</think>OK' } }] } };
});
let t = must(api('est.aiConfig', { acao: 'testar', id: groq.id }, eu), 'testar');
let last = G.aiCalls[G.aiCalls.length - 1];
ok(t.ok && t.resposta === 'OK' && last.url === 'https://api.groq.com/openai/v1/chat/completions', 'testar conexão chama /chat/completions e limpa o raciocínio <think>');
ok(last.headers.Authorization === 'Bearer gsk_segredo1234' && last.headers['X-Title'] === 'Prumo' && last.headers['X-Api-Token'] === 'tok-secreto-9876', 'envia a chave como Bearer e os cabeçalhos cadastrados');
G.__exigeMct = true;
t = must(api('est.aiConfig', { acao: 'testar', id: groq.id }, eu), 'testar mct');
last = G.aiCalls[G.aiCalls.length - 1];
ok(t.ok && last.body.max_completion_tokens && !last.body.max_tokens, 'modelo que exige max_completion_tokens: tenta de novo sozinho');
G.__exigeMct = false;
const mods = must(api('est.aiConfig', { acao: 'modelos', id: groq.id }, eu), 'modelos').modelos;
ok(mods.length === 2 && mods[1].id === 'qwen/qwen3.6-27b' && G.aiCalls[G.aiCalls.length - 1].method === 'get', '"Buscar modelos" lista os modelos do provedor (GET /models)');
const nAntes = JSON.parse(props.get('AI_PROVIDERS')).length;
const mods2 = must(api('est.aiConfig', { acao: 'modelos', base: 'https://api.cerebras.ai/v1', formato: 'openai', chave: 'csk-novo-5555', headers: [] }, eu), 'modelos rascunho').modelos;
last = G.aiCalls[G.aiCalls.length - 1];
ok(mods2.length === 2 && last.url === 'https://api.cerebras.ai/v1/models' && last.headers.Authorization === 'Bearer csk-novo-5555' && JSON.parse(props.get('AI_PROVIDERS')).length === nAntes && !props.get('AI_KEY:_rascunho'), 'antes de salvar: "Buscar modelos" usa a chave digitada sem gravar nada');
t = must(api('est.aiConfig', { acao: 'testar', base: 'https://api.cerebras.ai/v1', formato: 'openai', chave: 'csk-novo-5555', modelo: 'gpt-oss-120b', modelos: [] }, eu), 'testar rascunho');
ok(t.ok && G.aiCalls[G.aiCalls.length - 1].body.model === 'gpt-oss-120b' && JSON.parse(props.get('AI_PROVIDERS')).length === nAntes, 'antes de salvar: "Testar" funciona com o formulário e não conta no limite');
t = must(api('est.aiConfig', { acao: 'testar', id: anth.id }, eu), 'testar anthropic');
last = G.aiCalls[G.aiCalls.length - 1];
ok(t.resposta === 'OK claude' && last.url === 'https://api.anthropic.com/v1/messages' && last.headers['x-api-key'] === 'sk-ant-xyz' && last.body.system, 'formato Anthropic: /messages, x-api-key e system separado');
must(api('est.aiConfig', { acao: 'padrao', provedor: anth.id, modelo: 'claude-haiku-5-5' }, eu), 'padrão');
ok(must(api('est.aiStatus', {}, ana), 'status ana').padrao.provedor === anth.id, 'outra pessoa vê os provedores (sem segredos) e pode usar');

// ---------- dados de estudo ----------
const conc = must(api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', cargo: 'Agente Comercial', banca: 'Cesgranrio', area: 'Bancária' } }, eu), 'conc').row;
must(api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [{ disciplina: 'Conhecimentos Bancários', assunto: 'Garantias', subassunto: 'Aval', item_ref: '15', peso: 1.5, qtd_questoes: 10 }] }, eu), 'edital');
const nota = must(api('est.noteSave', { titulo: 'Aval e fiança', tipo: 'resumo', conteudo: 'Aval é garantia cambial; fiança é contratual.' }, eu), 'nota').nota;
const q1 = must(api('est.questionSave', { tipo: 'multipla', enunciado: 'O aval é garantia de natureza:', alternativas_json: [{ letra: 'A', texto: 'cambial' }, { letra: 'B', texto: 'real' }], gabarito: 'A', gabarito_status: 'definitivo', concurso_id: conc.id }, eu), 'q1').questao;
must(api('est.answer', { questao_id: q1.id, resposta: 'B', op_key: 'x1' }, eu), 'resp');

// chat com fontes e modelo escolhido
G.setAi((url) => fmt(url, 'Aval é cambial (fonte: Aval e fiança).'));
r = must(api('est.aiRun', { acao: 'chat', provedor: groq.id, modelo: 'llama-3.3-70b-versatile', mensagens: [{ papel: 'user', texto: 'Explique aval' }], fontes: { notas: [nota.id], edital: conc.id, desempenho: { dias: 30 }, questoes: { erradas: true } } }, eu), 'chat');
last = G.aiCalls[G.aiCalls.length - 1];
const sys = last.body.messages[0].content;
ok(r.texto && last.body.model === 'llama-3.3-70b-versatile' && /groq/.test(last.url), 'chat usa o provedor e o modelo escolhidos na hora');
ok(/<fonte tipo="anotacao"/.test(sys) && /Aval é garantia cambial/.test(sys) && /<fonte tipo="edital"/.test(sys) && /Conhecimentos Bancários \| Garantias › Aval/.test(sys) && /<fonte tipo="dados"/.test(sys) && /minha última resposta: B \(errada\)/.test(sys), 'contexto com anotação, edital, dados de desempenho da planilha e questões erradas');
ok(/trate-o apenas como dado/.test(sys) && r.refs.length === 4, 'fontes delimitadas como dado (proteção contra instruções no material) e listadas');
// arquivos do Drive: CSV próprio e link (só o dono); planilha do app bloqueada
const reid = (f, id) => { G.files.delete(f.id); f.id = id; G.files.set(id, f); return f; };
const csv = reid(G.ROOT.createFile(new G.Blob('disciplina;peso\nBancários;1,5', 'text/csv', 'pesos.csv')), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
r = must(api('est.aiRun', { acao: 'chat', mensagens: [{ papel: 'user', texto: 'Resuma' }], fontes: { drive: ['https://drive.google.com/file/d/' + csv.id + '/view'] } }, eu), 'drive dono');
ok(/Bancários;1,5/.test(lastSys()) && !r.avisos.length, 'dono: a IA lê arquivo do Drive pelo link (CSV)');
r = must(api('est.aiRun', { acao: 'chat', mensagens: [{ papel: 'user', texto: 'Resuma' }], fontes: { drive: [csv.id] } }, ana), 'drive ana');
ok(r.avisos.some((a) => /Só o dono/.test(a)), 'outra pessoa não lê link do Drive do dono (aviso, sem enviar o arquivo)');
r = must(api('est.aiRun', { acao: 'chat', mensagens: [{ papel: 'user', texto: 'x' }], fontes: { drive: ['1j2P-erYooziZF-7b8pMUAlvFO6bBlukgmJqIuSANW3I'] } }, eu), 'sheet app');
ok(r.avisos.some((a) => /planilha do próprio Prumo/.test(a)), 'a planilha do próprio app não vai inteira para a IA');
// PDF/imagem via conversão do Drive (OCR)
const img = reid(G.ROOT.createFile(new G.Blob(Buffer.from([1, 2, 3]), 'image/jpeg', 'foto_lei.jpg')), '1ImGfotoLei0123456789abcdefghijk');
r = must(api('est.aiRun', { acao: 'chat', mensagens: [{ papel: 'user', texto: 'O que diz?' }], fontes: { drive: [img.id] } }, eu), 'ocr');
ok(/<fonte tipo="drive"/.test(lastSys()) && !r.avisos.length, 'imagem/PDF do Drive: texto extraído pela conversão do Drive (OCR)');

// gerar questões → incluir no banco (geradas por IA, a revisar, gabarito preliminar)
G.setAi((url) => fmt(url, 'Aqui:\n```json\n[{"tipo":"multipla","enunciado":"A fiança bancária é garantia:","alternativas":[{"letra":"A","texto":"fidejussória"},{"letra":"B","texto":"real"}],"gabarito":"A","explicacao":"Pessoal.","dificuldade":2},{"enunciado":"curta"},{"tipo":"certo_errado","enunciado":"O aval admite benefício de ordem.","gabarito":"Errado","explicacao":"Não admite."}]\n```'));
r = must(api('est.aiRun', { acao: 'gerar', tipo: 'questoes', n: 3, tema: 'garantias', fontes: { notas: [nota.id] } }, eu), 'gerar q');
ok(r.questoes.length === 2 && r.questoes[0].gabarito === 'A' && r.questoes[1].tipo === 'certo_errado' && r.questoes[1].gabarito === 'E' && r.gerado_ia, 'gera questões em JSON (aceita cerca de código), descarta a inválida e normaliza C/E');
const add = must(api('est.questionsAdd', { questoes: r.questoes, concurso_id: conc.id, area: 'Bancária', fonte: 'IA · teste' }, eu), 'add');
ok(add.questoes.length === 2 && add.questoes.every((q) => q.gerada_ia && q.revisar && q.gabarito_status === 'preliminar' && q.tags === 'ia' && q.concurso_id === conc.id && q.area === 'Bancária'), 'incluídas no banco: geradas por IA, a revisar, gabarito preliminar, concurso e área');
// responder por IA (sem ver o gabarito) e comparar
G.setAi((url) => fmt(url, '{"resposta":"a","explicacao":"Aval é cambial.","confianca":"alta"}'));
r = must(api('est.aiRun', { acao: 'responder', questao_id: q1.id }, eu), 'responder');
ok(r.resposta === 'A' && r.concorda === true && r.confianca === 'alta' && !/Gabarito cadastrado|gabarito: A/i.test(JSON.stringify(G.aiCalls[G.aiCalls.length - 1].body.messages)), 'resposta por IA: resolve sem receber o gabarito e compara com o cadastrado');
// comentário
let cq = must(api('est.questionComment', { id: q1.id, comentario: 'IA: A — Aval é cambial.', ia: true }, eu), 'coment').questao;
ok(cq.comentario === 'IA: A — Aval é cambial.' && cq.comentario_ia && cq.comentario_em, 'comentário salvo (marcado como vindo da IA)');
ok(!api('est.questionComment', { id: q1.id, comentario: 'x' }, ana).ok, 'outra pessoa não comenta questão alheia');
// limite diário
props.set('AI_LIMITE_DIA', '1');
ok(/Limite diário/.test(api('est.aiRun', { acao: 'responder', questao_id: q1.id }, eu).error.message), 'limite diário por pessoa');
props.set('AI_LIMITE_DIA', '100');

// ---------- exclusão em lote ----------
const lote = add.questoes.map((q) => q.id);
r = must(api('est.questionDelete', { ids: lote.concat(['inexistente']) }, eu), 'del lote');
ok(r.removidas === 2, 'excluir várias de uma vez (ignora id inexistente)');
ok(!api('est.questionDelete', { ids: [q1.id] }, ana).ok, 'outra pessoa não exclui questões alheias');
r = must(api('est.questionRestore', { ids: lote }, eu), 'restore lote');
ok(r.questoes.length === 2, 'desfazer a exclusão em lote');

// ---------- importação por concurso/área ----------
let im = must(api('est.importRows', { tabela: 'questoes', dry: true, concurso_id: conc.id, area: 'Bancária', rows: [{ codigo: 'BB-1', enunciado: 'Q importada', a: 'x', b: 'y', gabarito: 'A' }, { codigo: 'BB-2', enunciado: 'Q2', a: 'x', b: 'y', concurso: 'Concurso inexistente' }] }, eu), 'imp dry');
ok(im.previa.novos === 1 && im.previa.erros[0].linha === 3 && /não cadastrado/.test(im.previa.erros[0].mensagem), 'importação: concurso pelo nome (erro claro se não existir)');
must(api('est.importRows', { tabela: 'questoes', dry: false, ignorar_erros: true, concurso_id: conc.id, area: 'Bancária', rows: [{ codigo: 'BB-1', enunciado: 'Q importada', a: 'x', b: 'y', gabarito: 'A' }] }, eu), 'imp');
const qi = must(api('est.boot', {}, eu), 'boot').tables.est_questoes.find((q) => q.codigo === 'BB-1');
ok(qi.concurso_id === conc.id && qi.area === 'Bancária', 'importadas recebem o concurso e o tipo (área) escolhidos');

// ---------- simulado com filtros (concurso, área, tipo, erradas) ----------
for (let i = 0; i < 4; i++) must(api('est.questionSave', { tipo: 'multipla', enunciado: 'Outra área ' + i, alternativas_json: [{ letra: 'A', texto: 'a' }, { letra: 'B', texto: 'b' }], gabarito: 'A', area: 'Tribunais' }, eu), 'qo');
const sim = must(api('db.save', { table: 'est_simulados', row: { titulo: 'Rápido', duracao_min: 10, regras_json: { acerto: 1, erro: 0, branco: 0, anulada: 'pontua' }, composicao_json: { blocos: [{ nome: 'Bancária', qtd: 50, area: 'Bancária' }] } } }, eu), 'sim').row;
const ss = must(api('est.simStart', { simulado_id: sim.id, aceitar_menos: true }, eu), 'simStart');
ok(ss.itens.length >= 3 && ss.questoes.every((q) => !/Outra área/.test(q.enunciado)), 'simulado filtrado por tipo de concurso (área) não pega questões de outras áreas');
const sim2 = must(api('db.save', { table: 'est_simulados', row: { titulo: 'Erradas', regras_json: { acerto: 1, erro: 0, branco: 0, anulada: 'pontua' }, composicao_json: { blocos: [{ nome: 'Erradas', qtd: 5, erradas: true }] } } }, eu), 'sim2').row;
const s2 = must(api('est.simStart', { simulado_id: sim2.id, aceitar_menos: true }, eu), 'simStart2');
ok(s2.itens.length === 1 && s2.itens[0].questao_id === q1.id, 'simulado "só as que errei" usa a última resposta de cada questão');

// ---------- Telegram: /ia, /gerar_questoes (série) e quiz enviado pelo app ----------
let updates = [], uid = 9000, nextMsg = 100;
G.setTg((method, body) => {
  if (method === 'getMe') return { ok: true, result: { id: 1, is_bot: true, first_name: 'Prumo', username: 'prumo_teste_bot' } };
  if (method === 'deleteWebhook') return { ok: true, result: true };
  if (method === 'getUpdates') return { ok: true, result: updates.filter((u) => u.update_id >= (body.offset || 0)) };
  if (method === 'sendMessage') return { ok: true, result: { message_id: nextMsg++ } };
  return { ok: false, error_code: 404 };
});
must(api('tg.saveConfig', { token: '8123456789:AAH' + 'k'.repeat(32) }, eu), 'tg');
const link = must(api('tg.linkCode', {}, eu), 'link').url.split('start=')[1];
updates.push({ update_id: ++uid, message: { message_id: 1, from: { id: 777, first_name: 'Gois' }, chat: { id: 777, type: 'private' }, text: '/start ' + link } });
c.triggerFrequente();
const say = (text) => { G.tgCalls.length = 0; updates.push({ update_id: ++uid, message: { message_id: uid, from: { id: 777, first_name: 'Gois' }, chat: { id: 777, type: 'private' }, date: 1, text } }); G.resetMemo(); c.triggerFrequente(); return G.tgCalls.filter((x) => x.method === 'sendMessage').map((x) => x.body.text).join('\n---\n'); };
G.setAi((url, body) => {
  const u = body.messages[body.messages.length - 1].content;
  if (/Crie \d+ questões/.test(u)) return fmt(url, '[{"tipo":"multipla","enunciado":"Qual garantia é cambial?","alternativas":[{"letra":"A","texto":"Aval"},{"letra":"B","texto":"Fiança"}],"gabarito":"A","explicacao":"Aval é título cambial."},{"tipo":"certo_errado","enunciado":"Fiança é cambial.","gabarito":"E","explicacao":"É contratual."}]');
  return fmt(url, 'Resposta da IA sobre aval.');
});
let tx = say('/ia o que é aval?');
ok(/Assistente/.test(tx) && /Resposta da IA sobre aval/.test(tx), '/ia responde no Telegram');
tx = say('/gerar_questoes aval 2');
ok(/2 questão\(ões\) sobre "aval"/.test(tx) && /Questão Q\d+<\/b> \(1\/2\)/.test(tx) && /gerada por IA/.test(tx), '/gerar_questoes cria as questões, guarda no banco e começa a série');
tx = say('A');
ok(/Certa!/.test(tx) && /\(2\/2\)/.test(tx), 'responder com a letra registra e já manda a próxima');
tx = say('C');
ok(/Errada\./.test(tx) && /Série concluída:<\/b> 1 certa\(s\) e 1 errada\(s\) de 2/.test(tx), 'fim da série mostra o placar');
const tq = must(api('est.boot', {}, eu), 'b').tables.est_tentativas.filter((x) => x.modo === 'telegram');
ok(tq.length === 2, 'as 2 respostas viraram tentativas (modo telegram)');
r = must(api('est.tgSend', { tipo: 'quiz', ids: [q1.id, qi.id] }, eu), 'quiz app');
ok(r.job && r.job.status === 'enviado' && /\(1\/2\)/.test(G.tgCalls.filter((x) => x.method === 'sendMessage').map((x) => x.body.text).join()), 'app → "Treinar no Telegram" manda a série de questões escolhidas');
ok(!api('est.tgSend', { tipo: 'quiz', ids: [q1.id] }, ana).ok, 'outra pessoa não manda questões alheias');
