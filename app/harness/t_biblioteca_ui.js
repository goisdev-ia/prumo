// Interface dos blocos 1 e 2: guardar arquivos com categoria (obrigatória) e concurso, sugestão para planilha e oferta
// de importação, filtro por categoria, edição em lote (move no Drive), caminho da pasta no material, "Reorganizar
// biblioteca" com prévia e "Procurar duplicados" com lixeira e desfazer. Celular e computador.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), crypto = require('crypto'), vm = require('vm');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil 2026', principal: true } }, tok).row;
  const up = (nome, buf, extra) => { const s = api('est.upStart', Object.assign({ nome, mime: 'application/pdf', tamanho: buf.length, hash: sha(buf) }, extra || {}), tok); return s.duplicado ? s : api('est.upChunk', { upload_id: s.upload_id, offset: 0, base64: buf.toString('base64') }, tok); };
  // material antigo (estrutura antiga) e duplicados antigos de cópia anotada
  const aOld = up('antigo.pdf', Buffer.from('%PDF antigo')).arquivo;
  vm.runInContext(`Auth.as('voce@exemplo.com'); Db.table('est_materiais').insert({ codigo: 'M77', titulo: 'Apostila antiga', tipo: 'pdf', arquivo_id: '${aOld.id}', situacao: 'a_estudar' })`, G.context);
  const mOld = api('est.boot', {}, tok).tables.est_materiais.find((m) => m.codigo === 'M77');
  api('est.annSave', { material_id: mOld.id, arquivo_id: aOld.id, paginas: { 1: [{ id: 'a', tipo: 'marca', rect: [1, 1, 2, 2] }] }, base_revs: {}, op_id: 'o1' }, tok);
  [1, 1].forEach((rv, i) => { const e = up('M77_anotado_r' + (i + 1) + '.pdf', Buffer.from('%PDF anotada ' + i), { destino: 'exportacoes' }).arquivo; vm.runInContext(`Auth.as('voce@exemplo.com'); Db.table('est_exportacoes').insert({ material_id: '${mOld.id}', tipo: 'anotado', revisao: ${rv}, arquivo_id: '${e.id}', hash: '${e.hash}', tamanho_bytes: ${e.tamanho_bytes} })`, G.context); });
  const pdf1 = '/tmp/bib_caderno.pdf', xls = '/tmp/bib_questoes.xlsx';
  fs.writeFileSync(pdf1, '%PDF-1.4 caderno de teste'); fs.writeFileSync(xls, 'PK planilha de teste');

  const srv = await start(8778);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1280, height: 860, n: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(150); } return false; };
    const top = '.layer:last-of-type ';
    await p.goto('http://localhost:8778/'); await p.waitForSelector('.page');
    await S(() => { location.hash = '#/est/biblioteca'; });
    ok(await until(() => window.Prumo.est.loaded && /Biblioteca/.test(document.querySelector('.page h1').textContent)), vp.n + ': biblioteca abre');
    if (vp.n === 'mobile') {
      // guardar PDF: categoria obrigatória
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act="est.matUpload"]')]);
      await fc.setFiles(pdf1); await wait(500);
      ok(await S(() => /Categoria \*/.test(document.querySelector('.layer:last-of-type').textContent) && !document.querySelector('.layer:last-of-type [data-cat].on')), 'ao enviar um PDF, pergunta a categoria (sem pré-seleção) e o concurso');
      await p.click(top + '[data-ok]'); await wait(300);
      ok(await S(() => /Escolha a categoria/.test(document.body.textContent)), 'sem categoria não guarda');
      await p.click(top + '[data-cat="questoes"]'); await p.selectOption(top + '[data-conc]', conc.id); await p.click(top + '[data-ok]');
      ok(await until(() => window.Prumo.store.all('est_materiais').some((m) => m.titulo === 'bib_caderno' && m.categoria === 'questoes' && /^PDFs\/Banco do Brasil 2026\/\d{4}-\d\d-\d\d\/Questões$/.test(m.pasta)), null, 15000), 'PDF guardado em Questões, na pasta PDFs/Banco do Brasil 2026/data/Questões');
      // planilha: sugestão Questões e oferta de importação
      const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act="est.matUpload"]')]);
      await fc2.setFiles(xls); await wait(500);
      ok(await S(() => { const on = document.querySelector('.layer:last-of-type [data-cat].on'); return on && on.dataset.cat === 'questoes'; }), 'planilha: Questões vem sugerida (quem confirma é você)');
      await p.click(top + '[data-ok]');
      ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /importar as questões desta planilha/.test(t.textContent))), 'depois de guardar a planilha em Questões, oferece importar');
      await wait(300);
    }
    // filtro por categoria
    const catF = vp.n === 'mobile' ? ['questoes', 'Questões'] : ['revisoes', 'Revisões'];
    await S((c) => { window.Prumo.flt.set('est.bib', 'cat', c); window.Prumo.router.render(true); }, catF[0]); await wait(300);
    ok(await S((l) => [...document.querySelectorAll('.page .cardlist .li')].every((li) => li.textContent.includes(l)) && document.querySelectorAll('.page .cardlist .li').length >= 1, catF[1]), vp.n + ': filtro por categoria (' + catF[1] + ')');
    await S(() => { window.Prumo.flt.set('est.bib', 'cat', ''); window.Prumo.router.render(true); }); await wait(300);
    // lote
    const ids = await S(() => window.Prumo.store.all('est_materiais').filter((m) => m.arquivo_id && m.codigo !== 'M77').map((m) => m.id));
    for (const id of ids.slice(0, 2)) await p.check(`[data-on-change="est.bibSel"][data-id="${id}"]`);
    await wait(300);
    await p.selectOption('[data-on-change="est.bibLoteCat"]', 'revisoes');
    ok(await until((x) => x.every((id) => { const m = window.Prumo.store.get('est_materiais', id); return m.categoria === 'revisoes' && /\/Revisões$/.test(m.pasta); }), ids.slice(0, 2), 10000), vp.n + ': edição em lote muda a categoria e move as pastas');
    // caminho no material
    await S((id) => { const m = window.Prumo.store.get('est_materiais', id); window.Prumo.act['est.matMenu']({ dataset: { id } }); }, ids[0]); await wait(300);
    await p.click(top + '.li:has-text("Editar dados")').catch(() => {}); await wait(400);
    ok(await S(() => /Pasta no Drive: Estudos \/ (PDFs|Planilhas) \//.test(document.querySelector('.layer:last-of-type').textContent)), vp.n + ': o material mostra o caminho da pasta no Drive');
    await S(() => window.Prumo.ui.closeAll());
    // reorganizar
    await p.click('[data-act="est.libReorg"]');
    if (vp.n === 'mobile') {
      ok(await until(() => /1 arquivo\(s\) vão para a estrutura/.test((document.querySelector('.layer:last-of-type') || {}).textContent || '')), 'Reorganizar mostra a prévia (1 arquivo antigo)');
      ok(await S(() => /PDFs \/ Geral \/ \d{4}-\d\d-\d\d \/ Outros/.test(document.querySelector('.layer:last-of-type').textContent)), 'prévia mostra o destino');
      await p.click(top + '[data-ok]');
      ok(await until(() => /M77/.test(JSON.stringify(window.Prumo.store.all('est_materiais').filter((m) => m.codigo === 'M77' && m.pasta))), null, 10000), 'arquivo antigo reorganizado');
    } else ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /já está organizada/.test(t.textContent))), 'desktop: biblioteca já organizada');
    ok(!(await S(() => document.documentElement.scrollWidth > window.innerWidth + 1)), vp.n + ': sem rolagem horizontal na biblioteca');
    // duplicados
    await S(() => { location.hash = '#/est/prefs'; }); await wait(600);
    await p.click('[data-act="est.dupScan"]');
    if (vp.n === 'mobile') {
      ok(await until(() => /Arquivos duplicados/.test((document.querySelector('.layer:last-of-type') || {}).textContent || '') && document.querySelectorAll('.layer:last-of-type [data-dup]').length === 1), 'Procurar duplicados lista a cópia anotada antiga (fica a atual)');
      await p.click(top + '[data-ok]'); await wait(300); await p.click('.dialog [data-yes]');
      ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /na lixeira · .* liberados/.test(t.textContent))), 'manda para a lixeira com o espaço liberado');
      ok(api('est.dupScan', {}, tok).itens.length === 0, 'sem duplicados depois da limpeza');
      await p.click('.toast button');
      ok(await until(() => true) && await (async () => { await wait(800); return api('est.dupScan', {}, tok).itens.length === 1; })(), 'desfazer devolve o arquivo');
      api('est.dupClean', { ids: api('est.dupScan', {}, tok).itens.map((x) => x.id) }, tok);
    } else ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /Nenhum arquivo duplicado/.test(t.textContent))), 'desktop: nenhum duplicado depois da limpeza');
    ok(!errs.length, vp.n + ': sem erros de JavaScript' + (errs.length ? ' → ' + errs.slice(0, 2).join(' | ') : ''));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(1); });
