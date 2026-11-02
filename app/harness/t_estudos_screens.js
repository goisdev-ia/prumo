// Estudos — todas as telas com dados (celular 360 px e computador): carrega, sem erro de JS, sem rolagem horizontal,
// título certo e nada preso em "carregando". Também confere Início, busca global e Metas com fontes de Estudos.
const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };
(async () => {
  G.context.setup(); G.resetMemo(); G.context.seedDemo(); G.resetMemo();
  const tok = G.devLogin();
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Tribunal Regional do Trabalho da 5ª Região — Analista Judiciário, Área Administrativa', orgao: 'TRT5', banca: 'FCC', principal: true, data_prova: '2027-03-14', data_prova_status: 'estimada' } }, tok).row;
  const hoje = G.context.Utils.today();
  api('db.save', { table: 'est_etapas', row: { concurso_id: conc.id, tipo: 'inscricao', titulo: 'Fim das inscrições', data: hoje, status: 'pendente' } }, tok);
  api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [
    { disciplina: 'Língua Portuguesa', assunto: 'Crase', item_ref: '1.1', peso: 2 }, { disciplina: 'Língua Portuguesa', assunto: 'Concordância', subassunto: 'Concordância verbal', item_ref: '1.2' },
    { disciplina: 'Direito Constitucional', assunto: 'Direitos e garantias fundamentais e remédios constitucionais (habeas corpus, mandado de segurança, mandado de injunção, habeas data)', item_ref: '2.1', peso: 3 }] }, tok);
  const b0 = api('est.boot', {}, tok), crase = b0.tables.est_assuntos.find((a) => a.titulo === 'Crase');
  for (let i = 0; i < 12; i++) { const q = api('est.questionSave', { tipo: 'multipla', enunciado: 'Questão de crase número ' + i + ' com enunciado razoavelmente longo para testar a quebra de linha no celular sem estourar a largura.', alternativas_json: 'ABCDE'.split('').map((l) => ({ letra: l, texto: 'Alternativa ' + l })), gabarito: 'A', gabarito_status: 'definitivo', banca: 'FCC', ano: 2024, disciplina_id: crase.disciplina_id, assunto_id: crase.id }, tok).questao; api('est.answer', { questao_id: q.id, resposta: i % 3 ? 'A' : 'B', op_key: 'k' + i }, tok); }
  const s = api('est.sessionManual', { inicio: hoje + 'T08:00:00', fim: hoje + 'T09:30:00', disciplina_id: crase.disciplina_id, assunto_id: crase.id, tipo: 'teoria' }, tok);
  api('est.reviewSchedule', { alvo_tipo: 'assunto', alvo_id: crase.id, vencimento: hoje, titulo: 'Revisar crase' }, tok);
  api('db.save', { table: 'est_flashcards', row: { baralho: 'Português', frente: 'Crase antes de palavra masculina?', verso: 'Em regra, não.', vencimento: hoje } }, tok);
  api('est.noteSave', { titulo: 'Resumo de crase', tipo: 'resumo', conteudo: '# Crase\n\n**Regra geral:** a + a.\n\n> Exceções', disciplina_id: crase.disciplina_id, assunto_id: crase.id }, tok);
  api('db.save', { table: 'est_erros', row: { titulo: 'Errei crase antes de "à medida que"', causa: 'conteudo', status: 'aberta' } }, tok);
  api('est.discSave', { titulo: 'Discursiva sobre controle da administração', proposta: 'Discorra sobre...', texto: 'Texto', status: 'escrita' }, tok);
  api('db.save', { table: 'met_metas', row: { titulo: 'Horas de estudo', medicao: 'automatica', origem_metrica: 'est_horas', valor_alvo: 100, unidade: 'h', data_inicio: '2020-01-01', status: 'ativa' } }, tok);
  const srv = await start(8772); const b = await chromium.launch();
  const routes = ['est', 'est/concursos', 'est/concurso/' + conc.id, 'est/edital', 'est/plano', 'est/biblioteca', 'est/sala', 'est/questoes', 'est/simulados', 'est/revisoes', 'est/flashcards', 'est/erros', 'est/resumos', 'est/discursivas', 'est/desempenho', 'est/historico', 'est/prefs'];
  for (const vp of [{ width: 360, height: 760, n: '360px' }, { width: 1440, height: 900, n: 'desktop' }]) {
    const p = await b.newPage({ viewport: vp }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8772/'); await p.waitForSelector('.page');
    await p.evaluate(() => window.Prumo.est.ensure()); await p.waitForTimeout(800);
    const bad = [], stuck = [];
    for (const r of routes) {
      await p.evaluate((h) => { location.hash = '#/' + h; }, r); await p.waitForTimeout(600);
      const st = await p.evaluate(() => ({ h1: (document.querySelector('.page h1') || {}).textContent || '', skel: !!document.querySelector('.view .skel:only-child'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      if (vp.n === '360px' && ['est', 'est/edital', 'est/sala'].includes(r)) await p.screenshot({ path: __dirname + '/shots/est_' + r.replace('/', '_') + '.png', fullPage: false });
      if (st.over > 1) bad.push(r + ' (+' + st.over + 'px)');
      if (!st.h1 || st.skel) stuck.push(r);
    }
    ok(!bad.length, vp.n + ': 17 telas de Estudos sem rolagem horizontal' + (bad.length ? ' → ' + bad.join(', ') : ''));
    ok(!stuck.length, vp.n + ': todas abrem com título (nenhuma presa em carregando)' + (stuck.length ? ' → ' + stuck.join(', ') : ''));
    await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(700);
    const home = await p.textContent('.view');
    ok(/revisão\(ões\) de estudo/.test(home) && /Fim das inscrições/.test(home), vp.n + ': Início mostra as revisões de estudo e a etapa do concurso de hoje');
    const busca = await p.evaluate(() => window.Prumo.search.query('crase').map((x) => x.kind));
    ok(['Assunto', 'Anotação', 'Questão'].every((k) => busca.includes(k)), vp.n + ': busca global encontra assunto, anotação e questão (' + [...new Set(busca)].join(', ') + ')');
    ok((await p.evaluate(() => window.Prumo.search.query('estudo').some((x) => x.title === 'Iniciar sessão de estudo'))), vp.n + ': busca oferece "Iniciar sessão de estudo"');
    const gv = await p.evaluate(() => { const m = window.Prumo.store.all('met_metas').find((x) => x.origem_metrica === 'est_horas'); return window.Prumo.goalValue(m); });
    ok(gv === 1.5, vp.n + ': meta automática "horas de estudo" mede 1,5 h pelas sessões (' + gv + ')');
    ok(!errs.length, vp.n + ': sem erros de JavaScript' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
    await p.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
