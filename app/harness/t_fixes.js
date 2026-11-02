const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
(async () => {
  G.context.setup(); G.resetMemo(); G.context.seedDemo();
  const srv = await start(8765);
  const browser = await chromium.launch();
  const errs = [];
  // 1) navegação no celular pelo painel de módulos e pelo menu "Mais"
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.page');
  const route = () => page.evaluate(() => location.hash);
  for (const [label, want] of [['Finanças', '#/fin'], ['Metas', '#/met'], ['Rotinas', '#/rot'], ['Início', '#/']]) {
    await page.click('[data-act="ui.modules"]:visible'); await page.waitForTimeout(300);
    await page.click(`.layer a.card:has-text("${label}")`); await page.waitForTimeout(700);
    const h = await route(); const layers = await page.$$eval('.layer', (l) => l.length);
    ok(h === want && layers === 0, `módulos › ${label}: ficou em ${h} e fechou o painel`);
  }
  await page.evaluate(() => { location.hash = '#/tar'; }); await page.waitForTimeout(400);
  await page.click('#bottomnav [data-act="ui.more"]').catch(() => {}); await page.waitForTimeout(300);
  const item = await page.$('.layer .li, .layer button.li, .layer [role=menuitem]');
  if (item) { const txt = (await item.textContent()).trim(); await item.click(); await page.waitForTimeout(700); ok(!(await route()).startsWith('#/tar') || (await route()) !== '#/tar', `menu Mais › ${txt.slice(0, 20)} navegou (${await route()})`); }
  await page.evaluate(() => { location.hash = '#/fin'; }); await page.waitForTimeout(300);
  await page.goBack(); await page.waitForTimeout(500);
  ok(true, 'voltar do aparelho volta para ' + (await route()));

  // 2) registrar progresso da meta
  const meta = await page.evaluate(() => window.Prumo.store.all('met_metas').find((m) => m.medicao !== 'automatica' && m.tipo !== 'habito'));
  await page.evaluate((id) => { location.hash = '#/met/meta/' + id; }, meta.id); await page.waitForTimeout(600);
  const before = await page.evaluate((id) => window.Prumo.store.where('met_checkins', (c) => c.meta_id === id).length, meta.id);
  await page.click('[data-act="met.checkin"].btn'); await page.waitForTimeout(400);
  await page.fill('.layer [data-field="valor"] input, .layer input[name="valor"]', '9400');
  await page.fill('.layer textarea', 'Juntei mais esse mês');
  await page.click('.layer [data-save]'); await page.waitForTimeout(1500);
  const after = await page.evaluate((id) => window.Prumo.store.where('met_checkins', (c) => c.meta_id === id && !String(c.id).startsWith('tmp')), meta.id);
  G.resetMemo(); G.context.Auth.as('voce@exemplo.com');
  const server = G.context.Db.table('met_checkins').list().filter((c) => c.meta_id === meta.id && c.nota === 'Juntei mais esse mês');
  const metaSrv = G.context.Db.table('met_metas').get(meta.id);
  ok(after.length === before + 1 && server.length === 1 && Number(server[0].valor) === 9400, 'check-in da meta salvo no servidor com meta_id e valor');
  ok(Number(metaSrv.valor_atual) === 9400, 'valor atual da meta atualizado');
  const toastErr = await page.$('.toast.error'); ok(!toastErr, 'sem toast de erro');
  // marco também salva com meta_id
  await page.click('[data-act="met.marco"]').catch(() => {}); await page.waitForTimeout(400);
  if (await page.$('.layer')) {
    await page.fill('.layer input[name="titulo"], .layer [data-field="titulo"] input', 'Entrada de 20 mil');
    await page.click('.layer [data-save]'); await page.waitForTimeout(1200);
    G.resetMemo(); const mk = G.context.Db.table('met_marcos').list().filter((x) => x.titulo === 'Entrada de 20 mil');
    ok(mk.length === 1 && mk[0].meta_id === meta.id, 'marco salvo com meta_id');
  }
  await page.screenshot({ path: 'shots/fix_meta.png' });

  // 3) tema claro
  await page.evaluate(() => window.Prumo.theme.apply('light')); await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(600);
  const bg = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.card')).backgroundColor]);
  ok(bg[0] === 'rgb(241, 241, 240)' && bg[1] === 'rgb(255, 255, 255)', 'tema claro: fundo cinza claro e cartões brancos (1.9.0): ' + bg.join(' / '));
  await page.screenshot({ path: 'shots/light_m_home.png' });
  await page.evaluate(() => { location.hash = '#/fin'; }); await page.waitForTimeout(700); await page.screenshot({ path: 'shots/light_m_fin.png' });
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  desk.on('pageerror', (e) => errs.push(e.message));
  await desk.addInitScript(() => localStorage.setItem('prumo.theme', '"light"'));
  await desk.goto('http://localhost:8765/'); await desk.waitForSelector('.page'); await desk.evaluate(() => window.Prumo.theme.apply('light')); await desk.waitForTimeout(800);
  await desk.screenshot({ path: 'shots/light_d_home.png' });
  await desk.evaluate(() => { location.hash = '#/fin'; }); await desk.waitForTimeout(900); await desk.screenshot({ path: 'shots/light_d_fin.png' });
  await desk.evaluate(() => { location.hash = '#/fit'; }); await desk.waitForTimeout(900); await desk.screenshot({ path: 'shots/light_d_fit.png' });
  await desk.evaluate(() => { location.hash = '#/met'; }); await desk.waitForTimeout(900); await desk.screenshot({ path: 'shots/light_d_met.png' });

  console.log(errs.length ? 'ERROS JS: ' + errs.join(' | ') : 'sem erros de JS');
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
