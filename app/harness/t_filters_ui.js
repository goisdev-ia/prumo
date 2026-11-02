const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const ROUTES = ['fin/lancamentos', 'fin/agenda', 'fin/relatorios', 'fin/cartoes', 'fit/historico', 'fit/cardio', 'fit/evolucao', 'fit/treinos', 'nut/nutrientes', 'nut/relatorios', 'nut/receitas',
  'tar/proximas', 'tar/pendencias', 'tar/quadro', 'tar/concluidas', 'tar/stats', 'tar/alarmes', 'met', 'met/linha', 'met/concluidas', 'rot/stats', 'rot/lista', 'cfg/arquivos'];
(async () => {
  G.context.setup(); G.resetMemo(); G.context.seedDemo();
  const srv = await start(8767);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1440, height: 900, n: 'desktop' }]) {
    const p = await b.newPage({ viewport: vp });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8767/'); await p.waitForSelector('.page');
    const go = async (r) => { await p.evaluate((x) => { location.hash = '#/' + x; }, r); await p.waitForTimeout(450); };
    for (const r of ROUTES) {
      await go(r);
      const txt = await p.textContent('#view');
      const hasErr = await p.$('#view .error-box');
      const nModes = await p.$$eval('[data-act="pf.mode"]', (x) => x.length);
      const nFlt = await p.$$eval('[data-act="flt.set"], [data-on-change="flt.sel"], [data-on-input="flt.q"], [data-act="al.filtro"]', (x) => x.length);
      const cond = ['fin/cartoes', 'nut/receitas'].includes(r); // filtros só aparecem com dados suficientes
      ok(!hasErr && txt.length > 50 && (nModes || nFlt || cond), `${vp.n} ${r}: abre com filtros (${nModes} períodos, ${nFlt} outros)`);
      // percorre os modos de período
      const modes = await p.$$eval('[data-act="pf.mode"]', (x) => x.map((y) => y.dataset.v));
      for (const m of modes) {
        await p.click(`[data-act="pf.mode"][data-v="${m}"]`); await p.waitForTimeout(250);
        if (await p.$('#view .error-box')) { ok(false, `${vp.n} ${r}: modo ${m} quebrou`); break; }
        if (await p.$('[data-act="pf.step"][data-v="-1"]')) { await p.click('[data-act="pf.step"][data-v="-1"]'); await p.waitForTimeout(200); }
      }
      // chips de tipo
      const chips = await p.$$('[data-act="flt.set"]');
      if (chips.length > 1) { await chips[1].click(); await p.waitForTimeout(250); await (await p.$$('[data-act="flt.set"]'))[0].click(); await p.waitForTimeout(200); }
      if (vp.n === 'mobile' && ['fin/lancamentos', 'fin/relatorios', 'tar/concluidas', 'fit/historico', 'nut/relatorios', 'rot/stats'].includes(r)) {
        await go(r); await p.screenshot({ path: `shots/flt_${r.replace(/\//g, '_')}_${vp.n}.png` });
      }
    }
    // lançamentos: ano filtra de verdade
    await go('fin/lancamentos');
    await p.click('[data-act="pf.mode"][data-v="tudo"]'); await p.waitForTimeout(300);
    const tudo = await p.evaluate(() => window.Prumo.pf.filter('fin.tx', window.Prumo.store.all('fin_lancamentos'), 'data').length);
    await p.click('[data-act="pf.mode"][data-v="mes"]'); await p.waitForTimeout(300);
    const mes = await p.evaluate(() => window.Prumo.pf.filter('fin.tx', window.Prumo.store.all('fin_lancamentos'), 'data').length);
    ok(tudo > mes && mes > 0, `${vp.n}: lançamentos — mês (${mes}) < tudo (${tudo})`);
    const totalTxt = await p.textContent('.tx-totals');
    ok(new RegExp(String(mes)).test(totalTxt), `${vp.n}: contador da lista segue o filtro`);
    // intervalo de datas
    await p.click('[data-act="pf.mode"][data-v="intervalo"]'); await p.waitForTimeout(300);
    const d = await p.evaluate(() => window.Prumo.d.today());
    await p.fill('[data-on-change="pf.from"]', d); await p.dispatchEvent('[data-on-change="pf.from"]', 'change'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => window.Prumo.pf.range('fin.tx'));
    ok(r.from === d, `${vp.n}: intervalo "de" aplicado (${r.label})`);
    // busca em tarefas mantém o foco
    await go('tar/pendencias');
    await p.click('[data-on-input="flt.q"]'); await p.keyboard.type('zzzz'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.onInput === 'flt.q' && document.activeElement.value === 'zzzz'), `${vp.n}: busca re-renderiza sem perder o foco`);
    ok(/Nada neste filtro|Sem pendências/.test(await p.textContent('#view')), `${vp.n}: busca sem resultado mostra estado vazio`);
    ok(!errs.length, `${vp.n}: sem erros de JS ${errs.slice(0, 3).join(' | ')}`);
    await p.close();
  }
  await b.close(); srv.close();
})();
