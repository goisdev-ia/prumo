const { chromium } = require('playwright');
const { start, G } = require('./server');
const assert = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('ok -', m); };
(async () => {
  G.context.setup(); G.resetMemo(); G.context.seedDemo(); G.resetMemo();
  const srv = await start();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.page');
  const go = async (h) => { await page.evaluate((x) => { location.hash = '#/' + x; }, h); await page.waitForTimeout(400); };
  const count = (table) => page.evaluate((t) => Prumo.store.all(t).length, table);

  // 1. Novo lançamento pelo "+"
  await go('fin/lancamentos');
  const before = await count('fin_lancamentos');
  await page.click('.fab'); await page.waitForSelector('.sheet [data-amount]');
  await page.fill('.sheet [data-amount]', '');
  await page.type('.sheet [data-amount]', '4590');
  assert(await page.inputValue('.sheet [data-amount]') === '45,90', 'máscara de dinheiro 45,90');
  await page.fill('.sheet [data-k="descricao"]', 'Farmácia do bairro');
  await page.click('.sheet [data-save]');
  await page.waitForTimeout(900);
  assert(await count('fin_lancamentos') === before + 1, 'lançamento criado');
  assert(await page.isVisible('text=Farmácia do bairro'), 'lançamento aparece na lista');
  // validação
  await page.click('.fab'); await page.waitForSelector('.sheet [data-amount]');
  await page.fill('.sheet [data-amount]', ''); await page.fill('.sheet [data-k="descricao"]', '');
  await page.click('.sheet [data-save]'); await page.waitForTimeout(300);
  assert(await page.isVisible('.toast.err'), 'erro quando valor vazio');
  // voltar fecha o sheet
  await page.goBack(); await page.waitForTimeout(400);
  assert(!(await page.$('.layer.open')), 'botão voltar fecha o sheet');
  // sem history.pushState (iframe do Apps Script): voltar fecha o painel e volta para a tela anterior
  await page.evaluate(() => { location.hash = '#/fin/lancamentos'; }); await page.waitForTimeout(400);

  // 2. Parcelado no cartão
  await page.click('.fab'); await page.waitForSelector('.sheet [data-amount]');
  await page.type('.sheet [data-amount]', '120000');
  await page.fill('.sheet [data-k="descricao"]', 'Geladeira');
  const card = await page.evaluate(() => Prumo.store.all('fin_cartoes')[0].id);
  await page.selectOption('.sheet [data-k="pagar_com"]', 'k:' + card);
  await page.fill('.sheet [data-k="parcelas"]', '6');
  await page.click('.sheet [data-save]'); await page.waitForTimeout(1000);
  const parc = await page.evaluate(() => Prumo.store.all('fin_lancamentos').filter((l) => l.descricao === 'Geladeira').length);
  assert(parc === 6, '6 parcelas criadas no cartão');

  // 3. Tarefa rápida com linguagem natural
  await go('tar');
  await page.fill('[data-quick-in]', 'pagar luz amanhã 18h #casa p1');
  await page.waitForTimeout(150);
  assert(await page.isVisible('.quick-prev >> text=Amanhã'), 'prévia entende "amanhã"');
  await page.press('[data-quick-in]', 'Enter'); await page.waitForTimeout(700);
  const t = await page.evaluate(() => Prumo.store.all('tar_tarefas').find((x) => x.titulo === 'Pagar luz'));
  assert(t && t.hora === '18:00' && t.prioridade === 1 && t.projeto_id, 'tarefa com hora, prioridade e projeto');
  // concluir tarefa
  await page.click(`.check[data-id="${(await page.evaluate(() => Prumo.tar.today()[0].id))}"]`); await page.waitForTimeout(600);
  assert(await page.isVisible('text=Concluídas hoje'), 'concluir tarefa move para concluídas');

  // 4. Treino no modo foco
  await go('fit');
  await page.click('button:has-text("Iniciar") >> nth=0'); await page.waitForSelector('.focus-mode');
  await page.click('.focus-mode .set:not(.head) .check >> nth=0'); await page.waitForTimeout(300);
  assert(await page.isVisible('.rest-bar'), 'descanso automático após concluir série');
  await page.click('[data-f="skipRest"]');
  await page.click('.focus-mode .set:not(.head) .check >> nth=1');
  await page.click('[data-f="finish"]'); await page.waitForSelector('.sheet [data-save]');
  const sBefore = await count('fit_sessoes');
  await page.click('.sheet [data-save]'); await page.waitForTimeout(1200);
  assert(!(await page.$('.focus-mode')), 'modo foco fechado após salvar');
  assert(await count('fit_sessoes') === sBefore + 1, 'sessão de treino salva');

  // 5. Alimentação: buscar e adicionar
  await go('nut');
  const dBefore = await count('nut_diario');
  await page.click('[data-act="nut.add"][data-v="almoco"]'); await page.waitForSelector('.sheet [data-q]');
  await page.fill('.sheet [data-q]', 'arroz bra'); await page.waitForTimeout(300);
  await page.click('.sheet [data-pick] >> nth=0'); await page.waitForSelector('.sheet [data-g]');
  await page.fill('.sheet [data-g]', '150'); await page.waitForTimeout(100);
  assert((await page.textContent('.sheet [data-prev]')).includes('192'), 'prévia nutricional 150 g arroz = 192 kcal');
  await page.click('.sheet [data-ok]'); await page.waitForTimeout(700);
  assert(await count('nut_diario') === dBefore + 1, 'alimento adicionado ao diário');
  const w0 = await page.evaluate(() => Prumo.nut.water(Prumo.d.today()));
  await page.click('button:has-text("250 ml")'); await page.waitForTimeout(600);
  assert(await page.evaluate(() => Prumo.nut.water(Prumo.d.today())) === w0 + 250, 'água +250 ml');

  // 6. Rotina: marcar feita
  await go('rot');
  const rid = await page.evaluate(() => { const r = Prumo.rot.forDate(Prumo.d.today()).find((x) => !Prumo.rot.exec(x.id, Prumo.d.today())); return r && r.id; });
  if (rid) { await page.click(`[data-act="rot.check"][data-id="${rid}"]`); await page.waitForTimeout(600); assert(await page.evaluate((id) => (Prumo.rot.exec(id, Prumo.d.today()) || {}).status === 'feito', rid), 'rotina marcada como feita'); }

  // 7. Meta automática com reserva
  await go('met');
  await page.click('.fab'); await page.waitForSelector('.sheet [data-k="titulo"]');
  await page.fill('.sheet [data-k="titulo"]', 'Fundo para curso de inglês');
  await page.click('.sheet [data-seg="medicao"] button[data-v="automatica"]'); await page.waitForTimeout(250);
  await page.selectOption('.sheet [data-k="origem_metrica"]', 'fin_reserva'); await page.waitForTimeout(250);
  await page.fill('.sheet [data-k="valor_alvo"]', '3000');
  await page.click('.sheet [data-save]'); await page.waitForTimeout(1500);
  const meta = await page.evaluate(() => Prumo.store.all('met_metas').find((m) => m.titulo === 'Fundo para curso de inglês'));
  const res = await page.evaluate((id) => Prumo.store.all('fin_reservas').find((r) => r.meta_id === id), meta && meta.id);
  assert(meta && res && meta.origem_id === res.id, 'meta financeira criou e vinculou reserva');
  assert((await page.evaluate(() => location.hash)).startsWith('#/met/meta/'), 'abre o detalhe da meta');

  // 8. Busca global
  await page.click('.topbar [data-act="ui.palette"]'); await page.waitForSelector('.palette input');
  await page.type('.palette input', 'supino'); await page.waitForTimeout(300);
  assert(await page.isVisible('.palette >> text=Supino reto com barra'), 'busca encontra exercício');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // 9. Tema claro
  await go('cfg/aparencia');
  await page.click('[data-act="cfg.theme"][data-v="light"]'); await page.waitForTimeout(400);
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'tema claro aplicado');
  for (const r of ['', 'fin', 'fit/evolucao', 'nut', 'met/roda', 'rot/habitos']) { await go(r); await page.waitForTimeout(500); await page.screenshot({ path: `shots/l_${(r || 'home').replace(/\//g, '_')}.png` }); }
  await go('cfg/aparencia'); await page.click('[data-act="cfg.theme"][data-v="dark"]');

  // 10. Edição otimista com rollback quando o servidor recusa
  await page.evaluate(() => { window.__latency = 300; });
  const ok = await page.evaluate(async () => { try { await Prumo.store.save('tar_tarefas', { titulo: '' }, { silentError: true }); return false; } catch (e) { return e.code === 'VALIDATION'; } });
  assert(ok, 'servidor rejeita e cliente desfaz (rollback)');
  const logs = await page.evaluate(() => Prumo.api.call('logs.list', { nivel: 'audit', limit: 5 }));
  assert(logs.total > 5, 'auditoria registrada: ' + logs.total);
  console.log(errors.length ? 'ERROS JS:\n' + errors.join('\n') : 'sem erros de JS');
  await browser.close(); srv.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
