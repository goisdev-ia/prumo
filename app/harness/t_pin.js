const { chromium } = require('playwright');
const { start, G } = require('./server');
(async () => {
  G.context.setup(); G.resetMemo(); G.context.api('auth.setPin', { pin: '2468' }, 'teste', G.devLogin()); G.resetMemo();
  const srv = await start(); const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.lock');
  for (const d of '1111') await page.click(`.pin-pad [data-n="${d}"]`);
  await page.click('.pin-pad [data-ok]'); await page.waitForTimeout(500);
  console.log('PIN errado mantém bloqueio:', !!(await page.$('.lock')));
  for (const d of '2468') await page.click(`.pin-pad [data-n="${d}"]`);
  await page.click('.pin-pad [data-ok]'); await page.waitForTimeout(500);
  console.log('PIN certo libera:', !(await page.$('.lock')));
  await page.evaluate(() => { location.hash = '#/fin/lancamentos'; }); await page.waitForTimeout(300);
  await page.keyboard.press('n'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/d_sheet.png' });
  console.log('atalho N abre painel lateral:', !!(await page.$('.layer.open .sheet')));
  await browser.close(); srv.close();
})();
