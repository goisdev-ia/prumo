// Bloco 8 — OCR de PDF digitalizado: funções puras (contraste, inclinação, pós-processamento, cabeçalho repetido,
// taxa de erro, palavras → itens), OCR real com Tesseract.js (por) numa página escaneada torta, e o servidor
// (texto e coordenadas guardados por material, reaproveitados por hash, OCR do Drive com limite diário).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createCanvas, ImageData } = require('canvas');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const load = (file) => { const src = fs.readFileSync(file, 'utf8').replace(/^[\s\S]*?<script>|<\/script>[\s\S]*$/g, ''); const m = { exports: {} }; new Function('module', 'window', src)(m, undefined); return m.exports; };
const O = load(path.join(__dirname, '..', 'src', 'js_estudos_ocr.html'));

// ---------- puras ----------
ok(O.post('a ﬁnança e o ﬂuxo') === 'a finança e o fluxo', 'ligaduras fi/fl viram letras');
ok(O.post('o candi-\ndato aprovado') === 'o candidato aprovado', 'hifenização no fim da linha entre minúsculas é juntada');
ok(O.post('Rio-\nGrande') === 'Rio-\nGrande' && O.post('art. 5º -\n§ 2') === 'art. 5º -\n§ 2', 'hífen antes de maiúscula ou símbolo fica (sem adivinhar)');
ok(O.post('texto  com   espaços , e ( parênteses )') === 'texto com espaços, e (parênteses)', 'espaços repetidos e antes de pontuação');
ok(O.post('Cespe acao exceçao') === 'Cespe acao exceçao', 'sem correção por dicionário: palavra errada continua como veio');
const pgs = { 1: 'EDITAL Nº 1 - BB\ntexto da página um\nPágina 1 de 3', 2: 'EDITAL Nº 1 - BB\nconteúdo dois\nPágina 2 de 3', 3: 'EDITAL Nº 1 - BB\nterceira\nPágina 3 de 3' };
const st = O.stripRepeated(pgs);
ok(st[1] === 'texto da página um' && st[3] === 'terceira', 'cabeçalho e rodapé repetidos (com número diferente) saem');
ok(O.stripRepeated({ 1: 'A\nb', 2: 'A\nc' })[1] === 'A\nb', 'com menos de 3 páginas nada sai');
ok(O.wer('o rato roeu a roupa', 'o rato roeu a roupa') === 0 && Math.abs(O.wer('o rato roeu a roupa', 'o gato roeu roupa') - 0.4) < 1e-9, 'taxa de erro de palavras: troca + falta = 2 de 5');
ok(O.needsOcr(0) && O.needsOcr(39) && !O.needsOcr(40) && !O.needsOcr(900), 'precisa de OCR só sem camada de texto (menos de 40 letras)');
const it = O.wordsToItems([{ t: 'Edital', x: 100, y: 200, w: 50, h: 20 }], 2, 842);
ok(it.length === 1 && it[0].str === 'Edital' && it[0].x === 50 && Math.abs(it[0].y - (842 - 108)) < 1e-9 && it[0].size === 10, 'palavras do OCR (pixels) viram itens no formato do PDF.js (pontos, y para cima)');
const pk = O.pack([{ t: 'Art.', x: 30, y: 60, w: 12.345, h: 9 }], 3);
ok(JSON.stringify(pk) === '[["Art.",10,20,4.1,3]]' && O.unpack(pk)[0].x === 10, 'palavras compactas para guardar e de volta');
ok(O.linesOf([{ t: 'a', l: 1, y: 0, h: 10 }, { t: 'b', l: 1, y: 0, h: 10 }, { t: 'c', l: 2, y: 20, h: 10 }]) === 'a b\nc', 'linhas montadas pela linha do Tesseract');

// imagem sintética: linhas de texto giradas 3,5° → ângulo achado e corrigido
const cv = createCanvas(900, 700), cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 900, 700); cx.fillStyle = '#000'; cx.font = '22px sans-serif';
cx.translate(450, 350); cx.rotate(3.5 * Math.PI / 180); cx.translate(-450, -350);
for (let i = 0; i < 14; i++) cx.fillText('Lorem ipsum dolor sit amet consectetur adipiscing elit sed do', 60, 80 + i * 40);
const G = O.toGray(cx.getImageData(0, 0, 900, 700)), a = O.skewAngle(G);
ok(Math.abs(a - 3.5) <= 0.3, 'inclinação achada em texto girado 3,5°: ' + a + '°');
ok(Math.abs(O.skewAngle(O.rotate(G, a))) <= 0.3, 'depois de girar, as linhas ficam retas');
const pr = O.prep(cx.getImageData(0, 0, 900, 700));
ok(pr.angulo === a && pr.data.length === 900 * 700 * 4, 'pré-processamento corrige a partir de 3° e devolve RGBA');
const pr2 = O.prep(cx.getImageData(0, 0, 900, 700), { deskewMin: 10 });
ok(pr2.angulo === 0 && pr2.inclinacao === a, 'abaixo do mínimo a inclinação é medida mas não girada (o Tesseract corrige)');
const fraco = { width: 4, height: 1, data: new Uint8ClampedArray([120, 120, 120, 255, 140, 140, 140, 255, 160, 160, 160, 255, 180, 180, 180, 255]) };
const S2 = O.stretch(O.toGray(fraco));
ok(S2.g[0] === 0 && S2.g[3] === 255, 'contraste esticado entre os percentis (cinza claro vira preto e branco)');

// ---------- servidor ----------
const G2 = require('./gas'), c = G2.context, vm = require('vm');
const api = (route, payload, token) => { G2.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };
c.setup();
const eu = G2.devLogin('voce@exemplo.com');
const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_edital_nitido.pdf')), sha = crypto.createHash('sha256').update(buf).digest('hex');
const s0 = must(api('est.upStart', { nome: 'edital_digitalizado.pdf', mime: 'application/pdf', tamanho: buf.length, hash: sha }, eu), 'up');
const arq = must(api('est.upChunk', { upload_id: s0.upload_id, offset: 0, base64: buf.toString('base64') }, eu), 'chunk').arquivo;
const mat = must(api('est.materialSave', { titulo: 'Edital digitalizado', arquivo_id: arq.id, categoria: 'teoria' }, eu), 'mat').material;
const ws = [['Edital', 50, 60, 40, 10], ['de', 95, 60, 12, 10], ['abertura', 110, 60, 50, 10]];
const r1 = must(api('est.textSave', { material_id: mat.id, arquivo_id: arq.id, paginas: { 1: 'Edital de abertura', 2: '' }, ocr: { 1: { motor: 'tesseract.js 7.0.0 por', conf: 91, angulo: 0, palavras: ws } }, total: 2 }, eu), 'save');
ok(r1.paginas_com_texto === 1 && r1.paginas_ocr === 1 && r1.sem_texto === 1, 'texto do OCR guardado com as coordenadas; página sem texto anotada');
const g1 = must(api('est.textGet', { material_id: mat.id, ocr: true }, eu), 'get');
ok(g1.disponivel && g1.paginas[1] === 'Edital de abertura' && g1.ocr[1].palavras.length === 3 && g1.ocr[1].motor.startsWith('tesseract') && JSON.stringify(g1.paginas_ocr) === '[1]', 'leitura devolve texto, palavras e motor (para não refazer o OCR)');
ok(!must(api('est.textGet', { material_id: mat.id }, eu), 'get2').ocr, 'sem pedir, as coordenadas não vão (resposta leve para IA e busca)');
must(api('est.textSave', { material_id: mat.id, arquivo_id: arq.id, paginas: { 2: 'Segunda página lida' }, ocr: { 2: { motor: 'drive', palavras: [] } }, total: 2 }, eu), 'save2');
const g2 = must(api('est.textGet', { material_id: mat.id, ocr: true }, eu), 'get3');
ok(g2.paginas[2] === 'Segunda página lida' && g2.sem_texto.length === 0 && g2.ocr[1].palavras.length === 3, 'página lida depois sai da lista sem texto; as anteriores continuam');
const ai = vm.runInContext(`Auth.as('voce@exemplo.com'); StudyFiles.textOf(Studies.own('est_materiais', '${mat.id}', 'x'), '2')`, c);
ok(ai.disponivel && ai.paginas[2] === 'Segunda página lida' && !ai.paginas[1], 'IA, busca e edital leem o texto do OCR pelo mesmo caminho (textOf)');
const mat2 = must(api('est.materialSave', { titulo: 'Mesmo edital de novo', arquivo_id: arq.id, categoria: 'outros' }, eu), 'mat2').material;
const g3 = must(api('est.textGet', { material_id: mat2.id, ocr: true }, eu), 'get4');
ok(g3.disponivel && g3.ocr[1] && g3.paginas[2] === 'Segunda página lida', 'outro material com o mesmo arquivo (hash) reaproveita o OCR: nada é refeito');
const outro = G2.devLogin('outra@exemplo.com');
ok(!api('est.textGet', { material_id: mat.id, ocr: true }, outro).ok, 'outra pessoa não lê o texto do material');
const png = Buffer.from('iVBORw0KGgo=', 'base64').toString('base64');
const d1 = must(api('est.ocrPage', { material_id: mat.id, pagina: 1, png }, eu), 'drive');
ok(d1.motor === 'drive' && d1.texto.length > 10 && typeof d1.ms === 'number', 'OCR do Google Drive devolve só o texto da página');
ok(!api('est.ocrPage', { material_id: mat.id, pagina: 1 }, eu).ok, 'sem imagem: erro no campo png');
vm.runInContext(`PropertiesService.getScriptProperties().setProperty('ocrdia:voce@exemplo.com:' + Utils.fmt(new Date(), 'yyyy-MM-dd'), '300')`, c);
const lim = api('est.ocrPage', { material_id: mat.id, pagina: 1, png }, eu);
ok(!lim.ok && /Limite diário/.test(lim.error.message), 'limite diário do OCR do Drive (300 páginas)');

// ---------- OCR real (Tesseract.js, por) numa página escaneada a 4° ----------
(async () => {
  const { createWorker } = require('tesseract.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_edital_torto.pdf'))), verbosity: 0 }).promise, pg = await doc.getPage(1);
  const tc = await pg.getTextContent();
  ok(O.needsOcr(tc.items.map((x) => x.str).join('').replace(/\s/g, '').length), 'página escaneada (só imagem) é detectada como sem texto');
  const vp = pg.getViewport({ scale: O.DPI / 72 }), cvs = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = cvs.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  const pre = O.prep(ctx.getImageData(0, 0, cvs.width, cvs.height)), out = createCanvas(pre.width, pre.height); out.getContext('2d').putImageData(new ImageData(pre.data, pre.width, pre.height), 0, 0);
  const w = await createWorker('por', 1, { langPath: path.join(__dirname, 'node_modules', '@tesseract.js-data', 'por', '4.0.0_best_int'), gzip: true, cachePath: '/tmp/tess-cache' });
  const t0 = Date.now(), r = await w.recognize(out.toBuffer('image/png'), {}, { blocks: true, text: true }); await w.terminate();
  const words = O.wordsOf(r.data), txt = O.post(O.linesOf(words)), ref = fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_edital_ref.txt'), 'utf8'), e = O.wer(ref, txt);
  console.log('# OCR real: ' + (Date.now() - t0) + ' ms, inclinação ' + pre.inclinacao + '°, erro de palavras ' + (e * 100).toFixed(1) + '%');
  ok(pre.angulo >= 3.5 && pre.angulo <= 4.5, 'página a 4° é endireitada antes do OCR');
  ok(e < 0.03, 'texto lido com menos de 3% de erro de palavras contra o texto original da página');
  ok(words.length > 300 && words.every((x) => x.w > 0 && x.h > 0), 'cada palavra vem com posição e tamanho (camada de texto invisível)');
  // leitores de documento inteiro usam o OCR na página sem texto
  const Q = load(path.join(__dirname, '..', 'src', 'js_estudos_qpdf.html')), Ed = load(path.join(__dirname, '..', 'src', 'js_estudos_edital.html'));
  const packed = O.pack(words, O.DPI / 72);
  const doc2 = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_edital_torto.pdf'))), verbosity: 0 }).promise;
  let chamadas = 0;
  const qp = await Q.readPdf(doc2, pdfjs.OPS, { imagens: false, ocr: async () => { chamadas++; return { palavras: packed, texto: txt }; } });
  ok(chamadas === 1 && qp[0].lines.length > 20 && qp[0].lines.some((l) => /Compreensão de textos/.test(l.text)), 'leitor de questões: página digitalizada lida pelo OCR vira linhas com posição');
  const ed = await Ed.pdfPages(pdfjs, new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_edital_torto.pdf'))), { ocr: async () => ({ texto: txt }) });
  ok(ed[0].ocr && /CONHECIMENTOS BÁSICOS/.test(ed[0].text), 'leitura do edital: página digitalizada usa o texto do OCR');
  const nat = await Ed.pdfPages(pdfjs, new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'edital_bb_2022.pdf'))), { ocr: async () => { throw new Error('não devia chamar'); } });
  ok(nat.length > 10 && !nat.some((p) => p.ocr), 'PDF com texto nativo nunca passa pelo OCR');
})();
