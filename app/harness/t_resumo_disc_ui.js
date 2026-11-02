// Blocos 4 e 3 na interface: "Resumir com IA" (modos, foco, páginas, leitura do texto antes, progresso por bloco,
// Cancelar, prévia com rótulo, aprovar, duplicar, mover com desfazer, copiar, exportar PDF, excluir com desfazer) e
// Discursivas (Temas com IA, Treinar com cronômetro, correção a–e com aplicar trechos como nova versão, texto de
// exemplo). Celular (390 px) e computador (1280 px); sem rolagem horizontal a 360 px.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
const NM = path.join(__dirname, 'node_modules');
const LIBS = { 'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'pdf-lib/1.17.1/pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js', 'xlsx/0.18.5/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js' };

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', cargo: 'Agente', banca: 'Cesgranrio', principal: true } }, tok);
  const prompts = [];
  G.setAi((url, body) => {
    if (/\/models$/.test(url)) return { code: 200, body: { data: [{ id: 'llama' }] } };
    const u = body.messages[body.messages.length - 1].content; prompts.push(u); let t;
    if (/Junte os resumos parciais/.test(u)) t = '# Resumo final\n- Conselho Monetário Nacional [p. 1]\n- Banco Central [p. 30]';
    else if (/Faça um resumo/.test(u)) t = 'Parcial ' + ((u.match(/\[p\. (\d+)\]/) || [])[1]);
    else if (/Corrija o texto/.test(u)) t = JSON.stringify({ a_notas: [{ nota: 7, justificativa: 'Bom domínio' }, { nota: 4, justificativa: 'Parágrafos ok' }, { nota: 3, justificativa: 'Concordância' }], b_pontos_fortes: ['Tese clara'], c_problemas: [{ trecho: 'os bancos tem', problema: 'concordância: têm', tipo: 'lingua' }], d_reescritas: [{ original: 'os bancos tem', sugerido: 'os bancos têm', motivo: 'concordância verbal' }], e_plano: 'Revise a concordância.' });
    else if (/Sugira \d+ propostas/.test(u)) t = JSON.stringify([{ titulo: 'Educação financeira', proposta: 'Redija um texto dissertativo sobre educação financeira e o papel dos bancos.', criterios: [{ nome: 'Conteúdo', max: 10 }, { nome: 'Estrutura', max: 5 }, { nome: 'Língua', max: 5 }], limite_linhas: 30, tempo_min: 60 }]);
    else if (/texto de exemplo/.test(u)) t = 'Texto de exemplo bem estruturado sobre educação financeira.';
    else t = 'OK';
    return { code: 200, body: { choices: [{ message: { content: t } }] } };
  });
  api('est.aiConfig', { acao: 'salvar', nome: 'Groq', base: 'https://api.groq.com/openai/v1', formato: 'openai', chave: 'gsk_x1234', modelos: [{ id: 'llama', nome: 'Llama' }] }, tok);
  api('est.aiConfig', { acao: 'limite', limite: 300 }, tok);
  // PDF de 45 páginas com texto (blocos de páginas)
  const pdf = await PDFDocument.create(), f = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 45; i++) { const pg = pdf.addPage([595, 842]); for (let l = 0; l < 30; l++) pg.drawText(`Pagina ${i} linha ${l} sobre o Sistema Financeiro Nacional e o Conselho Monetario Nacional.`, { x: 40, y: 800 - l * 22, size: 10, font: f }); }
  const buf = Buffer.from(await pdf.save()), sha = crypto.createHash('sha256').update(buf).digest('hex');
  const s0 = api('est.upStart', { nome: 'apostila_sfn.pdf', mime: 'application/pdf', tamanho: buf.length, hash: sha }, tok);
  const arq = api('est.upChunk', { upload_id: s0.upload_id, offset: 0, base64: buf.toString('base64') }, tok).arquivo;
  const mat = api('est.materialSave', { titulo: 'Apostila SFN', arquivo_id: arq.id, categoria: 'teoria', paginas: 45 }, tok).material;

  const srv = await start(8783);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1280, height: 860, n: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile', permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/**', (route) => { const k = route.request().url().split('/ajax/libs/')[1]; const f2 = LIBS[k]; if (!f2) return route.abort(); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, f2)), headers: { 'Access-Control-Allow-Origin': '*' } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('# console', m.text().slice(0, 300)); });
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(150); } return false; };
    const top = '.layer:last-of-type ';
    const menuClick = async (re) => { await wait(250); const ok2 = await S((r) => { const it = [...document.querySelectorAll('.layer:last-of-type .menu button, .layer:last-of-type [role="menuitem"], .layer:last-of-type .li')].find((x) => new RegExp(r).test(x.textContent)); if (it) { it.click(); return true; } return false; }, re); await wait(250); return ok2; };
    await p.goto('http://localhost:8783/'); await p.waitForSelector('.page');
    await S(() => { location.hash = '#/est/biblioteca'; });
    ok(await until(() => window.Prumo.est.loaded && window.Prumo.est.aiOn()), vp.n + ': Estudos com IA ligada');
    if (vp.n === 'mobile') {
      // menu do material tem "Resumir com IA"
      await S((id) => window.Prumo.est.matMenu ? window.Prumo.est.matMenu(window.Prumo.store.get('est_materiais', id)) : null, mat.id);
      await S((id) => window.Prumo.est.resumoIA(window.Prumo.store.get('est_materiais', id)), mat.id);
      ok(await until(() => /Objetivo/.test(document.querySelector('.layer:last-of-type').textContent) && document.querySelectorAll('.layer:last-of-type [data-modo]').length === 3), 'Resumir com IA: três modos (Objetivo, Direcionado, Detalhado)');
      await p.click(top + '[data-modo="direcionado"]');
      ok(await S(() => !document.querySelector('.layer:last-of-type [data-foco]').hidden), 'Direcionado mostra o campo de foco');
      await p.click(top + '[data-go]');
      ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /foco/.test(t.textContent))), 'sem foco: pede o foco antes de gerar');
      await p.click(top + '[data-modo="detalhado"]'); await p.fill(top + '[data-pg]', '1-45');
      // atrasa cada passo para dar tempo de ver o progresso
      await p.route('**/rpc', async (route) => { const body = route.request().postData() || ''; if (body.includes('est.aiResumoStep')) await new Promise((r) => setTimeout(r, 700)); return route.continue(); });
      const n0 = prompts.length;
      await p.click(top + '[data-go]');
      ok(await until(() => /Lendo o texto do PDF|Conferindo o texto|Baixando|Abrindo/.test(document.querySelector('.layer:last-of-type').textContent), null, 8000), 'antes da IA, o app lê o texto das páginas que faltam');
      ok(await until(() => /Resumindo o bloco 1 de \d+/.test(document.querySelector('.layer:last-of-type').textContent) && document.querySelector('.layer:last-of-type [data-cancel]') && document.querySelector('.layer:last-of-type [role="progressbar"]'), null, 30000), 'progresso por bloco ("bloco 1 de N"), barra e Cancelar');
      ok(await until(() => /Juntando os blocos/.test(document.querySelector('.layer:last-of-type').textContent), null, 60000), 'depois dos blocos, a junção');
      ok(await until(() => /Resumo detalhado \(IA\)/.test(document.querySelector('.layer:last-of-type').textContent) && document.querySelector('.layer:last-of-type .note-preview h1, .layer:last-of-type .note-preview h2, .layer:last-of-type .note-preview'), null, 30000), 'resultado abre na prévia');
      await p.unroute('**/rpc');
      const tx = api('est.textGet', { material_id: mat.id }, tok);
      const jr = api('est.boot', {}, tok).tables.est_jobs.filter((j) => j.tipo === 'ia_resumo')[0], nb = jr.params_json.blocos.length;
      ok(Object.keys(tx.paginas).length === 45 && nb > 1 && prompts.length - n0 === nb + 1, 'texto das 45 páginas guardado e ' + (nb + 1) + ' chamadas da IA (' + nb + ' blocos + junção)');
      ok(await S(() => /Gerado por IA · Groq · llama · rascunho: confira/.test(document.querySelector('.layer:last-of-type').textContent) && /modo detalhado/.test(document.querySelector('.layer:last-of-type').textContent)), 'prévia com o rótulo "Gerado por IA · provedor · modelo" e o modo');
      const nota = () => S(() => window.Prumo.store.all('est_anotacoes').filter((n) => n.gerado_ia && n.tipo === 'resumo' && !n.deleted_at));
      let ns = await nota(); const nid = ns[0].id;
      await p.click(top + '[data-ok]');
      ok(await until((id) => window.Prumo.store.get('est_anotacoes', id).aprovado === true, nid), 'Aprovar');
      // ações
      await p.click(top + '[data-more]');
      ok(await menuClick('Duplicar'), 'menu: Duplicar');
      ok(await until(() => window.Prumo.store.all('est_anotacoes').filter((n) => /\(cópia\)$/.test(n.titulo) && !n.deleted_at).length === 1), 'resumo duplicado');
      await p.click(top + '[data-more]'); await menuClick('Exportar PDF');
      ok(await until(() => window.__lastDownload && /^resumo_/.test(window.__lastDownload.name) && window.__lastDownload.mime === 'application/pdf' && window.__lastDownload.size > 800, null, 15000), 'Exportar PDF gera o arquivo do resumo');
      await p.click(top + '[data-more]'); await menuClick('Copiar texto');
      ok(await until(() => [...document.querySelectorAll('.toast')].some((t) => /Texto copiado/.test(t.textContent))), 'Copiar texto');
      await p.click(top + '[data-more]'); await menuClick('Mover');
      await S((mid) => { const s = document.querySelector('.layer:last-of-type [data-m]'); s.value = ''; }, mat.id);
      await p.click(top + '[data-ok]');
      ok(await until((id) => window.Prumo.store.get('est_anotacoes', id).material_id === null, nid), 'Mover (tirar do material)');
      await S(() => { const t = [...document.querySelectorAll('.toast')].find((x) => /movido/.test(x.textContent)); const u = t && t.querySelector('button'); if (u) u.click(); });
      ok(await until((a) => window.Prumo.store.get('est_anotacoes', a[0]).material_id === a[1], [nid, mat.id]), 'Desfazer o mover');
      // lista de resumos abre a prévia; excluir com desfazer
      await S(() => { window.Prumo.ui.closeAll && window.Prumo.ui.closeAll(); location.hash = '#/est/resumos'; });
      ok(await until((id) => document.querySelector(`[data-act="est.resumoView"][data-id="${id}"]`), nid), 'Resumos: o rascunho da IA abre na prévia');
      await p.click(`[data-act="est.resumoView"][data-id="${nid}"]`); await wait(300);
      await p.click(top + '[data-more]'); await menuClick('Excluir');
      ok(await until((id) => !window.Prumo.store.get('est_anotacoes', id) && window.Prumo.store.getAny('est_anotacoes', id).deleted_at, nid), 'Excluir');
      await S(() => { const t = [...document.querySelectorAll('.toast')].find((x) => /excluído/.test(x.textContent)); const u = t && t.querySelector('button'); if (u) u.click(); });
      ok(await until((id) => window.Prumo.store.get('est_anotacoes', id) && !window.Prumo.store.get('est_anotacoes', id).deleted_at, nid), 'Desfazer a exclusão');
      // Cancelar
      await p.route('**/rpc', async (route) => { const body = route.request().postData() || ''; if (body.includes('est.aiResumoStep')) await new Promise((r) => setTimeout(r, 2500)); return route.continue(); });
      await S((id) => window.Prumo.est.resumoIA(window.Prumo.store.get('est_materiais', id)), mat.id); await wait(300);
      await p.fill(top + '[data-pg]', '1-45'); await p.click(top + '[data-go]');
      ok(await until(() => /Resumindo o bloco 1 de \d+/.test(document.querySelector('.layer:last-of-type').textContent), null, 15000), 'novo resumo começa');
      const jobsAntes = await S(() => window.Prumo.store.all('est_jobs').length);
      await p.click(top + '[data-cancel]');
      await wait(3500);
      const jb = await S(() => window.Prumo.store.all('est_jobs').filter((j) => j.tipo === 'ia_resumo').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]);
      ok(G.context && api('est.boot', {}, tok).tables.est_jobs.find((j) => j.id === jb.id).status === 'cancelado', 'Cancelar marca o pedido como cancelado no servidor');
      await p.unroute('**/rpc');
    }
    // ---------- discursivas ----------
    await S(() => { window.Prumo.ui.closeAll && window.Prumo.ui.closeAll(); location.hash = '#/est/discursivas'; });
    ok(await until(() => document.querySelector('[data-act="est.discTreinar"]') && document.querySelector('[data-act="est.discTemas"]')), vp.n + ': Discursivas com Treinar e Temas com IA');
    if (vp.n === 'mobile') {
      await p.click('[data-act="est.discTemas"]'); await wait(300);
      await p.click(top + '[data-go]');
      ok(await until(() => /Educação financeira/.test(document.querySelector('.layer:last-of-type').textContent) && /sugestão de tema/.test(document.querySelector('.layer:last-of-type').textContent)), 'Temas com IA: proposta marcada como sugestão');
      await p.click(top + '[data-treinar="0"]');
      ok(await until(() => /restam|\d\d:\d\d/.test((document.querySelector('.layer:last-of-type [data-tv]') || {}).textContent || '') && /sugerida por IA/.test(document.querySelector('.layer:last-of-type').textContent)), 'Treinar agora: discursiva criada com a proposta e o cronômetro rodando');
      await p.fill(top + 'textarea[name="texto"]', 'A educação financeira é essencial. No Brasil, os bancos tem papel importante na orientação dos clientes e na inclusão.');
      ok(await S(() => { const b = document.querySelector('.layer:last-of-type [data-save]').getBoundingClientRect(); return b.right <= window.innerWidth && b.height >= 40; }), 'rodapé da discursiva cabe na tela do celular (Mais + Salvar)');
      await p.click(top + '[data-save]'); await wait(500);
      const d = await S(() => window.Prumo.store.all('est_discursivas').find((x) => x.gerado_ia));
      await S((id) => window.Prumo.est.discEdit(window.Prumo.store.get('est_discursivas', id)), d.id); await wait(300);
      await p.click(top + '[data-more]'); await menuClick('Revisar e corrigir');
      ok(await until(() => /a\) Nota por critério/.test(document.querySelector('.layer:last-of-type').textContent) && /e\) Plano/.test(document.querySelector('.layer:last-of-type').textContent), null, 15000), 'correção mostra a) a e)');
      ok(await S(() => /Sugestão de IA|sugestão, não é nota oficial/.test(document.querySelector('.layer:last-of-type').textContent) && /14(,0)? \/ 20(,0)?/.test(document.querySelector('.layer:last-of-type').textContent)), 'marcada como sugestão da IA, com a nota total');
      await p.check(top + '[data-rw="r1"]'); await p.click(top + '[data-apl]');
      ok(await until((id) => { const x = window.Prumo.store.get('est_discursivas', id); return x.versao === 2 && /bancos têm/.test(x.texto); }, d.id), 'trecho aceito vira a versão 2 do texto');
      await S((id) => window.Prumo.est.discEdit(window.Prumo.store.get('est_discursivas', id)), d.id); await wait(300);
      ok(await S(() => /Sugestão de IA/.test(document.querySelector('.layer:last-of-type').textContent) && document.querySelector('.layer:last-of-type [data-avia]')), 'na lista de avaliações: "Sugestão de IA" e "Ver correção"');
      await p.click(top + '[data-more]'); await menuClick('Texto de exemplo');
      ok(await until(() => /material de referência/.test(document.querySelector('.layer:last-of-type').textContent) && /Texto de exemplo bem estruturado/.test(document.querySelector('.layer:last-of-type').textContent), null, 15000), 'texto de exemplo marcado "Gerado por IA", como referência');
    } else {
      await p.click('[data-act="est.discTreinar"]'); await wait(300);
      await S(() => { const s = document.querySelector('.layer:last-of-type [data-o]'); s.value = 'minha'; });
      await p.click(top + '[data-go]');
      ok(await until(() => /Treino ·/.test(document.querySelector('.layer:last-of-type').textContent) && /\d\d:\d\d/.test(document.querySelector('.layer:last-of-type [data-tv]').textContent)), 'Treinar com uma das minhas propostas: cronômetro rodando');
      ok(await S(() => document.documentElement.scrollWidth <= window.innerWidth), 'desktop: sem rolagem horizontal');
    }
    await S(() => { window.Prumo.ui.closeAll && window.Prumo.ui.closeAll(); location.hash = '#/est/discursivas'; }); await wait(400);
    if (vp.n === 'mobile') {
      await p.setViewportSize({ width: 360, height: 780 }); await wait(300);
      ok(await S(() => document.documentElement.scrollWidth <= 360), 'Discursivas a 360 px sem rolagem horizontal');
      await S((id) => window.Prumo.est.resumoIA(window.Prumo.store.get('est_materiais', id)), mat.id); await wait(400);
      ok(await S(() => document.documentElement.scrollWidth <= 360 && [...document.querySelectorAll('.layer:last-of-type .res-modo')].every((b) => b.getBoundingClientRect().height >= 44)), 'Resumir com IA a 360 px: sem rolagem e botões com 44 px');
    }
    ok(!errs.length, vp.n + ': sem erros de JavaScript ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
