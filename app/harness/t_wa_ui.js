const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
(async () => {
  G.context.setup();
  G.setGraph((url, o) => (o.method === 'get' ? { code: 200, body: { display_phone_number: '+1 555-010-4567', verified_name: 'Test Number' } } : { code: 200, body: { messages: [{ id: 'wamid.UI' + Math.random() }] } }));
  const srv = await start(8765);
  const browser = await browser0();
  async function browser0() { return chromium.launch(); }
  const errs = [];
  for (const [name, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1440, height: 900 }]]) {
    const page = await browser.newPage({ viewport: vp, colorScheme: 'dark' });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:8765/'); await page.waitForSelector('.page');
    await page.evaluate(() => { location.hash = '#/cfg'; }); await page.waitForTimeout(400);
    ok(await page.isVisible('a[href="#/cfg/whatsapp"]'), name + ': item WhatsApp em Configurações');
    await page.click('a[href="#/cfg/whatsapp"]'); await page.waitForSelector('#wa-n');
    await page.screenshot({ path: `shots/wa_${name}_inicio.png`, fullPage: name === 'd' });
    if (name === 'm') {
      await page.fill('#wa-n', '11 98765-4321'); await page.click('[data-act="wa.saveNum"]'); await page.waitForTimeout(900);
      ok((await page.inputValue('#wa-n')) === '+55 (11) 98765-4321', 'número formatado após salvar');
      await page.click('.toggle:has(input[data-on-change="wa.toggle"])'); await page.waitForTimeout(900);
      await page.click('[data-act="wa.test"]'); await page.waitForTimeout(1200);
      ok(await page.isVisible('text=Simulado'), 'teste em modo de simulação aparece no histórico');
      // dono configura a conta
      await page.fill('#wa-pid', '123456789012345'); await page.fill('#wa-tk', 'EAAG' + 'y'.repeat(100));
      await page.click('[data-act="wa.saveCfg"]'); await page.waitForTimeout(1000);
      ok((await page.inputValue('#wa-tk')) === '', 'campo do token volta vazio (não é reenviado ao navegador)');
      await page.click('[data-act="wa.conn"]'); await page.waitForTimeout(1200);
      ok(await page.isVisible('text=Conectado:'), 'teste de conexão mostra o número da Meta');
      await page.click('.toggle:has(input[data-on-change="wa.global"])'); await page.waitForSelector('.dialog'); await page.click('.dialog .btn-primary'); await page.waitForTimeout(900);
      await page.click('.toggle:has(input[data-on-change="wa.teste"])'); await page.waitForSelector('.dialog'); await page.screenshot({ path: 'shots/wa_m_confirma.png' }); await page.click('.dialog .btn-primary'); await page.waitForTimeout(900);
      await page.click('[data-act="wa.janela"]'); await page.waitForTimeout(900);
      ok(await page.isVisible('text=Janela aberta até'), 'botão "Já mandei a mensagem" abre a janela');
      const n0 = G.graphCalls.filter((x) => x.opts.method === 'post').length;
      await page.waitForTimeout(61000 - (Date.now() % 60000) > 59000 ? 0 : 0);
      await page.click('[data-act="wa.test"]'); await page.waitForTimeout(1500);
      ok(G.graphCalls.filter((x) => x.opts.method === 'post').length === n0 + 1, 'teste real chega à API da Meta (simulada no harness)');
      await page.screenshot({ path: 'shots/wa_m_ativo.png', fullPage: true });
    }
    await page.close();
  }
  console.log(errs.length ? 'ERROS JS: ' + errs.join(' | ') : 'sem erros de JS');
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
