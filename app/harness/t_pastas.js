// Bloco 2 — pastas da biblioteca: Estudos/<Tipo>/<Concurso>/<Data>/<Categoria>, categoria no material, mover ao
// mudar categoria/concurso (mesmo id e hash), edição em lote, "Reorganizar biblioteca" com prévia, hash evitando
// duplicado entre pastas, restauração do backup na pasta certa e categoria perguntada pelo Telegram.
const crypto = require('crypto'), vm = require('vm');
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };
c.setup();
const eu = G.devLogin('voce@exemplo.com');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enviar = (nome, buf, mime) => { const s = must(api('est.upStart', { nome, mime: mime || 'application/pdf', tamanho: buf.length, hash: sha(buf) }, eu), 'up'); if (s.duplicado) return s; return must(api('est.upChunk', { upload_id: s.upload_id, offset: 0, base64: buf.toString('base64') }, eu), 'chunk'); };
const pathOf = (driveId) => { const f = G.files.get(driveId); const out = []; let p = f.parent; while (p && !/^u-/.test(p.name)) { out.unshift(p.name); p = [...G.files.values()].find((x) => x.folders && x.folders.includes(p)); } return out.join('/'); };
const hoje = new Date().toISOString().slice(0, 10);

const bb = must(api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil 2026' } }, eu), 'c').row;
const trt = must(api('db.save', { table: 'est_concursos', row: { nome: 'TRT/5ª Região' } }, eu), 'c2').row;
const a1 = enviar('caderno.pdf', Buffer.from('%PDF caderno')).arquivo;
let m1 = must(api('est.materialSave', { titulo: 'Caderno', arquivo_id: a1.id, categoria: 'questoes', concurso_ids: bb.id }, eu), 'm1').material;
ok(m1.pasta === `PDFs/Banco do Brasil 2026/${hoje}/Questões` && pathOf(a1.drive_id) === m1.pasta, 'PDF de questões do BB vai para PDFs/Banco do Brasil 2026/' + hoje + '/Questões');
const a2 = enviar('planilha.xlsx', Buffer.from('PK planilha'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').arquivo;
const m2 = must(api('est.materialSave', { titulo: 'Planilha', arquivo_id: a2.id, categoria: 'flashcards' }, eu), 'm2').material;
ok(m2.pasta === `Planilhas/Geral/${hoje}/Flashcards` && m2.tipo === 'xlsx', 'planilha sem concurso vai para Planilhas/Geral/…/Flashcards');
const a3 = enviar('foto.jpg', Buffer.from('jpgfoto'), 'image/jpeg').arquivo;
const m3 = must(api('est.materialSave', { titulo: 'Foto', arquivo_id: a3.id }, eu), 'm3').material;
ok(m3.categoria === 'outros' && /^Imagens\/Geral\/.*\/Outros$/.test(m3.pasta), 'sem categoria: Imagens/Geral/…/Outros');
ok(/TRT 5ª Região/.test(must(api('est.materialSave', { id: m3.id, concurso_ids: trt.id }, eu), 'mv').material.pasta), 'nome de concurso com "/" vira nome de pasta válido');
// mudar categoria move (mesmo drive_id, mesmo hash)
const antes = a1.drive_id;
m1 = must(api('est.materialSave', { id: m1.id, categoria: 'teoria' }, eu), 'cat').material;
const arq1 = must(api('est.boot', {}, eu), 'b').tables;
ok(m1.pasta.endsWith('/Teoria') && pathOf(antes) === m1.pasta && G.files.get(antes).parent.files.length === 1, 'mudar a categoria move o arquivo (mesmo id no Drive)');
ok(G.files.get(antes).blob.bytes.toString() === '%PDF caderno', 'mover não altera o conteúdo');
// hash evita duplicado entre pastas
const dup = enviar('caderno-copia.pdf', Buffer.from('%PDF caderno'));
ok(dup.duplicado && dup.material && dup.material.id === m1.id, 'o mesmo arquivo enviado de novo é reconhecido pelo hash, em qualquer pasta');
// lote
const lote = must(api('est.materialBatch', { ids: [m1.id, m2.id], categoria: 'revisoes', concurso_ids: trt.id }, eu), 'lote').materiais;
ok(lote.every((m) => /TRT 5ª Região\/.*\/Revisões$/.test(m.pasta)) && pathOf(a2.drive_id) === lote[1].pasta, 'edição em lote: categoria e concurso mudam e os arquivos vão juntos');
// estrutura antiga → reorganizar
const a4 = enviar('antigo.pdf', Buffer.from('%PDF antigo')).arquivo;
vm.runInContext(`Auth.as('voce@exemplo.com'); Db.table('est_materiais').insert({ codigo: 'M90', titulo: 'Antigo', tipo: 'pdf', arquivo_id: '${a4.id}', situacao: 'a_estudar' })`, c);
ok(pathOf(a4.drive_id) === 'originais', 'material antigo continua em "originais" até reorganizar');
const pv = must(api('est.libReorg', { dry: true }, eu), 'pv');
ok(pv.total === 1 && pv.itens[0].codigo === 'M90' && pv.itens[0].para === `PDFs/Geral/${hoje}/Outros` && pathOf(a4.drive_id) === 'originais', 'prévia: 1 arquivo, para onde vai, sem mover nada');
const ro = must(api('est.libReorg', { dry: false }, eu), 'ro');
ok(ro.movidos === 1 && pathOf(a4.drive_id) === `PDFs/Geral/${hoje}/Outros` && must(api('est.libReorg', { dry: true }, eu), 'pv2').total === 0, 'reorganizar move e depois não sobra nada a mover');
// restauração do backup vai para a pasta certa
vm.runInContext("Auth.as('voce@exemplo.com'); StudyFiles.backup(60000)", c);
G.files.get(a2.drive_id).setTrashed(true);
const cf = must(api('est.checkFiles', { restaurar: true }, eu), 'cf');
const nova = must(api('est.boot', {}, eu), 'b2').tables;
ok(cf.faltando.length === 1 && cf.faltando[0].restaurado, 'arquivo apagado do Drive é restaurado do backup');
const arqRow = vm.runInContext(`Auth.as('voce@exemplo.com'); Db.table('arquivos').get('${a2.id}')`, c);
ok(pathOf(arqRow.drive_id) === lote[1].pasta, 'restauração cai na pasta do material (Planilhas/TRT…/Revisões)');
// Telegram pergunta a categoria
const TOKEN = '8123456789:AAH' + 'k'.repeat(32); let updates = [], uid = 100;
G.setTg((method, body) => { if (method === 'getMe') return { ok: true, result: { id: 1, is_bot: true, username: 'b' } }; if (method === 'getUpdates') return { ok: true, result: updates.filter((u) => u.update_id >= (body.offset || 0)) }; if (method === 'getFile') return { ok: true, result: { file_path: 'docs/x.pdf' } }; return { ok: true, result: { message_id: 1 } }; });
G.setTgFiles({ 'docs/x.pdf': Buffer.from('%PDF pelo telegram') });
must(api('tg.saveConfig', { token: TOKEN }, eu), 'tg');
const link = must(api('tg.linkCode', {}, eu), 'l').url.split('start=')[1];
updates.push({ update_id: ++uid, message: { message_id: 1, from: { id: 7 }, chat: { id: 7, type: 'private' }, text: '/start ' + link } }); c.triggerFrequente();
const say = (m) => { G.tgCalls.length = 0; updates.push({ update_id: ++uid, message: Object.assign({ message_id: uid, from: { id: 7 }, chat: { id: 7, type: 'private' }, date: 1 }, m) }); G.resetMemo(); c.triggerFrequente(); return G.tgCalls.filter((x) => x.method === 'sendMessage').map((x) => x.body.text).join('\n'); };
let t = say({ document: { file_id: 'F1', file_unique_id: 'U1', file_name: 'Lei 8112.pdf', mime_type: 'application/pdf', file_size: 30 } });
ok(/Qual a categoria\?/.test(t) && /1\. Questões/.test(t) && /5\. Outros/.test(t), 'Telegram: depois de guardar, pergunta a categoria em lista numerada');
const mt = must(api('est.boot', {}, eu), 'b3').tables.est_materiais.find((m) => m.titulo === 'Lei 8112');
ok(mt && mt.categoria === 'outros' && /\/Outros$/.test(mt.pasta), 'enquanto não responde, fica em Outros');
t = say({ text: '3' });
const mt2 = must(api('est.boot', {}, eu), 'b4').tables.est_materiais.find((m) => m.id === mt.id);
ok(/em <b>Teoria<\/b>/.test(t) && mt2.categoria === 'teoria' && /\/Teoria$/.test(mt2.pasta), 'responder "3" muda para Teoria e move o arquivo');
