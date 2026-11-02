const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
(async () => {
  G.context.setup(); G.resetMemo(); G.context.seedDemo();
  const srv = await start(8766);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1440, height: 900, n: 'desktop' }]) {
    const p = await b.newPage({ viewport: vp });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8766/'); await p.waitForSelector('.page');
    const S = (fn, arg) => p.evaluate(fn, arg);
    await p.waitForTimeout(600);
    if (await p.isVisible('.alarm-ring')) { console.log('  (alarme da rodada anterior tocou ao abrir — esperado)'); await p.click('.alarm-ring [data-al="parar"]'); await p.waitForTimeout(400); }

    // meta de água editável
    await S(() => { location.hash = '#/nut'; }); await p.waitForTimeout(700);
    await p.click('[data-act="nut.waterGoal"]'); await p.waitForTimeout(400);
    await p.click('.layer [data-ml="3000"]'); await p.click('.layer [data-save]'); await p.waitForTimeout(900);
    ok(await S(() => window.Prumo.settings.get('nut.meta_agua_ml') === 3000 && window.Prumo.nut.waterGoal() === 3000), vp.n + ': meta de água muda para 3 L');
    ok(/3,0 L/.test(await p.textContent('[data-act="nut.waterGoal"]')), vp.n + ': cartão de água mostra 3,0 L');

    // tela de alarmes + modelo de água
    await S(() => { location.hash = '#/nut/alarmes'; }); await p.waitForTimeout(600);
    ok(/Alarmes/.test(await p.textContent('.page h1')), vp.n + ': tela Alimentação › Alarmes abre');
    await p.click('[data-act="al.modelo"][data-m="agua"]'); await p.waitForTimeout(500);
    ok(await p.isVisible('.layer [data-field="_ini"]') && await p.isVisible('.layer [data-field="intervalo_min"]') && !(await p.isVisible('.layer [data-field="hora"]')), vp.n + ': modelo "água a cada 2 h" abre com Das/Até/A cada');
    await p.click('.layer [data-save]'); await p.waitForTimeout(900);
    let al = await S(() => window.Prumo.store.all('alarmes').filter((a) => a.tipo === 'agua' && a.modo === 'intervalo' && a.ativo !== false).pop());
    ok(al && al.modo === 'intervalo' && al.hora === '08:00' && al.hora_fim === '20:00' && +al.intervalo_min === 120 && al.pular_meta === true, vp.n + ': alarme de água salvo (08–20h, 2/2h, pula com meta batida)');
    ok(await p.isVisible(`[data-alarm="${al.id}"]`), vp.n + ': aparece na lista');
    await p.click(`[data-alarm="${al.id}"] .toggle`); await p.waitForTimeout(900);
    ok(await S((id) => window.Prumo.store.get('alarmes', id).ativo === false, al.id), vp.n + ': chave desliga o alarme sem abrir o editor');
    ok(!(await p.isVisible('.layer .sheet')), vp.n + ': editor não abriu ao tocar na chave');
    await p.click(`[data-alarm="${al.id}"] .main`); await p.waitForTimeout(500);
    ok(await p.isVisible('.layer .sheet'), vp.n + ': tocar no nome abre o editor');
    await S(() => window.Prumo.ui.closeAll()); await p.waitForTimeout(300);
    // filtro por tipo
    await p.click('[data-act="al.filtro"][data-v="remedio"]'); await p.waitForTimeout(300);
    ok(!(await p.isVisible(`[data-alarm="${al.id}"]`)), vp.n + ': filtro "Remédios" esconde o de água');
    await p.click('[data-act="al.filtro"][data-v="todos"]'); await p.waitForTimeout(300);

    // tarefa com alarme 15 min antes
    await S(() => { location.hash = '#/tar'; }); await p.waitForTimeout(500);
    await S(() => window.Prumo.tar.edit(null, {})); await p.waitForTimeout(500);
    await p.fill('.layer [data-k="titulo"]', 'Reunião ' + vp.n);
    await p.fill('.layer [data-k="data_vencimento"]', '2030-05-10');
    await p.fill('.layer [data-k="hora"]', '10:00');
    await p.selectOption('.layer [data-k="_alarme"]', '15');
    await p.click('.layer [data-save]'); await p.waitForTimeout(1500);
    const ta = await S((t) => { const P = window.Prumo; const tk = P.store.all('tar_tarefas').find((x) => x.titulo === t); return tk && P.store.all('alarmes').find((a) => a.ref_id === tk.id); }, 'Reunião ' + vp.n);
    ok(ta && ta.data === '2030-05-10' && ta.hora === '09:45' && ta.modo === 'unico' && ta.tipo === 'tarefa', vp.n + ': tarefa cria alarme 15 min antes (09:45)');
    // reabrir mostra o alarme escolhido e mudar para "Sem alarme" remove
    await S((t) => { const P = window.Prumo; P.tar.edit(P.store.all('tar_tarefas').find((x) => x.titulo === t)); }, 'Reunião ' + vp.n); await p.waitForTimeout(500);
    ok(await p.$eval('.layer [data-k="_alarme"]', (e) => e.value) === '15', vp.n + ': editor da tarefa mostra "15 min antes"');
    await p.selectOption('.layer [data-k="_alarme"]', ''); await p.click('.layer [data-save]'); await p.waitForTimeout(1500);
    ok(!(await S((id) => window.Prumo.store.get('alarmes', id), ta.id)), vp.n + ': "Sem alarme" remove o alarme da tarefa');

    // tocar agora (app aberto)
    await S(async () => {
      const P = window.Prumo, d = new Date(), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      await P.store.save('alarmes', { titulo: 'Beber água agora', tipo: 'agua', modo: 'diario', hora: hh });
      P.alarms.check();
    });
    await p.waitForSelector('.alarm-ring.open', { timeout: 3000 }).catch(() => {});
    ok(await p.isVisible('.alarm-ring'), vp.n + ': alarme toca em tela cheia na hora');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `shots/alarm_ring_${vp.n}.png` });
    const antes = await S(() => window.Prumo.nut.water(window.Prumo.d.today()));
    await p.click('.alarm-ring [data-al="beber"]'); await p.waitForTimeout(1200);
    ok(await S((a) => window.Prumo.nut.water(window.Prumo.d.today()) === a + 250, antes), vp.n + ': "Bebi 250 ml" registra a água');
    ok(!(await p.isVisible('.alarm-ring')), vp.n + ': alarme fecha');
    await S(() => window.Prumo.alarms.check()); await p.waitForTimeout(300);
    ok(!(await p.isVisible('.alarm-ring')), vp.n + ': não toca de novo no mesmo minuto');
    // adiar
    await S(() => window.Prumo.alarms.test()); await p.waitForSelector('.alarm-ring.open');
    await p.click('.alarm-ring [data-al="adiar"]'); await p.waitForTimeout(400);
    ok(/Adiado para/.test(await p.textContent('#toasts')), vp.n + ': "Adiar 10 min" agenda de novo');
    await S(() => { location.hash = '#/tar/alarmes'; }); await p.waitForTimeout(600);
    await p.screenshot({ path: `shots/alarms_${vp.n}.png`, fullPage: true });
    ok(!errs.length, vp.n + ': sem erros de JS ' + errs.join(' | '));
    await p.close();
  }
  await b.close(); srv.close();
})();
