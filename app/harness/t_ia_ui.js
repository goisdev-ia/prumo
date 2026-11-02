// Estudos — interface da IA e das novidades de Questões: formulário de provedor (nome, URL, chave, modelos e cabeçalhos,
// Buscar modelos, Testar), escolha do modelo, tela do assistente (conversa, fontes, questões geradas → banco → treino),
// resposta por IA e comentário no treino, resposta anterior oculta, assertividade, exclusão em lote, filtro por
// concurso/área, simulado com tempo e gráficos do painel. Celular e desktop.
const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); const r = G.context.api(route, payload || {}, 'teste', token); if (!r.ok) throw new Error(route + ': ' + JSON.stringify(r.error)); return r.data; };

(async () => {
  G.context.setup(); G.resetMemo();
  const tok = G.devLogin();
  const conc = api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', cargo: 'Agente', banca: 'Cesgranrio', area: 'Bancária', principal: true } }, tok).row;
  const conc2 = api('db.save', { table: 'est_concursos', row: { nome: 'TRT 5', banca: 'FCC', area: 'Tribunais' } }, tok).row;
  api('est.editalApply', { concurso_id: conc.id, dry: false, itens: [{ disciplina: 'Conhecimentos Bancários', assunto: 'Garantias' }] }, tok);
  const disc = api('boot', {}, tok).tables.est_disciplinas[0];
  const mk = (i, c, extra) => api('est.questionSave', { tipo: 'multipla', enunciado: `Base ${i}: qual garantia?`, alternativas_json: 'ABCD'.split('').map((l) => ({ letra: l, texto: 'Opção ' + l })), gabarito: 'A', gabarito_status: 'definitivo', concurso_id: c.id, disciplina_id: disc.id, ...(extra || {}) }, tok).questao;
  const qs = [0, 1, 2, 3].map((i) => mk(i, conc)).concat([4, 5].map((i) => mk(i, conc2)));
  // histórico: 3 certas e 1 errada no BB; a questão 0 foi respondida B (errada) e depois A (certa) → vale a última
  api('est.answer', { questao_id: qs[0].id, resposta: 'B', op_key: 'h0a' }, tok);
  api('est.answer', { questao_id: qs[0].id, resposta: 'A', op_key: 'h0b' }, tok);
  api('est.answer', { questao_id: qs[1].id, resposta: 'C', op_key: 'h1' }, tok);
  api('est.answer', { questao_id: qs[2].id, resposta: 'A', op_key: 'h2' }, tok);
  api('est.sessionManual', { tipo: 'teoria', disciplina_id: disc.id, inicio: new Date(Date.now() - 3 * 3600e3).toISOString(), minutos: 120, op_key: 'man1' }, tok);

  // IA simulada: /models, /chat/completions (chat, questões, resposta)
  G.setAi((url, body) => {
    if (/\/models$/.test(url)) return { code: 200, body: { data: [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3.6-27b' }, { id: 'llama-3.1-8b-instant' }] } };
    const u = body.messages[body.messages.length - 1].content;
    let txt = '**Aval** é garantia cambial; fiança é contratual.';
    if (/Responda apenas: OK/.test(u)) txt = 'OK';
    else if (/Crie \d+ questões/.test(u)) txt = '[{"tipo":"multipla","enunciado":"Gerada A: o aval é garantia","alternativas":[{"letra":"A","texto":"cambial"},{"letra":"B","texto":"real"}],"gabarito":"A","explicacao":"Título de crédito."},{"tipo":"multipla","enunciado":"Gerada B: a fiança é","alternativas":[{"letra":"A","texto":"cambial"},{"letra":"B","texto":"contratual"}],"gabarito":"B","explicacao":"Contrato acessório."}]';
    else if (/Resolva a questão/.test(u)) txt = '{"resposta":"A","explicacao":"A alternativa A está correta porque o aval é cambial.","confianca":"alta"}';
    return { code: 200, body: { choices: [{ message: { content: txt } }] } };
  });

  const srv = await start(8774);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, n: 'mobile' }, { width: 1440, height: 900, n: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.n === 'mobile' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const S = (fn, arg) => p.evaluate(fn, arg);
    const wait = (ms) => p.waitForTimeout(ms);
    const until = async (fn, arg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn, arg).catch(() => false)) return true; await wait(150); } return false; };
    const top = '.layer:last-of-type ';
    const shot = async (n) => { if (process.env.SHOTS) await p.screenshot({ path: `shots/ia_${vp.n}_${n}.png`, fullPage: false }); };
    await p.goto('http://localhost:8774/'); await p.waitForSelector('.page');
    await S(() => { location.hash = '#/est/prefs'; });
    ok(await until(() => window.Prumo.est.loaded && /Preferências/.test(document.querySelector('.page h1').textContent)), vp.n + ': preferências de Estudos abrem');

    // ---- provedores ----
    if (vp.n === 'mobile') {
      await p.click('[data-act="est.iaProv"]'); await wait(500);
      ok(await S(() => document.querySelectorAll('[data-preset]').length === 7), 'lista de provedores mostra 7 modelos prontos (Gemini, Groq, OpenRouter, Cerebras, Mistral, Pollinations, Anthropic)');
      await p.click('[data-preset="groq"]'); await wait(500);
      const form = await S(() => { const L = [...document.querySelectorAll('.layer')].pop(); const t = L.textContent; return { nome: L.querySelector('[name="nome"]').value, base: L.querySelector('[name="base"]').value, rows: L.querySelectorAll('[data-mrow]').length, labels: ['Nome de exibição', 'URL base', 'Chave da API', 'Modelos', 'Cabeçalhos (opcional)', 'Adicionar modelo', 'Adicionar cabeçalho', 'Buscar modelos', 'Testar', 'Salvar'].every((x) => t.includes(x)), hint: /Opcional\. Deixe vazio se a autenticação for pelos cabeçalhos/.test(t), pass: L.querySelector('[name="chave"]').type, link: !!L.querySelector('a[href^="https://console.groq.com"]') }; });
      ok(form.nome === 'Groq' && form.base === 'https://api.groq.com/openai/v1' && form.rows === 3 && form.labels && form.hint && form.pass === 'password' && form.link, 'formulário do provedor: nome, URL, chave (senha, opcional), modelos, cabeçalhos, buscar e testar; preset preenchido');
      // remove um modelo, adiciona cabeçalho
      await p.click(top + '[data-mrow]:nth-child(3) [data-rm]'); await wait(150);
      await p.click(top + '[data-hadd]'); await wait(150);
      await p.fill(top + '[data-hrow] [data-hn]', 'X-Title'); await p.fill(top + '[data-hrow] [data-hv]', 'Prumo');
      await p.fill(top + '[name="chave"]', 'gsk_teste_chave_7788');
      ok(await S(() => [...document.querySelectorAll('.layer')].pop().querySelectorAll('[data-mrow]').length === 2), 'lixeira remove a linha do modelo');
      await p.click(top + '[data-mfetch]'); await wait(900);
      ok(await S(() => [...document.querySelectorAll('.layer')].pop().querySelectorAll('[data-mopts] input').length === 3), '"Buscar modelos" lista os modelos do provedor antes de salvar');
      await p.check(top + '[data-mopts] input[value="qwen/qwen3.6-27b"]'); await p.click(top + '[data-maddsel]'); await wait(200);
      ok(await S(() => [...[...document.querySelectorAll('.layer')].pop().querySelectorAll('[data-mid]')].map((i) => i.value).includes('qwen/qwen3.6-27b')), 'modelo marcado entra nas linhas');
      await p.click(top + '[data-test]'); await wait(900); await shot('form');
      ok(await S(() => /Funcionou/.test([...document.querySelectorAll('.layer')].pop().querySelector('[data-res]').textContent)), '"Testar" confirma que o provedor respondeu');
      const tc = G.aiCalls[G.aiCalls.length - 1];
      ok(tc.headers.Authorization === 'Bearer gsk_teste_chave_7788' && tc.headers['X-Title'] === 'Prumo', 'teste usa a chave e o cabeçalho digitados');
      await p.click(top + '[data-save]'); await wait(900);
      const ia = await S(() => window.Prumo.est.ia);
      ok(ia.configurado && ia.provedores.length === 1 && ia.provedores[0].modelos.length === 3 && ia.provedores[0].chave_mask === '••••7788', 'provedor salvo com 3 modelos; navegador só vê a chave mascarada');
      ok(!(await S(() => document.documentElement.innerHTML.includes('gsk_teste_chave_7788'))) && G.props.get('AI_KEY:' + ia.provedores[0].id) === 'gsk_teste_chave_7788', 'chave fora da página e guardada nas propriedades do script');
      // editar sem redigitar a chave mantém
      await p.click(top + `[data-edit="${ia.provedores[0].id}"]`); await wait(400);
      ok(await S(() => [...document.querySelectorAll('.layer')].pop().querySelector('[name="chave"]').value === '••••7788'), 'editar mostra a chave mascarada');
      await p.click(top + '[data-save]'); await wait(800);
      ok(G.props.get('AI_KEY:' + ia.provedores[0].id) === 'gsk_teste_chave_7788', 'salvar com a chave mascarada não apaga a chave');
      await S(() => window.Prumo.ui.closeAll());
    }

    // ---- assistente ----
    await S(() => { location.hash = '#/est/ia'; }); await wait(600);
    const opts = await S(() => [...document.querySelectorAll('[data-on-change="est.iaPick"] option')].map((o) => o.value));
    ok(opts.length === 3, vp.n + ': tela do assistente com escolha de modelo (3 opções)');
    const want = opts.find((v) => v.endsWith('|llama-3.3-70b-versatile'));
    await p.selectOption('[data-on-change="est.iaPick"]', want); await wait(200);
    await p.click('[data-act="est.iaSrcAdd"]'); await wait(300);
    await p.click(top + 'button.li:has-text("Meus dados")'); await wait(400);
    await p.click(top + '[data-ok]'); await wait(400);
    ok(await S(() => /Últimos 30 dias/.test(document.querySelector('.page').textContent)), 'fonte "Meus dados" adicionada');
    await p.fill('[data-ia-in]', 'O que é aval?'); await p.click('[data-act="est.iaSend"]');
    ok(await until(() => document.querySelectorAll('.ai-msg.bot .note-preview').length === 1 && !document.querySelector('.ai-msg.bot .skel')), 'conversa: a resposta da IA aparece');
    await shot('chat');
    let last = G.aiCalls[G.aiCalls.length - 1];
    ok(last.body.model === 'llama-3.3-70b-versatile' && /<fonte tipo="dados"/.test(last.body.messages[0].content), 'usa o modelo escolhido e manda os dados de estudo da planilha');
    ok(await S(() => { const m = document.querySelector('.ai-msg.bot'); return /Gerado por IA/.test(m.textContent) && m.querySelector('b') && /Salvar como anotação/.test(m.textContent) && /Enviar ao Telegram/.test(m.textContent); }), 'resposta marcada como IA, com Markdown e ações (anotação, Telegram, copiar)');
    // gerar questões → incluir → treinar
    await p.click('[data-act="est.iaModo"][data-v="questoes"]'); await wait(300);
    await p.fill('input[data-k="tema"]', 'garantias'); await p.selectOption('select[data-k="conc"]', conc.id);
    await p.fill('input[data-k="area"]', 'Bancária'); await p.dispatchEvent('input[data-k="area"]', 'change');
    await p.click('[data-act="est.iaGen"][data-t="questoes"]');
    ok(await until(() => document.querySelectorAll('[data-qd]').length === 2), 'questões geradas aparecem como rascunho editável');
    await shot('qgen');
    await p.fill('[data-qd="1"] [data-en]', 'Gerada B editada: a fiança é');
    await p.click('[data-act="est.iaQAdd"]');
    ok(await until(() => /incluída\(s\) no banco/.test(document.querySelector('.page').textContent)), 'incluídas no banco');
    const ger = await S(() => window.Prumo.store.all('est_questoes').filter((q) => q.gerada_ia));
    ok(ger.length === (vp.n === 'mobile' ? 2 : 4) && ger.some((q) => q.enunciado === 'Gerada B editada: a fiança é') && ger.every((q) => q.revisar && q.gabarito_status === 'preliminar' && q.concurso_id === conc.id && q.area === 'Bancária'), 'no banco: geradas por IA, a revisar, preliminar, concurso e área (com a edição)');
    await p.click('[data-act="est.iaTrain"]'); await wait(500);
    ok(await S(() => /gerada por IA · a revisar/.test([...document.querySelectorAll('.layer')].pop().textContent)), 'treino abre com o aviso "gerada por IA · a revisar"');
    await p.click(top + '[data-alt="A"]'); await p.click(top + '[data-resp]'); await wait(700);
    await p.click(top + '[data-ia2]');
    ok(await until(() => /Resposta da IA: A/.test([...document.querySelectorAll('.layer')].pop().textContent)), 'resposta por IA aparece com explicação');
    await shot('runner_ia');
    ok(await S(() => /igual ao gabarito/.test([...document.querySelectorAll('.layer')].pop().textContent)), 'compara com o gabarito cadastrado');
    await p.click(top + '[data-iacom]'); await wait(700);
    const qid = await S(() => { const t = [...document.querySelectorAll('.layer')].pop().textContent.match(/Q\d+/); return window.Prumo.store.all('est_questoes').find((q) => q.codigo === t[0]).id; });
    let qq = await S((id) => window.Prumo.store.get('est_questoes', id), qid);
    ok(/Resposta da IA/.test(qq.comentario) && qq.comentario_ia, '"Usar como comentário" salva o texto da IA no comentário');
    await p.click(top + '[data-cedit]'); await wait(200); await p.fill(top + '[data-ctxt]', 'Meu comentário: aval = cambial.'); await p.click(top + '[data-csave]'); await wait(700);
    qq = await S((id) => window.Prumo.store.get('est_questoes', id), qid);
    ok(qq.comentario === 'Meu comentário: aval = cambial.', 'comentário editado e salvo');
    await p.click(top + '[data-again]'); await wait(300);
    ok(await S(() => !!document.querySelector('.layer:last-of-type [data-prevans]') && !/Você respondeu/.test([...document.querySelectorAll('.layer')].pop().textContent)), '"Responder de novo": a resposta anterior fica oculta');
    await p.click(top + '[data-prevans]'); await wait(200);
    ok(await S(() => /Você respondeu A/.test([...document.querySelectorAll('.layer')].pop().textContent)), '"Exibir resposta anterior" mostra a última resposta');
    await p.click(top + '[data-alt="B"]'); await p.click(top + '[data-resp]'); await wait(700);
    const tl = await S((id) => window.Prumo.store.where('est_tentativas', (t) => t.questao_id === id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0], qid);
    ok(tl.resposta === 'B', 'nova resposta registrada (passa a valer a última)');
    await S(() => window.Prumo.ui.closeAll());

    // ---- banco: assertividade, filtros, seleção e exclusão ----
    await S(() => { location.hash = '#/est/questoes'; }); await wait(500);
    await S((cid) => { window.Prumo.flt.set('est.q', 'conc', cid); window.Prumo.router.render(true); }, conc.id); await wait(300);
    const acc = await S(() => [...document.querySelectorAll('[data-acc] .metric')].map((m) => m.textContent.replace(/\s+/g, ' ')));
    await shot('banco');
    ok(acc.length === 4 && /Assertividade/.test(acc[0]) && /Acertos/.test(acc[1]) && /Erros/.test(acc[2]), vp.n + ': cards de assertividade, acertos, erros e não respondidas');
    ok(await S(() => !/Base 4/.test(document.querySelector('.page .cardlist').textContent)), 'filtro por concurso esconde questões de outro concurso');
    await S(() => { window.Prumo.flt.set('est.q', 'conc', ''); window.Prumo.flt.set('est.q', 'area', 'Tribunais'); window.Prumo.router.render(true); }); await wait(300);
    ok(await S(() => document.querySelectorAll('.page .cardlist .li').length === 2), 'filtro por tipo de concurso (área Tribunais) mostra as 2 do TRT');
    await S(() => { window.Prumo.flt.set('est.q', 'area', ''); window.Prumo.flt.set('est.q', 'orig', 'ia'); window.Prumo.router.render(true); }); await wait(300);
    const nIa = await S(() => document.querySelectorAll('.page .cardlist .li').length);
    await p.click('[data-act="est.qSelAll"]'); await wait(300);
    ok(await S((n) => new RegExp(n + ' selecionada').test(document.querySelector('.page').textContent), nIa), 'selecionar todas do filtro');
    await p.click('[data-act="est.qDelSel"]'); await wait(300); await p.click('.dialog [data-yes]');
    ok(await until(() => !window.Prumo.store.all('est_questoes').some((q) => q.gerada_ia)), 'exclusão em lote apaga as selecionadas');
    await p.click('.toast button');
    ok(await until((n) => window.Prumo.store.all('est_questoes').filter((q) => q.gerada_ia).length === n, nIa), 'desfazer restaura as questões excluídas');
    await S(() => { window.Prumo.flt.set('est.q', 'orig', ''); window.Prumo.router.render(true); }); await wait(300);

    // ---- simulado com tempo ----
    await p.click('[data-act="est.simQuick"]'); await wait(400);
    await p.fill(top + '[data-k="qtd"]', '3'); await p.fill(top + '[data-k="min"]', '10');
    await p.selectOption(top + 'select[data-k="area"]', 'Bancária'); await wait(300);
    ok(await S(() => /questão\(ões\) com gabarito disponíveis/.test([...document.querySelectorAll('.layer')].pop().textContent)), 'simulado com tempo: mostra quantas questões existem no filtro');
    await p.click(top + '[data-go]');
    ok(await until(() => { const L = [...document.querySelectorAll('.layer')].pop(); return L && L.querySelectorAll('.sg').length === 3 && /restam 0:\d\d/.test(L.textContent); }), 'simulado começa com 3 questões e cronômetro regressivo de 10 min');
    const simId = await S(() => window.Prumo.store.all('est_simulados').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]);
    ok(simId.duracao_min === 10 && simId.composicao_json.blocos[0].area === 'Bancária', 'simulado gravado com tempo e área');
    await S(() => window.Prumo.ui.closeAll()); await wait(300);

    // ---- painel com gráficos ----
    await S(() => { location.hash = '#/est'; }); await wait(1200);
    await shot('painel'); await p.evaluate(() => { const el = document.querySelector('[data-ch="qsem"]'); if (el) el.scrollIntoView(); }); await wait(500); await shot('painel2');
    const ch = await S(() => ['assert', 'qsem', 'horas', 'disc'].map((k) => { const el = document.querySelector(`[data-ch="${k}"]`); return el ? (el.querySelector('canvas') ? 'canvas' : el.textContent.trim().slice(0, 40)) : 'ausente'; }));
    ok(ch.every((x) => x === 'canvas'), 'painel: gráficos de assertividade, certas × erradas, horas × meta e precisão por disciplina (' + ch.join(', ') + ')');
    await p.click('[data-act="est.metaHoras"]'); await wait(300); await p.fill(top + '[data-m]', '15'); await p.click(top + '[data-ok]'); await wait(800);
    ok(await S(() => /Meta: 15 h\/semana/.test(document.querySelector('.page').textContent)), 'meta semanal de horas definida pelo painel');
    const over = await S(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!over, vp.n + ': sem rolagem horizontal no painel');
    ok(!errs.length, vp.n + ': sem erros de JavaScript' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(1); });
