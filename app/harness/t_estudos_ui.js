// Estudos — interface: questões (treino, gabarito, exclusão), listas, simulado, importação XLSX, biblioteca, leitor de PDF
// (ferramentas, coordenadas, desfazer, favoritos, conflito, falha de rede) e exportação anotada. Celular e desktop.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const XLSX = require('xlsx');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const NM = path.join(__dirname, 'node_modules');
const LIBS = { 'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'pdf-lib/1.17.1/pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js', 'xlsx/0.18.5/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js' };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  // dados de base pelo servidor (o foco aqui é a interface)
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'TRT Teste', banca: 'FCC', principal: true } }, tok).row;
  api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [{ disciplina: 'Língua Portuguesa', assunto: 'Crase', item_ref: '1.1' }, { disciplina: 'Língua Portuguesa', assunto: 'Concordância', item_ref: '1.2' }] }, tok);
  for (let i = 0; i < 4; i++) api('est.questionSave', { tipo: 'multipla', enunciado: 'Base ' + i, alternativas_json: 'ABCD'.split('').map((l) => ({ letra: l, texto: 'Opção ' + l })), gabarito: 'A', gabarito_status: 'definitivo', banca: 'FCC' }, tok);

  // PDF de teste: 2 páginas, texto em posição conhecida; a 2ª com /Rotate 90
  const pdf = await PDFDocument.create(), f = await pdf.embedFont(StandardFonts.Helvetica);
  const p1 = pdf.addPage([595, 842]); p1.drawText('Crase antes de palavra feminina com artigo.', { x: 72, y: 700, size: 16, font: f, color: rgb(0, 0, 0) });
  p1.drawText('Segunda linha do material de estudo.', { x: 72, y: 660, size: 16, font: f });
  const p2 = pdf.addPage([595, 842]); p2.drawText('Concordancia verbal na pagina dois.', { x: 72, y: 700, size: 16, font: f }); p2.setRotation({ type: 'degrees', angle: 90 });
  const pdfBytes = Buffer.from(await pdf.save());
  // planilha de questões com 1 linha inválida
  const ws = XLSX.utils.json_to_sheet([
    { codigo: 'IMP-1', tipo: 'multipla', enunciado: 'Importada um', a: 'x', b: 'y', gabarito: 'B', banca: 'FGV', disciplina: 'Língua Portuguesa', assunto: 'Crase' },
    { codigo: 'IMP-2', tipo: 'C/E', enunciado: 'Importada dois', gabarito: 'C', banca: 'CEBRASPE' },
    { codigo: 'IMP-3', tipo: 'multipla', enunciado: '', a: 'x', b: 'y', gabarito: 'A' }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'questoes');
  const xlsxPath = '/tmp/questoes_teste.xlsx'; XLSX.writeFile(wb, xlsxPath);

  const srv = await start(8771);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1440, height: 900, n: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile' });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/**', (route) => { const k = route.request().url().split('/ajax/libs/')[1]; const f2 = LIBS[k]; if (!f2) return route.abort(); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, f2)), headers: { 'Access-Control-Allow-Origin': '*' } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(150); } return false; };
    await p.goto('http://localhost:8771/'); await p.waitForSelector('.page');
    await S(() => { location.hash = '#/est/questoes'; });
    ok(await until(() => window.Prumo.est.loaded && document.querySelector('.page h1') && /Questões/.test(document.querySelector('.page h1').textContent)), vp.n + ': Estudos › Questões carrega sob demanda');

    // ---- questão nova pelo editor ----
    await p.click('[data-act="est.qNew"]'); await wait(400);
    await p.fill('.layer [data-k="enunciado"]', 'Q UI ' + vp.n + ': qual é a capital?');
    await p.fill('.layer [data-k="_altA"]', 'Rio'); await p.fill('.layer [data-k="_altB"]', 'Brasília'); await p.fill('.layer [data-k="_altC"]', 'Salvador');
    await p.selectOption('.layer [data-k="gabarito"]', 'B');
    await p.click('.layer [data-save]'); await wait(900);
    const q = await S((t) => window.Prumo.store.all('est_questoes').find((x) => x.enunciado.startsWith(t)), 'Q UI ' + vp.n);
    ok(q && q.gabarito === 'B' && q.gabarito_status === 'preliminar' && q.alternativas_json.length === 3 && /^Q\d+$/.test(q.codigo), vp.n + ': questão criada pelo editor (código ' + (q && q.codigo) + ', gabarito B preliminar)');
    // tipo certo/errado troca as opções de gabarito
    await p.click('[data-act="est.qNew"]'); await wait(400);
    await p.click('.layer [data-seg="tipo"] [data-v="certo_errado"]'); await wait(200);
    ok(JSON.stringify(await p.$$eval('.layer [data-k="gabarito"] option', (o) => o.map((x) => x.value))) === JSON.stringify(['', 'C', 'E']), vp.n + ': em certo/errado o gabarito oferece só C e E');
    await S(() => window.Prumo.ui.closeAll()); await wait(300);

    // ---- treino: erra, vê gabarito, manda para o caderno de erros ----
    await S((id) => window.Prumo.estQ.runOne(id), q.id); await wait(500);
    await p.click('.layer [data-alt="A"]'); await p.click('.layer [data-resp]'); await wait(900);
    ok(/Errada/.test(await p.textContent('.layer .sheet-body')) && /gabarito B/.test(await p.textContent('.layer .sheet-body')), vp.n + ': treino corrige na hora (errada, gabarito B)');
    let t = await S((id) => window.Prumo.store.where('est_tentativas', (x) => x.questao_id === id), q.id);
    ok(t.length === 1 && t[0].resultado === 'errada' && t[0].modo === 'treino', vp.n + ': tentativa registrada');
    await p.click('.layer [data-erro]'); await wait(900);
    ok(await S((id) => window.Prumo.store.all('est_erros').some((e) => e.questao_id === id), q.id), vp.n + ': erro vai para o caderno de erros');
    await S(() => window.Prumo.ui.closeAll()); await wait(300);

    // ---- mudar gabarito de questão já respondida: pede motivo, recalcula sem apagar o original ----
    await S((id) => window.Prumo.act['est.qEdit']({ dataset: { id } }), q.id); await wait(500);
    await p.selectOption('.layer [data-k="gabarito"]', 'A'); await p.selectOption('.layer [data-k="gabarito_status"]', 'definitivo');
    await p.click('.layer [data-save]'); await wait(500);
    ok(/Mudar o gabarito/.test(await p.textContent('.layer:last-child .sheet-head')), vp.n + ': mudar gabarito respondido abre o pedido de motivo');
    await p.fill('.layer:last-child [data-m]', 'Gabarito definitivo publicado'); await p.click('.layer:last-child [data-ok]'); await wait(1200);
    await S(() => window.Prumo.est.reload()); await wait(600);
    t = await S((id) => window.Prumo.store.where('est_tentativas', (x) => x.questao_id === id)[0], q.id);
    const q2 = await S((id) => window.Prumo.store.get('est_questoes', id), q.id);
    ok(q2.gabarito === 'A' && q2.gabarito_status === 'definitivo' && t.resultado === 'errada' && t.resultado_atual === 'certa', vp.n + ': gabarito A definitivo; tentativa recalculada (original errada → atual certa)');
    ok(q2.gabarito_hist_json.some((h) => h.motivo === 'Gabarito definitivo publicado'), vp.n + ': motivo guardado no histórico do gabarito');

    // ---- excluir e desfazer ----
    await S((id) => window.Prumo.act['est.qEdit']({ dataset: { id } }), q.id); await wait(500);
    await p.click('.layer:last-child [data-del]'); await wait(300); await p.click('.dialog [data-yes]'); await wait(1200);
    ok(!(await S((id) => window.Prumo.store.get('est_questoes', id), q.id)), vp.n + ': questão excluída');
    await p.click('.toast [data-undo]'); await wait(1200);
    ok(!!(await S((id) => window.Prumo.store.get('est_questoes', id), q.id)), vp.n + ': desfazer devolve a questão');

    // ---- avaliação (corrige no fim) e lista aleatória ----
    await S(() => { window.Prumo.flt.set('est.q', 'q', 'Base'); window.Prumo.router.render(true); }); await wait(500);
    await p.click('[data-act="est.qRun"][data-m="avaliacao"]'); await wait(500);
    await p.click('.layer [data-alt="A"]'); await p.click('.layer [data-next]'); await wait(200); await p.click('.layer [data-alt="B"]');
    ok(!/Errada|Certa/.test(await p.textContent('.layer [data-q]')), vp.n + ': avaliação não mostra correção antes do fim');
    await p.click('.layer [data-fim]'); await wait(400); await p.click('.dialog [data-yes]'); await wait(2500);
    ok(/Resultado da avaliação/.test(await p.textContent('.layer .sheet-body')) && /2 em branco/.test(await p.textContent('.layer .sheet-body')), vp.n + ': avaliação finalizada mostra resultado com brancos contados');
    await S(() => window.Prumo.ui.closeAll()); await wait(300);
    await p.click('[data-act="est.listNew"]'); await wait(400);
    await p.click('.layer [data-seg="tipo"] [data-v="aleatoria"]'); await wait(200);
    await p.fill('.layer [data-k="_n"]', '3'); await p.fill('.layer [data-k="nome"]', 'Aleatória ' + vp.n); await p.click('.layer [data-save]'); await wait(900);
    const lst = await S((n) => window.Prumo.store.all('est_listas').find((l) => l.nome === n), 'Aleatória ' + vp.n);
    ok(lst && lst.tipo === 'aleatoria' && lst.questao_ids.split(',').length === 3, vp.n + ': lista aleatória com 3 questões do filtro');
    await S(() => { window.Prumo.flt.set('est.q', 'q', ''); });

    // ---- simulado com regra de erro informada pelo usuário ----
    await S(() => { location.hash = '#/est/simulados'; }); await wait(600);
    await p.click('[data-act="est.simNew"]'); await wait(500);
    await p.fill('.layer [name="titulo"]', 'Simulado ' + vp.n); await p.fill('.layer [name="erro"]', '-1'); await p.fill('.layer [name="duracao_min"]', '30');
    await p.fill('.layer [data-b="0"] [data-k="qtd"]', '3'); await p.dispatchEvent('.layer [data-b="0"] [data-k="qtd"]', 'change');
    await p.click('.layer [data-save]'); await wait(900);
    const sim = await S((n) => window.Prumo.store.all('est_simulados').find((s) => s.titulo === n), 'Simulado ' + vp.n);
    ok(sim && sim.regras_json.erro === -1 && sim.composicao_json.blocos[0].qtd === 3, vp.n + ': simulado salvo com erro = −1 (regra do usuário)');
    await S((id) => window.Prumo.act['est.simRun']({ dataset: { id } }), sim.id); await wait(1500);
    ok(await p.isVisible('.layer .sim-grid') && (await p.$$('.layer .sg')).length === 3, vp.n + ': cartão-resposta com 3 questões');
    await p.screenshot({ path: path.join(__dirname, 'shots', 'est_sim_' + vp.n + '.png') });
    await p.click('.layer .alts [data-alt] >> nth=0'); await p.click('.layer [data-mark]'); await wait(150);
    ok(await p.isVisible('.layer .sg.ans.mark'), vp.n + ': resposta e marcação aparecem no cartão-resposta');
    await p.click('.layer [data-go="1"]'); await p.click('.layer .alts [data-alt] >> nth=1');
    await p.click('.layer [data-fim]'); await wait(400);
    if (!(await p.isVisible('.dialog [data-yes]'))) { await p.screenshot({ path: '/tmp/simfim.png' }); console.log('  (sem diálogo) camadas:', await S(() => [...document.querySelectorAll('#layers > *')].map((x) => x.className + ':' + x.textContent.slice(0, 60)).join(' | '))); }
    await p.click('.dialog [data-yes]'); await wait(2500);
    const simF = await S((id) => window.Prumo.store.get('est_simulados', id), sim.id);
    const tot = simF.resultado_json && simF.resultado_json.total;
    ok(simF.status === 'finalizado' && tot.brancos === 1 && tot.acertos + tot.erros === 2 && Math.abs(tot.nota - (tot.acertos - tot.erros)) < 1e-9, vp.n + ': simulado finalizado; nota = acertos − erros (' + (tot && tot.nota) + ')');
    ok(/Correção/.test(await p.textContent('.page')) && /Regras: acerto 1, erro -1/.test(await p.textContent('.page')), vp.n + ': tela de resultado mostra regras e correção');

    // ---- importação de planilha (prévia com erro por linha, importa só as válidas) ----
    await S(() => { location.hash = '#/est/questoes'; }); await wait(500);
    ok(await p.isVisible('[data-act="est.qAba"][data-v="listas"].on'), vp.n + ': depois de criar a lista, a aba Listas fica aberta');
    await p.click('[data-act="est.qAba"][data-v="banco"]'); await wait(300);
    await p.click('[data-act="est.import"]'); await wait(1500);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.layer [data-pick]')]);
    await fc.setFiles(xlsxPath); await wait(1200);
    ok(/3 linha/.test(await p.textContent('.layer .sheet-body')), vp.n + ': planilha lida (3 linhas) com colunas mapeadas');
    await p.click('.layer [data-dry]'); await wait(1500);
    ok(/linha 4/.test(await p.textContent('.layer [data-res]')) && (vp.n === 'mobile' ? /2 novo/ : /2 atualizado/).test(await p.textContent('.layer [data-res]')), vp.n + ': prévia aponta erro na linha 4 e ' + (vp.n === 'mobile' ? '2 novas' : '2 atualizadas (reimportação pelo código)'));
    await p.check('.layer [data-ign]'); await p.click('.layer [data-go]'); await wait(2500);
    const imp = await S(() => window.Prumo.store.all('est_questoes').filter((x) => /^IMP-/.test(x.codigo)).map((x) => x.codigo + ':' + x.gabarito + ':' + x.tipo).sort());
    ok(JSON.stringify(imp) === JSON.stringify(['IMP-1:B:multipla', 'IMP-2:C:certo_errado']), vp.n + ': importou só as válidas (' + imp.join(', ') + ')');
    await S(() => window.Prumo.ui.closeAll()); await wait(300);

    // ---- biblioteca: envio do PDF em blocos e leitor ----
    let mat = null;
    if (vp.n === 'mobile') {
      await S(() => { location.hash = '#/est/biblioteca'; }); await wait(500);
      mat = await S(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await window.Prumo.est.uploadToLibrary([new File([u], 'Apostila crase.pdf', { type: 'application/pdf' })], { categoria: 'teoria' }); return r[0]; }, pdfBytes.toString('base64'));
      ok(mat && mat.tipo === 'pdf' && /^M\d+$/.test(mat.codigo), 'PDF vai para a biblioteca (' + (mat && mat.codigo) + ')');
      const dup = await S(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return (await window.Prumo.est.uploadToLibrary([new File([u], 'copia.pdf', { type: 'application/pdf' })], { categoria: 'teoria' }))[0]; }, pdfBytes.toString('base64'));
      ok(dup && dup.id === mat.id, 'mesmo arquivo de novo é reconhecido pelo hash (não duplica)');
    } else mat = await S(() => window.Prumo.store.all('est_materiais').find((m) => m.tipo === 'pdf'));
    // começa sem cache local para testar o download em blocos
    await S((m) => window.Prumo.estPdf.open(m, { pagina: 1 }), mat);
    ok(await until(() => document.querySelectorAll('.pv-page').length === 2 && document.querySelector('.pv-page .textLayer span')), vp.n + ': leitor abre o PDF com 2 páginas e camada de texto');
    ok(await until(() => /salvo/.test(document.querySelector('[data-state]').textContent)), vp.n + ': estado inicial "salvo"');
    const pageBox = async (n) => p.$eval(`.pv-page[data-pg="${n}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    // retângulo: arrasta de (100,100) a (250,180) em pontos de tela da página 1
    await p.click('[data-tool="retangulo"]');
    let bx = await pageBox(1);
    const scale0 = await S(() => +document.querySelector('[data-z]').textContent.replace('%', '') / 100);
    await p.mouse.move(bx.x + 40, bx.y + 40); await p.mouse.down(); await p.mouse.move(bx.x + 120, bx.y + 90, { steps: 4 }); await p.mouse.up(); await wait(300);
    ok(await until(() => /salvo$/.test(document.querySelector('[data-state]').textContent.trim()), null, 8000), vp.n + ': retângulo salvo no servidor');
    let doc = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc;
    const ret = (doc.paginas['1'] || { itens: [] }).itens.filter((a) => a.tipo === 'retangulo').sort((a, b) => (a.criado < b.criado ? 1 : -1))[0];
    // em pontos do PDF: x1 ≈ 40/scale, y2 ≈ 842 − 40/scale
    ok(ret && Math.abs(ret.rect[0] - 40 / scale0) < 2.5 && Math.abs(ret.rect[3] - (842 - 40 / scale0)) < 2.5 && Math.abs(ret.rect[2] - 120 / scale0) < 2.5, vp.n + ': retângulo gravado em pontos do PDF (' + (ret && ret.rect.join(', ')) + ' @ ' + scale0 + ')');
    // zoom: a marcação acompanha (posição na tela escala; coordenadas no PDF não mudam)
    await p.click('[data-a="zin"]'); await wait(900);
    const scale1 = await S(() => +document.querySelector('[data-z]').textContent.replace('%', '') / 100);
    const rx = await p.$eval(`.pv-page[data-pg="1"] svg g[data-aid="${ret.id}"] rect`, (e) => +e.getAttribute('x'));
    ok(Math.abs(rx - ret.rect[0] * scale1) < 2, vp.n + ': depois do zoom o retângulo é redesenhado no mesmo lugar do PDF');
    // caneta
    await p.click('[data-tool="caneta"]'); bx = await pageBox(1);
    await p.mouse.move(bx.x + 60, bx.y + 200); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(bx.x + 60 + i * 12, bx.y + 200 + (i % 2) * 10); await p.mouse.up(); await wait(200);
    // desfazer e refazer
    const np = () => S(() => document.querySelectorAll('.pv-page[data-pg="1"] svg path').length);
    const n0 = await np();
    await p.click('[data-a="undo"]'); await wait(150);
    ok(await np() === n0 - 1, vp.n + ': desfazer remove o traço da caneta');
    await p.click('[data-a="redo"]'); await wait(150);
    ok(await np() === n0, vp.n + ': refazer devolve o traço');
    // marca-texto por seleção (desktop: arrastar sobre o texto)
    if (vp.n === 'desktop') {
      await p.click('[data-tool="ler"]'); await p.click('[data-a="fitw"]'); await wait(900);
      const span = await p.$('.pv-page[data-pg="1"] .textLayer span'); await span.scrollIntoViewIfNeeded(); await wait(300); const sb = await span.boundingBox();
      await p.mouse.move(sb.x + 2, sb.y + sb.height / 2); await p.mouse.down(); await p.mouse.move(sb.x + sb.width - 2, sb.y + sb.height / 2, { steps: 6 }); await p.mouse.up(); await wait(500);
      ok(await p.isVisible('[data-selmenu] [data-sm="marca_texto"]'), 'desktop: selecionar texto mostra o menu (marcar, sublinhar, resumo, flashcard…)');
      await p.click('[data-selmenu] [data-sm="marca_texto"]'); await wait(300);
      ok(await until(() => /salvo$/.test(document.querySelector('[data-state]').textContent.trim())), 'desktop: marca-texto salvo');
      doc = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc;
      const mt = doc.paginas['1'].itens.find((a) => a.tipo === 'marca_texto');
      ok(mt && /Crase/.test(mt.trecho) && mt.rects.length >= 1 && Math.abs(mt.rects[0][1] - 700) < 8, 'desktop: marca-texto guarda o trecho e retângulos na linha do texto (y≈700): ' + (mt && mt.rects[0].join(', ')));
      // selecionar a marcação e mandar para flashcard
      await p.click('[data-tool="selecionar"]'); const pb = await pageBox(1);
      const scl = await S(() => +document.querySelector('[data-z]').textContent.replace('%', '') / 100);
      await p.mouse.click(pb.x + (mt.rects[0][0] + 20) * scl, pb.y + (842 - (mt.rects[0][1] + mt.rects[0][3]) / 2) * scl); await wait(300);
      ok(await p.isVisible('[data-objmenu] [data-om="flashcard"]'), 'desktop: selecionar a marcação abre ações (flashcard, resumo, dúvida, questão)');
      await p.click('[data-objmenu] [data-om="flashcard"]'); await wait(500);
      ok(/Crase/.test(await p.$eval('.layer:last-child [data-k="frente"]', (e) => e.value)), 'desktop: flashcard pré-preenchido com o trecho');
      await p.click('.layer:last-child [data-save]'); await wait(800);
      ok(await S(() => window.Prumo.store.all('est_flashcards').some((c) => /Crase/.test(c.frente) && /p\. 1/.test(c.origem_ref || ''))), 'desktop: flashcard criado com a origem (material e página)');
    }
    // comentário e página favorita
    await p.click('[data-tool="comentario"]'); bx = await pageBox(1);
    await p.mouse.click(bx.x + 30, bx.y + 300); await wait(500);
    await p.fill('.layer:last-child [data-t]', 'Revisar esta regra'); await p.click('.layer:last-child [data-ok]'); await wait(300);
    const favAntes = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc.favoritos.some((x) => +x.pagina === 1);
    await p.click('[data-a="fav"]'); await wait(200);
    ok(await until(() => /salvo$/.test(document.querySelector('[data-state]').textContent.trim())), vp.n + ': comentário e favorito salvos');
    doc = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc;
    ok(doc.favoritos.some((x) => +x.pagina === 1) === !favAntes && doc.paginas['1'].itens.some((a) => a.tipo === 'comentario' && a.texto === 'Revisar esta regra'), vp.n + ': favorito (' + (favAntes ? 'desmarcado' : 'marcado') + ') e comentário no JSON do Drive');

    // ---- conflito: outro aparelho altera a página 1 ----
    const other = { id: 'outro-' + vp.n, tipo: 'elipse', cor: '#60A5FA', rect: [300, 300, 380, 360], espessura: 2, opacidade: 1, ordem: 1, criado: new Date().toISOString(), alterado: new Date().toISOString() };
    const srvP1 = doc.paginas['1'];
    api('est.annSave', { material_id: mat.id, arquivo_id: mat.arquivo_id, paginas: { 1: srvP1.itens.concat([other]) }, base_revs: { 1: srvP1.rev }, op_id: 'outro-op-' + vp.n }, tok);
    const nRet = srvP1.itens.filter((a) => a.tipo === 'retangulo').length;
    await p.click('[data-tool="retangulo"]'); bx = await pageBox(1);
    await p.mouse.move(bx.x + 150, bx.y + 400); await p.mouse.down(); await p.mouse.move(bx.x + 220, bx.y + 450, { steps: 3 }); await p.mouse.up();
    ok(await until(() => [...document.querySelectorAll('.layer .sheet-head')].some((e) => /outro aparelho/.test(e.textContent))), vp.n + ': edição concorrente abre a escolha do conflito');
    await p.click('.layer:last-child [data-c="juntar"]');
    ok(await until(() => /salvo$/.test(document.querySelector('[data-state]').textContent.trim())), vp.n + ': conflito resolvido juntando');
    doc = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc;
    ok(doc.paginas['1'].itens.some((a) => a.id === other.id) && doc.paginas['1'].itens.filter((a) => a.tipo === 'retangulo').length === nRet + 1, vp.n + ': juntar mantém a elipse do outro aparelho e o retângulo novo daqui');

    await p.screenshot({ path: path.join(__dirname, 'shots', 'est_pdf_' + vp.n + '.png') });
    // ---- falha de rede: fica no aparelho e envia depois ----
    await p.route('**/rpc', async (route) => { const body = route.request().postData() || ''; if (body.includes('est.annSave')) return route.abort(); return route.continue(); });
    await p.click('[data-tool="elipse"]'); bx = await pageBox(1);
    await p.mouse.move(bx.x + 60, bx.y + 500); await p.mouse.down(); await p.mouse.move(bx.x + 140, bx.y + 560, { steps: 3 }); await p.mouse.up();
    ok(await until(() => /falha|neste aparelho/.test(document.querySelector('[data-state]').textContent)), vp.n + ': sem conexão o estado diz que ficou no aparelho / falhou (' + (await p.textContent('[data-state]')) + ')');
    ok(await S(() => Object.keys(localStorage).some((k) => k.startsWith('prumo.estpend.'))), vp.n + ': alteração guardada na fila local');
    await p.unroute('**/rpc');
    await p.click('[data-a="menu"]'); await wait(300); await p.click('.layer:last-child .li:has-text("Tentar enviar")');
    ok(await until(() => /salvo$/.test(document.querySelector('[data-state]').textContent.trim()), null, 10000), vp.n + ': ao voltar a conexão a fila é enviada');
    ok(await S(() => !Object.keys(localStorage).some((k) => k.startsWith('prumo.estpend.'))), vp.n + ': fila local esvaziada depois do envio');

    // ---- exportação anotada: revisão exata ----
    const revAgora = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc.revisao;
    await p.click('[data-a="menu"]'); await wait(300); await p.click('.layer:last-child .li:has-text("Gerar PDF com as marcações")');
    ok(await until(([mid, rv]) => window.Prumo.store.all('est_exportacoes').some((e) => e.material_id === mid && +e.revisao === rv), [mat.id, revAgora], 20000), vp.n + ': cópia anotada gerada e registrada (revisão ' + revAgora + ')');
    const expDrive = () => [...G.files.values()].filter((f) => f.blob && /_anotado\.pdf$/.test(f.name || '') && !f.trashed).length;
    ok(expDrive() === 1 && api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).exportacoes.length === 1, vp.n + ': uma cópia anotada só no Drive e no registro (a nova revisão substituiu a anterior)');
    const idx = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok);
    const ex = idx.exportacoes[0];
    ok(ex && +ex.revisao === +idx.doc.revisao, vp.n + ': exportação registra a revisão exata (' + (ex && ex.revisao) + ' = ' + idx.doc.revisao + ')');
    const arq = G.SS.getSheetByName('arquivos'); const rows = arq.getRange(1, 1, arq.getLastRow(), arq.getLastColumn()).getValues(); const hd = rows[0];
    const exRow = rows.find((r) => r[hd.indexOf('id')] === ex.arquivo_id); const did = exRow && exRow[hd.indexOf('drive_id')];
    const outBytes = did && G.files.get(did) && Buffer.from(G.files.get(did).blob.bytes.map ? G.files.get(did).blob.bytes : []);
    let outPages = 0; try { outPages = (await PDFDocument.load(new Uint8Array(outBytes))).getPageCount(); } catch (e) { console.log('  leitura do exportado:', e.message); }
    ok(outPages === 3, vp.n + ': PDF anotado válido: 2 páginas + apêndice de comentários (' + outPages + ')');
    const again = await S(async (m) => (await window.Prumo.estPdf.exportIfNeeded(m, { force: true, silent: true })), mat);
    ok(again && again.id === ex.id, vp.n + ': pedir de novo sem mudanças reaproveita a mesma cópia (sem gerar outra)');

    // ---- página com /Rotate 90: marca e exportação ----
    await S(() => document.querySelector('.pv-page[data-pg="2"]').scrollIntoView()); await wait(900);
    const dims = await pageBox(2);
    ok(dims.w > dims.h, vp.n + ': página com rotação 90 aparece deitada');
    await p.click('[data-tool="marca"]'); bx = await pageBox(2);
    await p.mouse.move(bx.x + 30, bx.y + 30); await p.mouse.down(); await p.mouse.move(bx.x + 90, bx.y + 70, { steps: 3 }); await p.mouse.up();
    ok(await until(() => /salvo$/.test(document.querySelector('[data-state]').textContent.trim())), vp.n + ': destaque na página girada salvo');
    doc = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, tok).doc;
    const mg = doc.paginas['2'].itens.find((a) => a.tipo === 'marca');
    // rotação 90: canto superior esquerdo da tela = canto inferior esquerdo do PDF (x pequeno, y pequeno)
    ok(mg && mg.rect[0] < 120 && mg.rect[1] < 120, vp.n + ': em página girada a geometria fica no espaço da página (' + (mg && mg.rect.join(', ')) + ')');

    // ---- leitura: posição e páginas visitadas ----
    await S(() => window.Prumo.ui.closeAll()); await wait(1500);
    const leit = await S((id) => window.Prumo.store.where('est_leitura', (l) => l.material_id === id)[0], mat.id);
    ok(leit && +leit.pagina === 2 && +leit.total_paginas === 2, vp.n + ': ao fechar, guarda a página onde parou (' + (leit && leit.pagina) + ')');
    ok(await S((id) => /2/.test(window.Prumo.estPdf.visited(id)), mat.id), vp.n + ': páginas visitadas ficam disponíveis para o encerramento da sessão (sem marcar como lidas)');
    ok(await S((id) => !(window.Prumo.store.where('est_leitura', (l) => l.material_id === id)[0] || {}).paginas_lidas, mat.id), vp.n + ': visitar não marca página como lida');

    // ---- larguras: nada estoura no celular ----
    for (const r of ['est/questoes', 'est/simulados', 'est/simulado/' + sim.id]) {
      await S((h) => { location.hash = '#/' + h; }, r); await wait(700);
      const over = await S(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 1, vp.n + ': #/' + r.replace(/\/[\w-]{20,}$/, '/:id') + ' sem rolagem horizontal');
    }
    ok(!errs.length, vp.n + ': sem erros de JavaScript' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
    if (vp.n === 'mobile') await p.screenshot({ path: path.join(__dirname, 'shots', 'est_questoes_mobile.png') });
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(1); });
