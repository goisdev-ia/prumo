// Blocos 5 e 6 na interface: botão Relatório em Finanças (lançamentos e relatórios), Fitness, Alimentação, Tarefas,
// Metas, Rotinas, Estudos (desempenho) e Logs: PDF, planilha, imprimir e Telegram, com os filtros ativos da tela;
// Estudos › Relatórios (a–d); Imprimir/Baixar do PDF (original ou anotado, todas as páginas ou intervalo) no leitor e
// na Biblioteca. Celular (390 px) e computador (1280 px); 360 px sem rolagem horizontal.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
const NM = path.join(__dirname, 'node_modules');
const LIBS = { 'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'pdf-lib/1.17.1/pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js', 'xlsx/0.18.5/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js' };
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  // Telegram conectado
  const TOKEN = '8123456789:AAH' + 'k'.repeat(32); let uid = 500;
  const updates = [];
  G.setTg((method, body) => { if (method === 'getMe') return { ok: true, result: { id: 1, is_bot: true, username: 'prumo_bot' } }; if (method === 'getUpdates') return { ok: true, result: updates.filter((u) => u.update_id >= (body.offset || 0)) }; if (method === 'sendDocument') return { ok: true, result: { message_id: 9, document: { file_id: 'F' + (++uid) } } }; return { ok: true, result: { message_id: ++uid } }; });
  api('tg.saveConfig', { token: TOKEN }, tok);
  const link = api('tg.linkCode', {}, tok).url.split('start=')[1];
  updates.push({ update_id: ++uid, message: { message_id: 1, from: { id: 777, first_name: 'G' }, chat: { id: 777, type: 'private' }, text: '/start ' + link } });
  G.context.triggerFrequente();
  // dados
  const boot = api('boot', {}, tok).tables, conta = boot.fin_contas[0];
  [['Mercado Bom Preço', 'despesa', 230.4], ['Posto Shell', 'despesa', 150], ['Farmácia', 'despesa', 42.9], ['Salário', 'receita', 5000]].forEach(([d, t, v]) => api('db.save', { table: 'fin_lancamentos', row: { descricao: d, tipo: t, valor: v, data: hoje, conta_id: conta.id, status: 'pago' } }, tok));
  api('db.save', { table: 'fit_sessoes', row: { data: hoje, duracao_s: 3600, volume_total: 5200, status: 'concluida' } }, tok);
  api('db.save', { table: 'fit_medidas', row: { data: hoje, peso_kg: 80.5 } }, tok);
  api('db.save', { table: 'nut_diario', row: { data: hoje, refeicao: 'almoco', nome: 'Arroz e feijão', quantidade_g: 300, kcal: 420, proteina_g: 15 } }, tok);
  api('db.save', { table: 'tar_tarefas', row: { titulo: 'Pagar boleto', status: 'a_fazer', data_vencimento: hoje } }, tok);
  api('db.save', { table: 'tar_tarefas', row: { titulo: 'Revisar contrato', status: 'feito', concluida_em: new Date().toISOString() } }, tok);
  api('db.save', { table: 'met_metas', row: { titulo: 'Reserva de emergência', area: 'financeira', valor_inicial: 0, valor_atual: 2500, valor_alvo: 10000, unidade: 'R$', status: 'ativa' } }, tok);
  const rot = api('db.save', { table: 'rot_rotinas', row: { titulo: 'Caminhada', frequencia: 'diaria', ativa: true } }, tok).row;
  api('db.save', { table: 'rot_execucoes', row: { rotina_id: rot.id, data: hoje, status: 'feito' } }, tok);
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', banca: 'Cesgranrio', principal: true } }, tok).row;
  api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [{ disciplina: 'Conhecimentos Bancários', assunto: 'SFN' }, { disciplina: 'Português', assunto: 'Crase' }] }, tok);
  const discs = api('boot', {}, tok).tables.est_disciplinas, dCB = discs.find((d) => /Banc/.test(d.nome)), dPT = discs.find((d) => /Portug/.test(d.nome));
  for (let i = 1; i <= 60; i++) api('est.questionSave', { codigo: 'Q' + i, tipo: i % 10 === 0 ? 'certo_errado' : 'multipla', enunciado: 'Enunciado da questão ' + i + ' sobre o tema.', alternativas_json: i % 10 === 0 ? [{ letra: 'C', texto: 'Certo' }, { letra: 'E', texto: 'Errado' }] : 'ABCDE'.split('').map((l) => ({ letra: l, texto: 'Alternativa ' + l })), gabarito: i === 7 ? '' : i % 10 === 0 ? 'C' : 'ABCDE'[i % 5], banca: i <= 40 ? 'Cesgranrio' : 'FGV', concurso_id: conc.id, disciplina_id: i % 2 ? dCB.id : dPT.id }, tok);
  api('est.noteSave', { titulo: 'Resumo do SFN', tipo: 'resumo', conteudo: '# SFN\n- CMN normatiza\n- BCB executa', disciplina_id: dCB.id }, tok);
  api('est.noteSave', { titulo: 'Crase antes de palavra feminina', tipo: 'memoria', conteudo: 'Use crase antes de palavras femininas.', disciplina_id: dPT.id }, tok);
  api('db.save', { table: 'est_flashcards', row: { frente: 'Quem normatiza o SFN?', verso: 'CMN', baralho: 'Bancários', disciplina_id: dCB.id } }, tok);
  api('db.save', { table: 'est_flashcards', row: { frente: 'Crase antes de verbo?', verso: 'Não', baralho: 'Português', disciplina_id: dPT.id } }, tok);
  // PDF com 5 páginas e uma marcação
  const pdf = await PDFDocument.create(), f = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) pdf.addPage([595, 842]).drawText('Pagina ' + i, { x: 60, y: 760, size: 18, font: f });
  const buf = Buffer.from(await pdf.save()), sha = crypto.createHash('sha256').update(buf).digest('hex');
  const s0 = api('est.upStart', { nome: 'apostila.pdf', mime: 'application/pdf', tamanho: buf.length, hash: sha }, tok);
  const arq = api('est.upChunk', { upload_id: s0.upload_id, offset: 0, base64: buf.toString('base64') }, tok).arquivo;
  const mat = api('est.materialSave', { titulo: 'Apostila', arquivo_id: arq.id, categoria: 'teoria', paginas: 5 }, tok).material;
  api('est.annSave', { material_id: mat.id, arquivo_id: arq.id, paginas: { 2: [{ id: 'a1', tipo: 'marca', cor: '#F2B705', rect: [50, 700, 300, 740] }] }, base_revs: {}, op_id: 'op1' }, tok);

  const srv = await start(8785);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1280, height: 860, n: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile' });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/**', (route) => { const k = route.request().url().split('/ajax/libs/')[1]; const f2 = LIBS[k]; if (!f2) return route.abort(); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, f2)), headers: { 'Access-Control-Allow-Origin': '*' } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('# console', m.text().slice(0, 300)); });
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(150); } return false; };
    const top = '.layer:last-of-type ';
    const menuClick = async (re) => { await wait(300); const r = await S((x) => { const it = [...document.querySelectorAll('.layer:last-of-type .li')].find((y) => new RegExp(x).test(y.textContent)); if (it) { it.click(); return true; } return false; }, re); await wait(200); return r; };
    await p.goto('http://localhost:8785/'); await p.waitForSelector('.page');
    await S(() => { window.__noPrint = true; window.print = () => {}; });
    const telas = vp.n === 'mobile'
      ? [['#/fin/lancamentos', 'fin_tx'], ['#/fin/relatorios', 'fin_rel'], ['#/fit/evolucao', 'fit'], ['#/nut/relatorios', 'nut'], ['#/tar/stats', 'tar'], ['#/met', 'met'], ['#/rot/stats', 'rot'], ['#/cfg/logs', 'logs']]
      : [['#/fin/relatorios', 'fin_rel'], ['#/tar/stats', 'tar'], ['#/est/desempenho', 'est_des'], ['#/cfg/logs', 'logs']];
    for (const [hash, k] of telas) {
      await S((hh) => { window.Prumo.ui.closeAll && window.Prumo.ui.closeAll(); location.hash = hh; }, hash);
      ok(await until((kk) => document.querySelector(`.page [data-act="rep.open"][data-k="${kk}"]`), k, 15000), vp.n + ': ' + hash + ' tem o botão Relatório');
      await S(() => { window.__lastDownload = null; });
      await p.click(`.page [data-act="rep.open"][data-k="${k}"]`);
      await menuClick('Baixar PDF');
      ok(await until(() => window.__lastDownload && window.__lastDownload.mime === 'application/pdf' && window.__lastDownload.size > 1000, null, 20000), vp.n + ': ' + k + ' gera o PDF');
      if (vp.n === 'mobile' || k === 'tar') {
        await S(() => { window.__lastDownload = null; });
        await p.click(`.page [data-act="rep.open"][data-k="${k}"]`); await menuClick('Baixar planilha');
        ok(await until(() => window.__lastDownload && /\.xlsx$/.test(window.__lastDownload.name) && window.__lastDownload.size > 2000, null, 20000), vp.n + ': ' + k + ' gera a planilha XLSX (não CSV)');
      }
      ok(await S(() => !/\bCSV\b/.test(document.querySelector('.page .page-head').textContent)), vp.n + ': ' + k + ' sem botão de CSV');
    }
    if (vp.n === 'mobile') {
      // filtros ativos: busca "Mercado" nos lançamentos
      await S(() => { location.hash = '#/fin/lancamentos'; }); await wait(500);
      await p.fill('.page input[data-on-input="fin.search"]', 'Mercado'); await wait(500);
      const sp = await S(() => window.Prumo.rep.REG.fin_tx.spec());
      ok(sp.secoes[1].linhas.length === 1 && /busca: "Mercado"/.test(sp.filtros), 'relatório de lançamentos respeita a busca ativa (1 linha, filtro descrito)');
      // imprimir e Telegram
      await S(() => { window.__lastPrint = null; });
      await p.click('.page [data-act="rep.open"][data-k="fin_tx"]'); await menuClick('Imprimir');
      ok(await until(() => window.__lastPrint && window.__lastPrint.size > 1000 && document.getElementById('prumo-print'), null, 15000), 'Imprimir usa o iframe oculto');
      const n0 = G.tgCalls.filter((x) => x.method === 'sendDocument').length;
      await p.click('.page [data-act="rep.open"][data-k="fin_tx"]'); await menuClick('Enviar PDF para meu Telegram');
      ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /Telegram|Pedido/.test(t.textContent)), null, 20000), 'envio ao Telegram pela fila');
      G.context.triggerFrequente && G.context.triggerFrequente();
      const docs = G.tgCalls.filter((x) => x.method === 'sendDocument');
      ok(docs.length === n0 + 1 && /Lançamentos/.test(docs[docs.length - 1].body.caption || ''), 'o Telegram recebeu o PDF com a legenda do relatório');
      // Estudos › Relatórios
      await S(() => { location.hash = '#/est/relatorios'; });
      ok(await until(() => document.querySelectorAll('[data-act="est.relGo"]').length >= 12), 'Estudos › Relatórios: quatro relatórios (a–d)');
      await S((id) => { const s = document.querySelector('[data-rf="q.banca"]'); s.value = 'Cesgranrio'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await wait(300);
      const qs = await S(() => { const spec = window.Prumo.est.REL.questoesSpec(window.Prumo.est.REL.sortear(window.Prumo.store.all('est_questoes').filter((q) => q.banca === 'Cesgranrio'), 50)); return { n: spec.secoes[0].itens.length, gab: spec.secoes[2].itens, f: spec.filtros }; });
      ok(qs.n === 40 && qs.gab.length === 40 && /banca: Cesgranrio/.test(qs.f), '(c) sorteio respeita o filtro de banca (40 disponíveis)');
      const q7 = await S(() => { const q = window.Prumo.store.all('est_questoes').find((x) => x.codigo === 'Q7'); return window.Prumo.est.REL.gabTxt(q); });
      ok(q7 === 'sem gabarito', 'questão sem gabarito aparece como "sem gabarito" (nada é adivinhado)');
      for (const k of ['a', 'b', 'c']) { await S(() => { window.__lastDownload = null; }); await p.click(`[data-act="est.relGo"][data-k="${k}"][data-a="pdf"]`); ok(await until(() => window.__lastDownload && window.__lastDownload.size > 1000, null, 20000), `(${k}) PDF gerado`); }
      await S(() => { window.__lastDownload = null; }); await p.click('[data-act="est.relGo"][data-k="c"][data-a="xlsx"]');
      ok(await until(() => window.__lastDownload && /\.xlsx$/.test(window.__lastDownload.name), null, 20000), '(c) planilha com questões e gabarito');
      await S(() => { window.__lastDownload = null; }); await p.click('[data-act="est.relGo"][data-k="d"][data-a="pdf"]');
      ok(await until(() => /Desempenho|Concursos|Resumos|Flashcards|Montando/.test((document.querySelector('.layer:last-of-type [data-t]') || {}).textContent || '') || window.__lastDownload, null, 15000), '(d) relatório completo mostra o progresso por blocos');
      ok(await until(() => window.__lastDownload && /estudos_completo/.test(window.__lastDownload.name) && window.__lastDownload.size > 3000, null, 30000), '(d) relatório completo gerado');
      // Imprimir/Baixar do PDF na Biblioteca: original, intervalo
      await S((id) => window.Prumo.estPdf.printSheet(window.Prumo.store.get('est_materiais', id)), mat.id); await wait(300);
      ok(await S(() => /Original/.test(document.querySelector('.layer:last-of-type').textContent) && /Com as marcações/.test(document.querySelector('.layer:last-of-type').textContent) && /Intervalo/.test(document.querySelector('.layer:last-of-type').textContent)), 'Imprimir ou baixar: original/anotado e todas/intervalo');
      await p.click(top + '[data-m="intervalo"]'); await p.fill(top + '[data-r]', '2-3');
      await S(() => { window.__lastDownload = null; }); await p.click(top + '[data-dl]');
      ok(await until(() => window.__lastDownload && /_p2-3\.pdf$/.test(window.__lastDownload.name), null, 20000), 'baixar só as páginas 2-3 do original');
      await S((a) => { window.__matArq = a; }, arq.id);
      const n2 = await S(async () => { const b2 = await window.Prumo.estPdf.subset(await window.Prumo.estPdf.fetchBytes(window.__matArq), '2-3'); const L = await window.Prumo.est.lib('pdflib'); return (await L.PDFDocument.load(b2)).getPageCount(); });
      ok(n2 === 2, 'o intervalo 2-3 gera um PDF de 2 páginas');
      await S((id) => window.Prumo.estPdf.printSheet(window.Prumo.store.get('est_materiais', id)), mat.id); await wait(300);
      await p.click(top + '[data-v="anotado"]');
      await S(() => { window.__lastPrint = null; }); await p.click(top + '[data-pr]');
      ok(await until(() => window.__lastPrint && /_anotado_rev\d+\.pdf$/.test(window.__lastPrint.name), null, 20000), 'imprimir a versão anotada, desenhada com a revisão atual');
      await S((id) => window.Prumo.estPdf.printSheet(window.Prumo.store.get('est_materiais', id)), mat.id); await wait(300);
      await p.click(top + '[data-m="intervalo"]'); await p.fill(top + '[data-r]', '9-12'); await p.click(top + '[data-dl]');
      ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /Nenhuma página válida/.test(t.textContent))), 'intervalo fora do PDF avisa');
      await S(() => window.Prumo.ui.closeAll && window.Prumo.ui.closeAll());
      // 360 px
      await p.setViewportSize({ width: 360, height: 780 });
      for (const hh of ['#/fin/lancamentos', '#/fin/relatorios', '#/fit/evolucao', '#/nut/relatorios', '#/met', '#/est/relatorios', '#/cfg/logs']) {
        await S((x) => { location.hash = x; }, hh); await wait(600);
        const w = await S(() => document.documentElement.scrollWidth);
        ok(w <= 360, '360 px sem rolagem horizontal em ' + hh + (w > 360 ? ' (' + w + ')' : ''));
      }
    } else {
      // leitor: Imprimir ou baixar pelo menu
      await S((id) => window.Prumo.estPdf.open(window.Prumo.store.get('est_materiais', id), { pagina: 1 }), mat.id);
      ok(await until(() => window.__estV && window.__estV.n === 5, null, 20000), 'desktop: leitor abre');
      await p.click(top + '[data-a="menu"]'); await menuClick('Imprimir ou baixar');
      ok(await until(() => document.querySelector('.layer:last-of-type [data-v="anotado"].on')), 'no leitor, com marcações, a versão anotada vem marcada');
      await S(() => { window.__lastDownload = null; }); await p.click(top + '[data-dl]');
      ok(await until(() => window.__lastDownload && /_anotado_rev\d+\.pdf$/.test(window.__lastDownload.name), null, 20000), 'desktop: baixar o anotado pelo leitor');
      ok(await S(() => document.documentElement.scrollWidth <= window.innerWidth), 'desktop: sem rolagem horizontal');
    }
    ok(!errs.length, vp.n + ': sem erros de JavaScript ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
