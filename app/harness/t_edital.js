// Leitura do edital: PDF real (Banco do Brasil 2022), tabela colada (TSV do usuário), texto livre, CSV;
// servidor (vírgula decimal, linhas repetidas) e interface (PDF do computador → tabela → gravar). Roda o leitor
// sanitizado (o mesmo que vai para o Apps Script) e o original.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHA - ') + m); if (!c) process.exitCode = 1; };
const load = (src) => { const m = { exports: {} }; new Function('module', 'window', src)(m, undefined); return m.exports; };
const ROOT = path.join(__dirname, '..');
const orig = load(fs.readFileSync(path.join(ROOT, 'src/js_estudos_edital.html'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, ''));
const dist = fs.readFileSync(path.join(ROOT, 'dist3/Index.html'), 'utf8');
const sanSrc = [...dist.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('Prumo.estEdital = api'));
const san = load(sanSrc);
(async () => {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const pages = await orig.pdfPages(pdfjs, new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures/edital_bb_2022.pdf'))));
  for (const [nome, E] of [['original', orig], ['sanitizado', san]]) {
    const todos = E.parse({ pages });
    ok(JSON.stringify(todos.cargos) === JSON.stringify(['AGENTE DE TECNOLOGIA', 'AGENTE COMERCIAL']), nome + ': PDF do BB: encontra os 2 cargos (' + todos.cargos.join(', ') + ')');
    const r = E.parse({ pages }, { cargo: 'AGENTE COMERCIAL' });
    const disc = [...new Set(r.linhas.map((l) => l.disciplina))];
    ok(JSON.stringify(disc) === JSON.stringify(['Língua Portuguesa', 'Língua Inglesa', 'Matemática', 'Atualidades do Mercado Financeiro', 'Matemática Financeira', 'Conhecimentos Bancários', 'Conhecimentos de Informática', 'Vendas e Negociação']), nome + ': Agente Comercial: as 8 disciplinas certas, sem as de TI');
    const by = (d) => r.linhas.filter((l) => l.disciplina === d);
    const pq = (d) => { const x = by(d); return x.every((l) => l.peso === x[0].peso && l.qtd_questoes === x[0].qtd_questoes) ? [x[0].peso, x[0].qtd_questoes] : null; };
    ok(JSON.stringify(['Língua Portuguesa', 'Língua Inglesa', 'Matemática', 'Atualidades do Mercado Financeiro', 'Matemática Financeira', 'Conhecimentos Bancários', 'Conhecimentos de Informática', 'Vendas e Negociação'].map(pq)) === JSON.stringify([[1.5, 10], [1, 5], [1.5, 5], [1, 5], [1.5, 5], [1.5, 10], [1.5, 15], [1.5, 15]]), nome + ': peso (valor por questão) e nº de questões do quadro de provas do cargo');
    ok(by('Língua Portuguesa').length === 9 && by('Língua Portuguesa').map((l) => l.item_ref).join() === '1,2,3,4,5,6,7,8,9', nome + ': Língua Portuguesa com os itens 1 a 9');
    ok(new Set(by('Conhecimentos Bancários').map((l) => l.item_ref)).size === 23 && new Set(by('Vendas e Negociação').map((l) => l.item_ref)).size === 17 && new Set(by('Conhecimentos de Informática').map((l) => l.item_ref)).size === 14, nome + ': itens em sequência mesmo com "7 -Texto", "17- Texto", "alterações.17-" e número quebrado na linha (23, 17 e 14 itens)');
    const sfn = by('Conhecimentos Bancários').filter((l) => l.item_ref === '1');
    ok(sfn.length === 2 && sfn[0].assunto === 'Sistema Financeiro Nacional' && sfn[0].subassunto === 'Estrutura do Sistema Financeiro Nacional', nome + ': "Título: parte; parte" vira assunto + subassuntos');
    const mf = by('Matemática Financeira').find((l) => l.item_ref === '2');
    ok(mf && mf.assunto === 'Juros simples' && /^Cálculo do montante/.test(mf.subassunto), nome + ': "Título - texto" vira assunto + subassunto');
    ok(by('Língua Portuguesa').every((l) => l.pagina === 33) && by('Vendas e Negociação').every((l) => l.pagina === 35) && by('Conhecimentos de Informática').find((l) => l.item_ref === '4').pagina === 34 && by('Conhecimentos de Informática').find((l) => l.item_ref === '5').pagina === 35, nome + ': página de cada item (33, 34, 35; a virada de página no meio de Informática)');
    ok(r.linhas.find((l) => /bancos-sombra/.test(l.assunto)), nome + ': junta palavra hifenizada quebrada na linha ("bancos-sombra")');
    ok(!r.linhas.some((l) => /#interna|^\d+$/.test(l.assunto + l.subassunto)), nome + ': ignora rodapé ("#interna", número da página)');
    const ti = E.parse({ pages }, { cargo: 'AGENTE DE TECNOLOGIA' });
    ok(ti.linhas.some((l) => l.disciplina === 'Tecnologia da Informação' && l.qtd_questoes === 35) && !ti.linhas.some((l) => l.disciplina === 'Vendas e Negociação') && ti.linhas.filter((l) => l.disciplina === 'Conhecimentos Bancários').every((l) => l.qtd_questoes === 5), nome + ': Agente de Tecnologia: TI com 35 questões e Bancários com 5 (quadro do outro cargo)');
  }
  // tabela colada do usuário (TSV com título de disciplina e cabeçalho repetidos)
  const t = orig.parse(fs.readFileSync(path.join(__dirname, 'fixtures/edital_bb_tabela.tsv'), 'utf8'));
  ok(t.tipo === 'tabela' && t.linhas.length === 134, 'tabela colada: 134 linhas (título de seção e cabeçalhos repetidos ignorados)');
  const l0 = t.linhas[0];
  ok(l0.disciplina === 'Língua Portuguesa' && l0.assunto === 'Interpretação de textos' && l0.subassunto === 'Compreensão de textos' && l0.item_ref === '1' && l0.pagina === 33 && l0.peso === 1.5 && l0.qtd_questoes === 10, 'tabela colada: cada coluna no seu campo (peso "1,5" → 1,5)');
  const cs = orig.parse('Disciplina;Assunto;Subassunto;Item;Pág.;Peso;Questões\nPortuguês;Crase;Regra geral;1;10;1,5;10').linhas[0];
  ok(cs && cs.peso === 1.5 && cs.pagina === 10 && cs.subassunto === 'Regra geral', 'CSV com ";" e vírgula decimal');
  const sem = orig.parse('Português\tCrase\tRegra geral\t1\t10\t2\t5').linhas[0];
  ok(sem && sem.assunto === 'Crase' && sem.qtd_questoes === 5, 'tabela sem cabeçalho usa a ordem padrão das colunas');
  const ce = orig.parse('LÍNGUA PORTUGUESA: 1 Compreensão de textos. 2 Ortografia. 3 Crase.\nDIREITO CONSTITUCIONAL: 1 Direitos fundamentais. 1.1 Direitos individuais. 1.2 Direitos sociais. 2 Organização do Estado.').linhas;
  ok(ce.length === 6 && ce[3].assunto === 'Direitos fundamentais' && ce[3].subassunto === 'Direitos individuais' && ce[3].item_ref === '1.1' && ce[5].assunto === 'Organização do Estado', 'texto estilo CEBRASPE (número sem traço, subitens 1.1, 1.2)');
  const fcc = orig.parse('Língua Portuguesa: Ortografia oficial. Acentuação gráfica. Flexão nominal e verbal.').linhas;
  ok(fcc.length === 3 && fcc[1].assunto === 'Acentuação gráfica', 'texto sem numeração e disciplina sem maiúsculas (estilo FCC)');

  // servidor: vírgula decimal e linhas repetidas
  const G = require('./gas'); const c = G.context; c.setup(); G.resetMemo(); const tok = G.devLogin();
  const api = (r, p) => { G.resetMemo(); return c.api(r, p, 'teste', tok); };
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', cargo: 'Agente Comercial' } }).data.row;
  const rows = t.linhas.map((l) => ({ ...l, peso: String(l.peso).replace('.', ','), qtd_questoes: String(l.qtd_questoes) }));
  rows.push({ ...rows[0] });
  const pv = api('est.editalApply', { concurso_id: conc.id, itens: rows, dry: true }).data.previa;
  ok(pv.repetidas === 1 && pv.novas_disciplinas.length === 8, 'prévia: 8 disciplinas novas e 1 linha repetida ignorada');
  const gr = api('est.editalApply', { concurso_id: conc.id, itens: rows, dry: false });
  const b = api('est.boot', {}).data, its = b.tables.est_edital_itens.filter((x) => x.edital_id === gr.data.edital.id);
  ok(gr.ok && its.length === 134 && its.every((x) => typeof x.peso === 'number' && !isNaN(x.peso)) && its[0].peso === 1.5 && its[0].pagina === 33 && its[0].qtd_questoes === 10, 'gravado: 134 itens com peso 1,5 numérico, página e questões');

  // interface: PDF do computador → cargo → tabela → conferir → gravar
  const { start } = require('./server');
  const srv = await start(8774); const br = await chromium.launch();
  const NM = path.join(__dirname, 'node_modules');
  for (const vp of [{ width: 1440, height: 900, n: 'desktop' }, { width: 390, height: 844, n: 'mobile' }]) {
    const ctx = await br.newContext({ viewport: vp });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/**', (rt) => { const k = rt.request().url().split('/ajax/libs/')[1]; const f = { 'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js' }[k]; return f ? rt.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, f)) }) : rt.abort(); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8774/'); await p.waitForSelector('.page');
    await p.evaluate(() => window.Prumo.est.ensure()); await p.waitForTimeout(500);
    const c2 = await p.evaluate(async () => (await window.Prumo.store.save('est_concursos', { nome: 'BB UI', cargo: 'Escriturário - Agente Comercial', banca: 'Cesgranrio' })));
    await p.evaluate((id) => window.Prumo.est.editalNew(id), c2.id); await p.waitForTimeout(500);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.layer [data-pdf]')]);
    await fc.setFiles(path.join(__dirname, 'fixtures/edital_bb_2022.pdf'));
    await p.waitForFunction(() => document.querySelectorAll('.layer .ed-grid tbody tr').length > 50, null, { timeout: 30000 });
    const st = await p.evaluate(() => ({ n: document.querySelectorAll('.layer .ed-grid tbody tr').length, cargo: (document.querySelector('.layer [data-cargo]') || {}).value, peso: document.querySelector('.layer .ed-grid tbody tr [data-k="peso"]').value, pag: document.querySelector('.layer .ed-grid tbody tr [data-k="pagina"]').value }));
    ok(st.n === 122 && st.cargo === 'AGENTE COMERCIAL' && st.peso === '1,5' && st.pag === '33', vp.n + ': PDF lido na tela: 122 linhas, cargo escolhido pelo cadastro do concurso (Agente Comercial), peso "1,5", página 33');
    await p.selectOption('.layer [data-cargo]', 'AGENTE DE TECNOLOGIA'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => [...document.querySelectorAll('.layer .ed-grid [data-k="disciplina"]')].some((i) => i.value === 'Tecnologia da Informação')), vp.n + ': trocar o cargo relê o conteúdo (aparece Tecnologia da Informação)');
    await p.selectOption('.layer [data-cargo]', 'AGENTE COMERCIAL'); await p.waitForTimeout(300);
    await p.click('.layer [data-dry]'); await p.waitForTimeout(1500);
    await p.click('.layer [data-save]'); await p.waitForTimeout(2500);
    const ed = await p.evaluate((id) => { const S = window.Prumo.store; const e = S.all('est_editais').find((x) => x.concurso_id === id); return e && { n: S.where('est_edital_itens', (x) => x.edital_id === e.id).length, obs: e.observacao, hash: location.hash }; }, c2.id);
    ok(ed && ed.n === 122 && /AGENTE COMERCIAL/.test(ed.obs || '') && /est\/edital/.test(ed.hash), vp.n + ': edital gravado com 122 itens e o cargo anotado; abre o edital verticalizado');
    ok(!errs.length, vp.n + ': sem erros de JavaScript' + (errs.length ? ' → ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
