// Bloco 7 — design compacto: tokens (texto 13 px, cartões com raio 10–12 px), contraste mínimo de 4,5:1 nos dois
// temas, tema claro com fundo cinza e cartões brancos, alvos de toque de 44 px no celular e nenhuma rolagem
// horizontal a 360 px nas telas principais.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
// ---------- contraste a partir dos tokens ----------
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'css_tokens.html'), 'utf8');
const tema = (t) => { const blk = css.match(new RegExp('html\\[data-theme="' + t + '"\\] \\{([\\s\\S]*?)\\n\\}'))[1], o = {}; blk.replace(/--([\w-]+):\s*([^;]+);/g, (_, k, v) => { o[k] = v.trim(); }); return o; };
const rgba = (v) => { let m; if ((m = v.match(/^#([0-9a-f]{6})$/i))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16), 1]; m = v.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map((x) => +x.trim()); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; };
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
for (const t of ['dark', 'light']) {
  const T = tema(t), falhas = [];
  ['bg', 'surface-1', 'surface-2'].forEach((bgk) => { const bg = rgba(T[bgk]); ['text', 'text-2', 'text-3', 'primary-ink', 'success', 'danger', 'info'].forEach((k) => { const r = ratio(over(rgba(T[k]), bg), bg); if (r < 4.5) falhas.push(`${k} sobre ${bgk}: ${r.toFixed(2)}`); }); });
  ok(!falhas.length, `tema ${t === 'dark' ? 'escuro' : 'claro'}: texto, texto secundário, texto fraco e cores de estado com contraste ≥ 4,5:1 no fundo e nos cartões` + (falhas.length ? ' → ' + falhas.join('; ') : ''));
}
const L = tema('light');
ok(L.bg.toUpperCase() !== L['surface-1'].toUpperCase() && L['surface-1'].toUpperCase() === '#FFFFFF' && lum(rgba(L.bg)) < 0.95, 'tema claro: fundo cinza e cartões brancos');
const root = css.match(/:root \{([\s\S]*?)\n\}/)[1];
ok(/--r-card: 1[0-2]px/.test(root) && /--fs-body: 13px/.test(root) && /--tap: 44px/.test(root), 'tokens: raio dos cartões 12 px, texto 13 px, alvo de toque 44 px');

(async () => {
  G.context.setup(); G.resetMemo(); G.devLogin();
  const srv = await start(8792);
  const b = await chromium.launch();
  const telas = ['#/', '#/fin', '#/fin/lancamentos', '#/fin/relatorios', '#/fit', '#/nut', '#/tar', '#/met', '#/rot', '#/est', '#/est/questoes', '#/est/biblioteca', '#/est/relatorios', '#/est/prefs', '#/cfg', '#/cfg/telegram/comandos'];
  for (const t of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8792/'); await p.waitForSelector('.page');
    const pequenos = [], largas = [];
    for (const hh of telas) {
      await p.evaluate((x) => { location.hash = x; }, hh); await p.waitForTimeout(700);
      await p.evaluate((x) => { document.documentElement.dataset.theme = x; }, t);
      const r = await p.evaluate(() => {
        const sel = '.page .btn, .page .btn-icon, .page .fchip, .page .seg button, .page input.input, .page select.input, .bottomnav .nav-item, .topbar .btn-icon';
        const small = [...document.querySelectorAll(sel)].filter((e) => { const b2 = e.getBoundingClientRect(), cs = getComputedStyle(e); return b2.width > 0 && b2.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && b2.height < 43.5; }).map((e) => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height));
        const card = document.querySelector('.page .card'), rad = card ? parseFloat(getComputedStyle(card).borderTopLeftRadius) : 12;
        return { small: small.slice(0, 4), n: small.length, rad, fs: parseFloat(getComputedStyle(document.body).fontSize) };
      });
      if (r.n) pequenos.push(hh + ' ' + r.n + ' (' + r.small.join(', ') + ')');
      if (r.rad < 10 || r.rad > 12 || r.fs !== 13) largas.push(hh + ' raio ' + r.rad + ' fonte ' + r.fs);
    }
    ok(!pequenos.length, `celular, tema ${t === 'dark' ? 'escuro' : 'claro'}: botões, chips, abas, campos e navegação com pelo menos 44 px de altura` + (pequenos.length ? ' → ' + pequenos.join(' | ') : ''));
    ok(!largas.length, `cartões com raio de 10–12 px e texto de 13 px em todas as telas` + (largas.length ? ' → ' + largas.join(' | ') : ''));
    await p.setViewportSize({ width: 360, height: 780 });
    const rol = [];
    for (const hh of telas) { await p.evaluate((x) => { location.hash = x; }, hh); await p.waitForTimeout(500); const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 360) rol.push(hh + ' (' + w + ')'); }
    ok(!rol.length, '360 px sem rolagem horizontal em ' + telas.length + ' telas' + (rol.length ? ' → ' + rol.join(', ') : ''));
    ok(!errs.length, 'sem erros de JavaScript ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
