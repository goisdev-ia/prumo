// Capturas de tela do design (bloco 7): 390 px e 1280 px, tema escuro e claro, telas principais.
// Uso: node shots_design.js <pasta de saída>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, G } = require('./server');
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
const OUT = process.argv[2] || '/tmp/shots';
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  const conta = api('boot', {}, tok).tables.fin_contas[0];
  [['Mercado Bom Preço', 'despesa', 230.4], ['Posto Shell', 'despesa', 150], ['Farmácia', 'despesa', 42.9], ['Salário', 'receita', 5000], ['Aluguel', 'despesa', 1800]].forEach(([d, t, v]) => api('db.save', { table: 'fin_lancamentos', row: { descricao: d, tipo: t, valor: v, data: hoje, conta_id: conta.id, status: 'pago' } }, tok));
  ['Pagar boleto', 'Revisar contrato', 'Ligar para o banco'].forEach((t) => api('db.save', { table: 'tar_tarefas', row: { titulo: t, status: 'a_fazer', data_vencimento: hoje } }, tok));
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', banca: 'Cesgranrio', principal: true } }, tok).row;
  api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [{ disciplina: 'Conhecimentos Bancários', assunto: 'SFN' }, { disciplina: 'Português', assunto: 'Crase' }] }, tok);
  const srv = await start(8790);
  const b = await chromium.launch();
  const telas = [['inicio', '#/'], ['financas', '#/fin'], ['lancamentos', '#/fin/lancamentos'], ['tarefas', '#/tar'], ['estudos', '#/est'], ['biblioteca', '#/est/biblioteca'], ['configuracoes', '#/cfg']];
  for (const vp of [{ width: 390, height: 844, n: '390' }, { width: 1280, height: 860, n: '1280' }]) {
    for (const tema of ['dark', 'light']) {
      const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === '390', deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto('http://localhost:8790/'); await p.waitForSelector('.page');
      await p.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      for (const [n, hh] of telas) {
        await p.evaluate((x) => { location.hash = x; }, hh); await p.waitForTimeout(900);
        await p.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
        await p.screenshot({ path: path.join(OUT, `${n}_${vp.n}_${tema}.png`), fullPage: false });
      }
      await ctx.close();
    }
  }
  await b.close(); srv.close();
  console.log('ok', fs.readdirSync(OUT).length, 'capturas em', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
