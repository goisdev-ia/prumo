const { chromium } = require('playwright');
const { start, G } = require('./server');
(async () => {
  G.context.setup();
  const srv = await start(8765);
  const browser = await chromium.launch();
  const errs = [];
  for (const [name, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp, colorScheme: 'dark' });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:8765/?login=1'); await page.waitForSelector('.login-form');
    await page.screenshot({ path: `shots/login_${name}.png` });
    await page.fill('#lg-email', 'novo@exemplo.com'); await page.fill('#lg-senha', 'errada'); await page.click('.login-btn');
    await page.waitForSelector('.login-err'); await page.screenshot({ path: `shots/login_${name}_erro.png` });
    await page.fill('#lg-senha', 'junio2019@'); await page.click('.login-btn');
    await page.waitForSelector('.page', { timeout: 15000 });
    await page.waitForTimeout(400);
    const who = await page.evaluate(() => window.Prumo.bootInfo.email);
    console.log(name, 'entrou como', who, '| sidebar fin:', await page.$$eval('.nav-link', (els) => els.map((e) => e.textContent.trim()).join(',')));
    await page.screenshot({ path: `shots/login_${name}_dentro.png` });
    if (name === 'd') {
      await page.evaluate(() => { location.hash = '#/cfg'; }); await page.waitForTimeout(500);
      await page.screenshot({ path: 'shots/cfg_sair.png' });
      await page.click('text=Sair'); await page.waitForSelector('.dialog, [role=dialog]'); await page.screenshot({ path: 'shots/logout_dialog.png' });
      await page.click('.dialog .btn-primary, [role=dialog] .btn-primary');
      await page.waitForSelector('.login-form', { timeout: 10000 });
      console.log('logout volta ao login: ok');
    }
    await page.close();
  }
  // sessão expirada no meio do uso
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.page');
  G.context.encerrarSessoes();
  await page.evaluate(() => window.Prumo.api.call('db.list', { table: 'tar_tarefas' }).catch(() => {}));
  await page.waitForSelector('.login-note'); await page.screenshot({ path: 'shots/login_expirada.png' });
  console.log('sessão expirada mostra login: ok');
  console.log(errs.length ? 'ERROS JS: ' + errs.join(' | ') : 'sem erros de JS');
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
