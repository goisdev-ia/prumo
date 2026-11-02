// Bloco 8 na interface: o leitor abre um PDF digitalizado, lê a página aberta com OCR (Tesseract.js, por) e as
// demais em segundo plano com progresso e cancelar, monta a camada de texto invisível (busca e seleção), guarda o
// resultado e, ao reabrir, não refaz o OCR. Preferências do OCR. Celular (390 px) e computador.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
const NM = path.join(__dirname, 'node_modules');
const LIBS = { 'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'pdf-lib/1.17.1/pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js', 'xlsx/0.18.5/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js' };

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  // PDF de 3 páginas só com imagem: a página do edital escaneada, repetida
  const src = await PDFDocument.load(fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_edital_nitido.pdf')));
  const out = await PDFDocument.create(); for (let i = 0; i < 3; i++) { const [pg] = await out.copyPages(src, [0]); out.addPage(pg); }
  const buf = Buffer.from(await out.save()), sha = crypto.createHash('sha256').update(buf).digest('hex');
  const s0 = api('est.upStart', { nome: 'edital_escaneado.pdf', mime: 'application/pdf', tamanho: buf.length, hash: sha }, tok);
  const arq = api('est.upChunk', { upload_id: s0.upload_id, offset: 0, base64: buf.toString('base64') }, tok).arquivo;
  const mat = api('est.materialSave', { titulo: 'Edital escaneado', arquivo_id: arq.id, categoria: 'teoria' }, tok).material;

  const srv = await start(8781);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1280, height: 860, n: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile' });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/**', (route) => { const k = route.request().url().split('/ajax/libs/')[1]; const f2 = LIBS[k]; if (!f2) return route.abort(); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, f2)), headers: { 'Access-Control-Allow-Origin': '*' } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(250); } return false; };
    await p.goto('http://localhost:8781/'); await p.waitForSelector('.page');
    await S(() => { window.Prumo.est.OCR_BASE = location.origin + '/ocr/'; location.hash = '#/est/prefs'; });
    ok(await until(() => window.Prumo.est.loaded && /Ler PDF digitalizado \(OCR\)/.test(document.body.textContent) && document.querySelector('[data-act="est.prefOcr"][data-v="aparelho"].on')), vp.n + ': Preferências: OCR ligado e motor "Aparelho" por padrão');
    const m = await S((id) => window.Prumo.store.get('est_materiais', id), mat.id);
    if (vp.n === 'mobile') {
      await S((mm) => window.Prumo.estPdf.open(mm, { pagina: 1 }), m);
      p.on('console', (msg) => { if (/error|warn/i.test(msg.type())) console.log('# console', msg.text().slice(0, 300)); });
      const okSt = await until(() => { const e = document.querySelector('[data-ocrst]'); return e && !e.hidden && /lendo texto \(OCR\)/.test(e.textContent) && e.querySelector('[data-ocr-stop]'); }, null, 20000);
      if (!okSt) console.log('# estado', await S(() => JSON.stringify({ st: document.querySelector('[data-ocrst]') && document.querySelector('[data-ocrst]').outerHTML, q: window.__estV && window.__estV.ocrQ, ready: window.__estV && window.__estV.ocrReady, run: window.__estV && window.__estV.ocrRun, state: window.__estV && window.__estV.state, txt: window.__estV && Object.keys(window.__estV.txt) })));
      ok(okSt, 'página sem texto: começa o OCR da página aberta, com progresso e Cancelar');
      ok(await until(() => window.__estV && window.__estV.ocr[1] && document.querySelectorAll('.pv-page .textLayer span[data-ocr]').length > 200, null, 90000), 'página 1 lida: camada de texto invisível com as palavras na posição');
      const sp = await S(() => { const s = [...document.querySelectorAll('.pv-page .textLayer span[data-ocr]')], r = s[0].getBoundingClientRect(), pg = s[0].closest('.pv-page').getBoundingClientRect(); return { n: s.length, dentro: s.every((x) => { const q = x.getBoundingClientRect(); return q.left >= pg.left - 2 && q.right <= pg.right + 8 && q.top >= pg.top - 2 && q.bottom <= pg.bottom + 2; }), cor: getComputedStyle(s[0]).color, w: r.width }; });
      ok(sp.dentro && /rgba\(0, 0, 0, 0\)|transparent/.test(sp.cor) && sp.w > 2, 'palavras dentro da página e invisíveis (o texto real é a imagem)');
      const fila = await S(() => window.__estV.ocrQ.slice());
      await S(() => document.querySelector('[data-ocr-stop]') && document.querySelector('[data-ocr-stop]').click());
      ok(fila.length >= 1 && fila.every((n) => n === 2 || n === 3), 'as demais páginas entram na fila de segundo plano (' + fila.join(',') + ')');
      ok(await until(() => !window.__estV.ocrRun, null, 60000), 'Cancelar: a página em andamento termina e a fila para');
      await wait(1500);
      const st = await S((f) => ({ q: window.__estV.ocrQ.length, lidas: f.filter((n) => window.__estV.ocr[n]), t: document.querySelector('[data-ocrst]').textContent }), fila);
      ok(st.q === 0 && !st.lidas.length && /OCR cancelado/.test(st.t), 'depois de cancelar, as páginas da fila não são lidas (' + st.t + ')');
      // busca no texto do OCR
      await S(() => { window.__estV.search = { q: '', hits: [] }; document.querySelector('[data-a="side"][data-p="busca"]').click(); });
      await wait(300);
      await S(async () => { const i = document.querySelector('.pv-side [data-sq]'); i.value = 'ortografia'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      ok(await until(() => window.__estV.search.hits.some((h) => h.n === 1), null, 8000), 'a busca do leitor encontra palavra do texto lido por OCR');
            await S(() => document.querySelector('.layer:last-of-type [data-close]').click());
      await wait(1500);
      const tx = api('est.textGet', { material_id: mat.id, ocr: true }, tok);
      ok(tx.ocr['1'] && tx.ocr['1'].palavras.length > 200 && /tesseract\.js 7\.0\.0 por/.test(tx.ocr['1'].motor) && tx.paginas['1'].length > 500, 'texto e coordenadas guardados no servidor (motor tesseract.js 7.0.0 por)');
      ok(/ortografia oficial/i.test(tx.paginas['1']), 'o texto guardado alimenta IA, busca do Telegram e edital (est.textGet)');
      const runs = await S(() => window.__ocrRuns), faltam = 3 - Object.keys(tx.ocr).length;
      await S((mm) => window.Prumo.estPdf.open(mm, { pagina: 1 }), await S((id) => window.Prumo.store.get('est_materiais', id), mat.id));
      ok(await until(() => window.__estV && window.__estV.ocr[1] && window.__estV.ocr[1].cache && document.querySelectorAll('.pv-page .textLayer span[data-ocr]').length > 200, null, 30000), 'ao reabrir, a camada de texto vem do OCR guardado');
      ok(await until(() => !window.__estV.ocrRun && Object.keys(window.__estV.ocr).length === 3, null, 90000), 'ao reabrir, só a página que faltou é lida');
      ok(await S((r) => window.__ocrRuns - r, runs) === faltam, 'páginas já lidas não passam pelo OCR de novo (' + faltam + ' nova(s))');
      await S(() => { window.__estV.ocrStop = true; window.__estV.ocrQ = []; document.querySelector('.layer:last-of-type [data-close]').click(); });
      await wait(800);
    } else {
      // desktop: outro material com o mesmo arquivo
      const m2 = api('est.materialSave', { titulo: 'Escaneado 2', arquivo_id: arq.id, categoria: 'outros' }, tok).material;
      await S(() => window.Prumo.store.put('est_materiais', arguments[0]), m2).catch(() => {});
      await S((mm) => { window.Prumo.store.put('est_materiais', mm); window.Prumo.estPdf.open(mm, { pagina: 1 }); }, m2);
      ok(await until(() => window.__estV && window.__estV.n === 3, null, 20000), 'desktop: leitor abre');
      await wait(2000);
      ok(await S(() => [1, 2, 3].every((n) => window.__estV.ocr[n] && window.__estV.ocr[n].cache) && document.querySelectorAll('.pv-page .textLayer span[data-ocr]').length > 200), 'outro material com o mesmo arquivo (hash): usa o OCR já guardado, sem refazer');
      await S(() => document.querySelector('.layer:last-of-type [data-close]').click()); await wait(500);
      const noScroll = await S(() => document.documentElement.scrollWidth <= window.innerWidth);
      ok(noScroll, 'desktop: sem rolagem horizontal');
    }
    await S(() => { location.hash = '#/est/prefs'; }); await wait(400);
    if (vp.n === 'mobile') {
    await p.setViewportSize({ width: 360, height: 780 }); await wait(300);
    const larg = await S(() => { const w = document.documentElement.scrollWidth; if (w <= 360) return ''; return w + ' ' + [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > 362).slice(0, 5).map((e) => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().right)).join(' '); });
    ok(!larg, vp.n + ': Preferências a 360 px sem rolagem horizontal ' + larg);
    }
    ok(!errs.length, vp.n + ': sem erros de JavaScript ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
