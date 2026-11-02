const { chromium } = require('playwright');
const { start, G } = require('./server');
(async () => {
  G.context.setup(); G.resetMemo();
  if (process.argv.includes('--demo')) { G.context.seedDemo(); G.resetMemo(); }
  const srv = await start();
  const browser = await chromium.launch();
  const mobile = !process.argv.includes('--desk');
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const routes = (process.env.ROUTES || '').split(',').filter(Boolean);
  await page.goto('http://localhost:8765/');
  await page.waitForSelector('.page', { timeout: 15000 });
  await page.waitForTimeout(600);
  const shots = [];
  for (const r of routes.length ? routes : ['']) {
    await page.evaluate((h) => { location.hash = '#/' + h; }, r === 'home' ? '' : r);
    await page.waitForTimeout(700);
    const f = `shots/${mobile ? 'm' : 'd'}_${(r || 'home').replace(/[\/?=]/g, '_')}.png`;
    await page.screenshot({ path: f, fullPage: !!process.env.FULL });
    shots.push(f);
    const err = await page.evaluate(() => { const e = document.querySelector('.error-box'); return e ? e.innerText : null; });
    if (err) errors.push(`[${r}] error-box: ${err}`);
  }
  console.log(shots.join('\n'));
  console.log(errors.length ? 'ERROS:\n' + [...new Set(errors)].join('\n') : 'sem erros');
  await browser.close(); srv.close();
})();
