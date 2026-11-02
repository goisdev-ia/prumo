// Interface: importar o caderno de questões em PDF (1.200 Questões BB) pela tela de Questões — leitura com progresso,
// resumo, avisos, conferência de uma questão (com a página do PDF), planilha XLSX no modelo, importação com PDF na
// biblioteca, recortes e texto de apoio; depois a questão no treino ("Texto de apoio", imagem, "Abrir no PDF").
// E a subtela Configurações › Comandos do Telegram. Celular e computador.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const NM = path.join(__dirname, 'node_modules');
const LIBS = { 'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'pdf-lib/1.17.1/pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js', 'xlsx/0.18.5/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js' };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
const PDF = path.join(__dirname, 'fixtures', 'questoes_bb_1200.pdf');

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil 2026', banca: 'CESGRANRIO', area: 'Bancária', principal: true } }, tok).row;
  G.setTg((m) => (m === 'getMe' ? { ok: true, result: { id: 1, is_bot: true, username: 'prumo_teste_bot' } } : { ok: true, result: true }));
  api('tg.saveConfig', { token: '8123456789:AAH' + 'k'.repeat(32) }, tok);
  const srv = await start(8776);
  const b = await chromium.launch();
  for (const vp of [{ width: 1440, height: 900, n: 'desktop' }, { width: 390, height: 844, n: 'mobile' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile', acceptDownloads: true });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/**', (route) => { const k = route.request().url().split('/ajax/libs/')[1]; const f2 = LIBS[k]; if (!f2) return route.abort(); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, f2)), headers: { 'Access-Control-Allow-Origin': '*' } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(250); } return false; };
    const top = '.layer:last-of-type ';
    const shot = async (n) => { if (process.env.SHOTS) await p.screenshot({ path: `shots/qpdf_${vp.n}_${n}.png` }); };
    await p.goto('http://localhost:8776/'); await p.waitForSelector('.page');

    // ---- Comandos do Telegram (Configurações) ----
    await S(() => { location.hash = '#/cfg'; }); await wait(500);
    ok(await S(() => !!document.querySelector('a[href="#/cfg/telegram/comandos"]')), vp.n + ': Configurações tem "Comandos do Telegram"');
    await p.click('a[href="#/cfg/telegram/comandos"]');
    ok(await until(() => document.querySelectorAll('.tg-cmd').length >= 24), vp.n + ': subtela lista todos os comandos (24)');
    const txt = await S(() => document.querySelector('.page').textContent);
    ok(['/hoje', '/parar', '/estudos', '/pdf', '/relatorio', '/questoes', '/ia', '/gerar_questoes', '/resumo_ia', '/parar_estudos', 'Exemplo:', 'Frases em português', 'Respostas durante uma conversa', 'Enviar PDF, planilha ou foto'].every((x) => txt.includes(x)), 'comandos com descrição, exemplos, respostas, frases e arquivos');
    await p.fill('[data-on-input="tg.cmdQ"]', 'relatório'); await wait(700);
    ok(await S(() => { const c = [...document.querySelectorAll('.tg-cmd')].map((x) => x.textContent); return c.includes('/relatorio') && c.length < 6; }), 'busca filtra os comandos');
    if (vp.n === 'desktop') { await shot('comandos'); await p.fill('[data-on-input="tg.cmdQ"]', ''); await wait(500); await p.click('[data-act="tg.cmdMenu"]'); await wait(800); ok(G.tgCalls.some((x) => x.method === 'setMyCommands'), 'dono publica os comandos no menu "/" do bot'); }
    ok(!(await S(() => document.documentElement.scrollWidth > window.innerWidth + 1)), vp.n + ': sem rolagem horizontal na lista de comandos');
    if (vp.n === 'mobile') { ok(!errs.length, 'mobile: sem erros de JavaScript' + (errs.length ? ' → ' + errs.slice(0, 2).join(' | ') : '')); await ctx.close(); continue; }

    // ---- Importar PDF de questões ----
    await S(() => { location.hash = '#/est/questoes'; });
    ok(await until(() => window.Prumo.est.loaded && document.querySelector('[data-act="est.importPdf"]')), 'Questões tem o botão "PDF de questões"');
    await p.click('[data-act="est.importPdf"]'); await wait(500);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(top + '[data-pick]')]);
    await fc.setFiles(PDF);
    ok(await until(() => /Lendo página \d+ de 186/.test(document.querySelector('.layer:last-of-type').textContent), null, 30000), 'mostra o progresso da leitura (página X de 186)');
    ok(await until(() => /Questões lidas/.test(document.querySelector('.layer:last-of-type').textContent), null, 180000), 'leitura concluída');
    await shot('revisao');
    const lay = () => S(() => [...document.querySelectorAll('.layer')].pop().textContent.replace(/\s+/g, ' '));
    let t = await lay();
    ok(/Questões lidas 1\.199/.test(t) && /Com gabarito 1\.199/.test(t) && /9 tabela\(s\) de gabarito/.test(t), 'resumo: 1.199 questões, 1.199 com gabarito, 9 tabelas');
    ok(/Língua Portuguesa: 199/.test(t) && /Conhecimentos Bancários: 200/.test(t) && /Vendas e Negociação: 73/.test(t), 'contagem por disciplina');
    ok(/impressa como 3 entre 32 e 34/.test(t) && /Gabarito de Língua Portuguesa: 1 número/.test(t), 'avisos com página para conferir');
    ok(await S(() => [...document.querySelectorAll('.layer')].pop().querySelector('[data-op="prefixo"]').value === 'QB1200'), 'prefixo sugerido pelo nome do arquivo (questoes_bb_1200 → QB1200)');
    await p.fill(top + '[data-op="prefixo"]', 'BB'); await p.dispatchEvent(top + '[data-op="prefixo"]', 'change'); await wait(400);
    await p.selectOption(top + '[data-op="concurso"]', conc.id); await p.fill(top + '[data-op="orgao"]', 'Banco do Brasil'); await p.dispatchEvent(top + '[data-op="orgao"]', 'change');
    await p.fill(top + '[data-op="cargo"]', 'Escriturário'); await p.dispatchEvent(top + '[data-op="cargo"]', 'change');
    // conferir uma questão (com a página do PDF)
    await p.click(top + '[data-edit="0"]'); await wait(500);
    ok(await S(() => { const f = [...document.querySelectorAll('.layer')].pop().querySelector('[data-ef]'); return f.enunciado.value.startsWith('O planejamento de vendas no setor bancário') && f.c.value === 'desenvolver ações de vendas específicas para cada grupo de clientes.' && f.gabarito.value === 'C'; }), 'conferência da questão: enunciado, alternativas e gabarito editáveis');
    await p.click(top + '[data-ver]');
    ok(await until(() => { const i = document.querySelector('.layer:last-of-type [data-pv] img'); return i && i.naturalWidth > 600; }, null, 20000), '"Ver a página 8 do PDF" mostra a página para comparar');
    await p.fill(top + '[name="assunto"]', 'Técnicas de vendas (conferido)'); await p.click(top + '[data-ok]'); await wait(500);
    // filtros e desmarcar uma
    await p.click(top + '[data-act="est.qpdfF"][data-v="imagem"]'); await wait(400);
    ok(await S(() => [...document.querySelectorAll('.layer')].pop().querySelectorAll('.cardlist .li').length === 42), 'filtro "Com imagem": 42 questões com recorte');
    await p.click(top + '[data-act="est.qpdfF"][data-v="todas"]'); await wait(400);
    await p.uncheck(top + '[data-use="1"]'); await wait(200);
    ok(/Importar 1198$/.test(await S(() => [...document.querySelectorAll('.layer')].pop().querySelector('[data-go]').textContent)), 'desmarcar uma questão tira da importação');
    // planilha XLSX no modelo
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click(top + '[data-xlsx]')]);
    const xp = '/tmp/qpdf_' + Date.now() + '.xlsx'; await dl.saveAs(xp);
    const wb = XLSX.readFile(xp), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }), head = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
    ok(dl.suggestedFilename() === 'questoes_BB.xlsx' && rows.length === 1198 && ['codigo', 'tipo', 'enunciado', 'a', 'b', 'c', 'd', 'e', 'gabarito', 'gabarito_status', 'banca', 'orgao', 'cargo', 'ano', 'disciplina', 'assunto', 'texto_base', 'pagina'].every((k) => head.includes(k)), 'XLSX baixado no formato do modelo (1.198 linhas, colunas do modelo + texto de apoio e página)');
    const r0 = rows.find((r) => r.codigo === 'BB-VN-001');
    ok(r0 && r0.assunto === 'Técnicas de vendas (conferido)' && r0.orgao === 'Banco do Brasil' && r0.cargo === 'Escriturário' && r0.gabarito_status === 'definitivo' && r0.c.startsWith('desenvolver ações'), 'planilha leva a correção feita na conferência e os dados da importação');
    // importar
    await p.click(top + '[data-go]');
    ok(await until(() => /Importação concluída/.test(document.querySelector('.layer:last-of-type').textContent), null, 600000), 'importação concluída (conferência, PDF na biblioteca, recortes e gravação em blocos)');
    t = await lay();
    ok(/1198 nova\(s\), 0 atualizada\(s\)/.test(t), 'resultado: 1.198 novas');
    await shot('fim');
    const st = await S(() => { const qs = window.Prumo.store.all('est_questoes').filter((q) => /^BB-/.test(q.codigo)); return { n: qs.length, img: qs.filter((q) => q.imagem_arquivo_id).length, tb: qs.filter((q) => q.texto_base).length, mat: new Set(qs.map((q) => q.material_id)).size, conc: qs.every((q) => q.concurso_id), area: qs.every((q) => q.area === 'Bancária'), pag: qs.every((q) => q.pagina > 0) }; });
    ok(st.n === 1198 && st.img === 42 && st.tb >= 330 && st.mat === 1 && st.conc && st.area && st.pag, `no banco: ${st.n} questões, ${st.img} com imagem, ${st.tb} com texto de apoio, todas ligadas ao PDF da biblioteca e ao concurso`);
    ok(await S(() => window.Prumo.store.all('est_materiais').some((m) => /1.200_Quest/.test(m.titulo) || /questoes_bb_1200/.test(m.titulo))), 'PDF guardado na biblioteca');
    await S(() => window.Prumo.ui.closeAll()); await wait(400);
    // a questão no treino
    const lp3 = await S(() => window.Prumo.store.all('est_questoes').find((q) => q.codigo === 'BB-LP-003').id);
    await S((id) => window.Prumo.estQ.runOne(id), lp3); await wait(800);
    t = await lay();
    ok(/Texto de apoio/.test(t) && /O acendedor de lampiões e nós/.test(t) && /No Texto II, na passagem/.test(t) && /Abrir no PDF \(p\. 146\)/.test(t), 'treino: texto de apoio, pergunta e "Abrir no PDF (p. 146)"');
    await S(() => window.Prumo.ui.closeAll());
    const pe = await S(() => window.Prumo.store.all('est_questoes').find((q) => q.codigo === 'BB-PE-035').id);
    await S((id) => window.Prumo.estQ.runOne(id), pe);
    ok(await until(() => { const i = document.querySelector('.layer:last-of-type img[alt="Imagem do enunciado"]'); return i && i.naturalWidth > 200; }, null, 15000), 'questão com gráficos mostra a imagem recortada do PDF');
    await shot('treino_img');
    ok(!errs.length, 'desktop: sem erros de JavaScript' + (errs.length ? ' → ' + errs.slice(0, 2).join(' | ') : ''));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(1); });
