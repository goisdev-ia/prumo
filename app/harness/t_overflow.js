const { chromium } = require('playwright');
const { start, G } = require('./server');
(async () => {
  G.context.setup(); G.resetMemo(); G.context.seedDemo(); G.resetMemo();
  const srv = await start(); const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 760 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.page');
  const routes = ['', 'fin', 'fin/lancamentos', 'fin/cartoes', 'fin/contas', 'fin/orcamento', 'fin/agenda', 'fin/reservas', 'fin/dividas', 'fin/relatorios', 'fin/categorias', 'fin/importar', 'fit', 'fit/treinos', 'fit/timers', 'fit/historico', 'fit/evolucao', 'fit/exercicios', 'fit/cardio', 'fit/calc', 'nut', 'nut/nutrientes', 'nut/metas', 'nut/alimentos', 'nut/receitas', 'nut/relatorios', 'tar', 'tar/proximas', 'tar/pendencias', 'tar/quadro', 'tar/agenda', 'tar/projetos', 'tar/foco', 'tar/concluidas', 'tar/stats', 'met', 'met/roda', 'met/linha', 'met/revisao', 'rot', 'rot/semana', 'rot/mes', 'rot/ano', 'rot/habitos', 'rot/modelos', 'rot/stats', 'rot/lista', 'cfg', 'cfg/perfil', 'cfg/aparencia', 'cfg/preferencias', 'cfg/seguranca', 'cfg/dados', 'cfg/integracoes', 'cfg/sobre', 'cfg/logs', 'cfg/arquivos'];
  const bad = [];
  for (const r of routes) {
    await page.evaluate((h) => { location.hash = '#/' + h; }, r); await page.waitForTimeout(350);
    const o = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= W + 1) return null;
      const offenders = [...document.querySelectorAll('.view *')].filter((el) => { const b = el.getBoundingClientRect(); if (b.right <= W + 1) return false; let p = el.parentElement; while (p) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) return false; p = p.parentElement; } return true; });
      return offenders.slice(0, 3).map((el) => el.className + ' ' + Math.round(el.getBoundingClientRect().right));
    });
    if (o) bad.push(r + ': ' + o.join(' | '));
  }
  console.log(bad.length ? 'OVERFLOW:\n' + bad.join('\n') : 'nenhuma rolagem horizontal em 360px');
  console.log(errs.length ? errs.join('\n') : 'sem erros');
  await browser.close(); srv.close();
})();
