// Medição do OCR (bloco 8): tempo por página e taxa de erro de palavras (WER) antes e depois.
// Antes: página renderizada a 108 dpi (escala 1,5 do leitor), sem pré-processamento nem pós-processamento.
// Depois: o caminho do app (200 dpi, cinza + contraste, inclinação corrigida a partir de 3 graus, pós-processamento).
// Referência: a camada de texto original da mesma página (pdftotext do PDF nativo), conferida por amostragem.
// Uso: node bench_ocr.js <pasta com as amostras>
const fs = require('fs'), path = require('path');
const { createCanvas, ImageData } = require('canvas');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const { createWorker } = require('tesseract.js');
const load = (file) => { const src = fs.readFileSync(file, 'utf8').replace(/^[\s\S]*?<script>|<\/script>[\s\S]*$/g, ''); const m = { exports: {} }; new Function('module', 'window', src)(m, undefined); return m.exports; };
const O = load(path.join(__dirname, '..', 'src', 'js_estudos_ocr.html'));
const DIR = process.argv[2] || '/home/claude/ocrbench';
const AMOSTRAS = [
  ['nativo_bb9', null, 'bb9', 'texto nativo (caderno BB p. 9, duas colunas)'],
  ['nitido_bb9', 'nitido_bb9.pdf', 'bb9', 'escaneado nítido 200 dpi (caderno BB p. 9)'],
  ['nitido_bb146', 'nitido_bb146.pdf', 'bb146', 'escaneado nítido 200 dpi (caderno BB p. 146)'],
  ['nitido_ed33', 'nitido_ed33.pdf', 'ed33', 'escaneado nítido 200 dpi (edital BB 2022 p. 33)'],
  ['ruim_bb9', 'ruim_bb9.pdf', 'bb9', 'escaneado ruim 120 dpi, 1,8° torto, ruído, JPEG 30 (caderno p. 9)'],
  ['ruim_ed33', 'ruim_ed33.pdf', 'ed33', 'escaneado ruim 120 dpi, 1,8° torto, ruído, JPEG 30 (edital p. 33)'],
  ['torto4_ed33', 'torto4_ed33.pdf', 'ed33', 'escaneado 150 dpi, 4° torto, JPEG 60 (edital p. 33)']
];
async function renderPdf(file, dpi) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise, pg = await doc.getPage(1);
  const tc = await pg.getTextContent(), chars = tc.items.map((x) => x.str).join('').replace(/\s/g, '').length;
  const vp = pg.getViewport({ scale: dpi / 72 }), c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  return { img: ctx.getImageData(0, 0, c.width, c.height), chars };
}
const toPng = (img) => { const c = createCanvas(img.width, img.height); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0); return c.toBuffer('image/png'); };
const bag = (ref, hyp) => { const t = (s) => String(s).toLowerCase().normalize('NFC').replace(/[^0-9a-zà-öø-ÿ]+/g, ' ').trim().split(' ').filter(Boolean); const a = t(ref), b = {}; t(hyp).forEach((w) => { b[w] = (b[w] || 0) + 1; }); let hit = 0; a.forEach((w) => { if (b[w]) { b[w]--; hit++; } }); return 1 - hit / a.length; };

(async () => {
  const w = await createWorker('por', 1, { langPath: path.join(__dirname, 'node_modules', '@tesseract.js-data', 'por', '4.0.0_best_int'), gzip: true, cachePath: '/tmp/tess-cache' });
  const rows = [];
  for (const [id, file, ref, desc] of AMOSTRAS) {
    const refTxt = fs.readFileSync(path.join(DIR, ref + '.txt'), 'utf8');
    if (!file) {
      const src = path.join(__dirname, 'fixtures', 'questoes_bb_1200.pdf'), doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(src)), verbosity: 0 }).promise;
      const t0 = Date.now(), tc = await (await doc.getPage(9)).getTextContent(), txt = tc.items.map((x) => x.str).join(' '), ms = Date.now() - t0;
      rows.push({ id, desc, precisa: O.needsOcr(txt.replace(/\s/g, '').length), antes: { ms, wer: O.wer(refTxt, txt), bag: bag(refTxt, txt) }, depois: { ms, wer: O.wer(refTxt, txt), bag: bag(refTxt, txt) } });
      continue;
    }
    const r1 = await renderPdf(path.join(DIR, file), 108);
    let t0 = Date.now(); const a = await w.recognize(toPng(r1.img)); const antes = { ms: Date.now() - t0, wer: O.wer(refTxt, a.data.text), bag: bag(refTxt, a.data.text) };
    t0 = Date.now(); const r2 = await renderPdf(path.join(DIR, file), O.DPI), pre = O.prep(r2.img);
    const b = await w.recognize(toPng(pre), {}, { blocks: true, text: true });
    const txt = O.post(O.linesOf(O.wordsOf(b.data)));
    const depois = { ms: Date.now() - t0, wer: O.wer(refTxt, txt), bag: bag(refTxt, txt), angulo: pre.angulo, inc: pre.inclinacao, conf: Math.round(b.data.confidence) };
    rows.push({ id, desc, precisa: O.needsOcr(r1.chars), antes, depois });
    console.error(id, JSON.stringify(rows[rows.length - 1]));
  }
  await w.terminate();
  const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%', s = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  const out = ['| Amostra | Precisa de OCR | Antes: tempo | Antes: WER | Antes: palavras faltando | Depois: tempo | Depois: WER | Depois: palavras faltando | Inclinação achada / corrigida |', '|---|---|---|---|---|---|---|---|---|'];
  rows.forEach((r) => out.push(`| ${r.desc} | ${r.precisa ? 'sim' : 'não'} | ${s(r.antes.ms)} | ${pct(r.antes.wer)} | ${pct(r.antes.bag)} | ${s(r.depois.ms)} | ${pct(r.depois.wer)} | ${pct(r.depois.bag)} | ${r.depois.inc != null ? String(r.depois.inc).replace('.', ',') + '° / ' + (r.depois.angulo ? 'sim' : 'não') : '—'} |`));
  console.log(out.join('\n'));
  fs.writeFileSync(path.join(DIR, 'resultado.json'), JSON.stringify(rows, null, 1));
})();
