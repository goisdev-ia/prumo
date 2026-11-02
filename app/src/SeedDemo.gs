/**
 * Dados de demonstração (opcionais). Todo id começa com "demo-", então clearDemoData() remove exatamente o que foi criado aqui.
 */
function seedDemo() { return SeedDemo.run(); }
function clearDemoData() { return SeedDemo.clear(); }

var SeedDemo = (function () {
  var seed_ = 20260612;
  function rnd() { seed_ |= 0; seed_ = seed_ + 0x6D2B79F5 | 0; var t = Math.imul(seed_ ^ seed_ >>> 15, 1 | seed_); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function between(a, b) { return a + rnd() * (b - a); }
  function money(a, b) { return Math.round(between(a, b) * 100) / 100; }
  function int(a, b) { return Math.floor(between(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function id() { return 'demo-' + Utilities.getUuid(); }

  function hasDemo_() { return Db.table('fin_lancamentos').list().some(function (r) { return String(r.id).indexOf('demo-') === 0; }); }

  function run() {
    if (hasDemo_()) return ['Os dados de demonstração já existem.'];
    seed_ = 20260612;
    Seed.reference();
    var out = [];
    var today = Utils.today();
    var T = function (n) { return Db.table(n); };

    var cats = {};
    T('fin_categorias').list().forEach(function (c) { cats[c.nome] = c.id; });
    var ex = {};
    T('fit_exercicios').list().forEach(function (e) { ex[e.nome] = e; });
    var food = {};
    T('nut_alimentos').list().forEach(function (f) { food[f.nome] = f; });

    // ---------- FINANÇAS ----------
    var nubank = { id: id(), nome: 'Nubank', tipo: 'corrente', instituicao: 'Nubank', saldo_inicial: 2340.18, cor: '#F2B705', icone: 'landmark', ordem: 1 };
    var poup = { id: id(), nome: 'Poupança', tipo: 'poupanca', instituicao: 'Caixa', saldo_inicial: 5200, cor: '#5F9E8F', icone: 'piggy', ordem: 2 };
    T('fin_contas').insertMany([nubank, poup], { silent: true });
    var carteira = T('fin_contas').list({ where: { nome: 'Carteira' } })[0];
    var cartao = { id: id(), nome: 'Cartão Roxo', bandeira: 'mastercard', final: '4821', limite: 6500, dia_fechamento: 3, dia_vencimento: 10, conta_pagamento_id: nubank.id, cor: '#B98900' };
    T('fin_cartoes').insert(cartao, { silent: true });

    var tx = [];
    function add(o) {
      o.id = id(); o.origem = 'demo'; o.competencia = Utils.monthKey(o.data);
      if (!o.status) o.status = o.data <= today ? 'pago' : 'pendente';
      tx.push(o);
    }
    function card(desc, valor, data, cat, estab, extra) {
      var o = Object.assign({ tipo: 'despesa', descricao: desc, valor: valor, data: data, categoria_id: cats[cat], cartao_id: cartao.id, forma_pagamento: 'credito', estabelecimento: estab || desc, status: 'pago' }, extra || {});
      add(o);
    }
    var m0 = Utils.monthKey(today);
    for (var k = -3; k <= 0; k++) {
      var mk = Utils.shiftMonthKey(m0, k), dim = Utils.daysInMonth(mk);
      var day = function (d) { return mk + '-' + ('0' + Math.min(d, dim)).slice(-2); };
      var lastDay = k === 0 ? Number(today.slice(8, 10)) : dim;
      add({ tipo: 'receita', descricao: 'Salário', valor: 6850, data: day(5), categoria_id: cats['Salário'], conta_id: nubank.id, forma_pagamento: 'transferencia' });
      if (k !== -2) add({ tipo: 'receita', descricao: 'Projeto freelance', valor: money(1200, 2400), data: day(22), categoria_id: cats['Freelas'], conta_id: nubank.id, forma_pagamento: 'pix', estabelecimento: 'Studio Aurora' });
      add({ tipo: 'despesa', descricao: 'Aluguel', valor: 1650, data: day(10), categoria_id: cats['Aluguel'], conta_id: nubank.id, forma_pagamento: 'pix' });
      add({ tipo: 'despesa', descricao: 'Condomínio', valor: 487.32, data: day(10), categoria_id: cats['Condomínio'], conta_id: nubank.id, forma_pagamento: 'boleto' });
      add({ tipo: 'despesa', descricao: 'Conta de luz', valor: money(158, 236), data: day(15), categoria_id: cats['Energia'], conta_id: nubank.id, forma_pagamento: 'boleto', estabelecimento: 'Companhia de Energia' });
      add({ tipo: 'despesa', descricao: 'Água e esgoto', valor: money(74, 112), data: day(18), categoria_id: cats['Água'], conta_id: nubank.id, forma_pagamento: 'boleto' });
      add({ tipo: 'despesa', descricao: 'Internet fibra', valor: 109.9, data: day(20), categoria_id: cats['Internet'], conta_id: nubank.id, forma_pagamento: 'debito', estabelecimento: 'Fibra Net' });
      add({ tipo: 'despesa', descricao: 'Plano de saúde', valor: 289.9, data: day(8), categoria_id: cats['Plano de saúde'], conta_id: nubank.id, forma_pagamento: 'boleto' });
      add({ tipo: 'transferencia', descricao: 'Guardar na poupança', valor: 500, data: day(6), conta_id: nubank.id, conta_destino_id: poup.id, forma_pagamento: 'transferencia' });
      for (var d = 1; d <= lastDay; d++) {
        var dt = day(d);
        if (d === 2) card('Academia Corpo em Forma', 109.9, dt, 'Academia', 'Academia Corpo em Forma');
        if (d === 12) card('Streaming de filmes', 39.9, dt, 'Assinaturas', 'Streaming');
        if (d === 15) card('Streaming de música', 21.9, dt, 'Assinaturas', 'Música');
        var r = rnd();
        if (r < 0.16) card('Supermercado Bom Preço', money(180, 520), dt, 'Mercado', 'Supermercado Bom Preço');
        else if (r < 0.22) card('Hortifruti Vila Verde', money(38, 96), dt, 'Mercado', 'Hortifruti Vila Verde');
        if (rnd() < 0.3) add({ tipo: 'despesa', descricao: 'Padaria Estrela', valor: money(9.5, 38), data: dt, categoria_id: cats['Padaria e café'], conta_id: nubank.id, forma_pagamento: 'debito', estabelecimento: 'Padaria Estrela' });
        if (rnd() < 0.18) card(pick(['Restaurante Sabor da Terra', 'Pizzaria Bella Massa', 'Sushi Kaze', 'Hamburgueria do Porto']), money(42, 138), dt, pick(['Restaurante', 'Delivery']));
        if (rnd() < 0.09) card('Posto Avenida', money(180, 262), dt, 'Combustível', 'Posto Avenida');
        if (rnd() < 0.2) add({ tipo: 'despesa', descricao: 'Corrida de app', valor: money(13.9, 38.5), data: dt, categoria_id: cats['App de transporte'], conta_id: nubank.id, forma_pagamento: 'pix', estabelecimento: 'App de transporte' });
        if (rnd() < 0.05) card('Drogaria São Bento', money(24, 96), dt, 'Farmácia', 'Drogaria São Bento');
        if (rnd() < 0.05) card('Cinema Center', money(48, 120), dt, 'Cinema e shows', 'Cinema Center');
        if (rnd() < 0.03) add({ tipo: 'despesa', descricao: 'Feira livre', valor: money(30, 70), data: dt, categoria_id: cats['Mercado'], conta_id: carteira.id, forma_pagamento: 'dinheiro', estabelecimento: 'Feira livre' });
      }
    }
    // compra parcelada no cartão
    var notebookDate = Utils.addMonths(Utils.shiftMonthKey(m0, -2) + '-14', 0);
    var grupo = id();
    for (var p = 0; p < 10; p++) {
      card('Notebook', 359.9, Utils.addMonths(notebookDate, p), 'Eletrônicos', 'Magazine Central', { parcela_num: p + 1, parcela_total: 10, grupo_parcela_id: grupo });
    }
    // dedup do aluguel futuro (já existe no laço do mês atual se dia 10 > hoje)
    var seenFix = {};
    tx = tx.filter(function (t) { var key = t.descricao + t.data + t.valor; if (seenFix[key]) return false; seenFix[key] = 1; return true; });

    // faturas
    var invoices = {};
    tx.forEach(function (t) {
      if (!t.cartao_id || t.tipo === 'transferencia') return;
      var info = t.parcela_num ? Calc.invoiceFor(notebookDate, cartao.dia_fechamento, cartao.dia_vencimento) : Calc.invoiceFor(t.data, cartao.dia_fechamento, cartao.dia_vencimento);
      if (t.parcela_num) {
        var comp = Utils.shiftMonthKey(info.competencia, t.parcela_num - 1);
        info = { competencia: comp, data_fechamento: Utils.addMonths(info.data_fechamento, t.parcela_num - 1), data_vencimento: Utils.addMonths(info.data_vencimento, t.parcela_num - 1) };
      }
      var f = invoices[info.competencia];
      if (!f) f = invoices[info.competencia] = { id: id(), cartao_id: cartao.id, competencia: info.competencia, data_fechamento: info.data_fechamento, data_vencimento: info.data_vencimento, valor_total: 0, status: 'aberta' };
      f.valor_total = Utils.round2(f.valor_total + t.valor);
      t.fatura_id = f.id; t.competencia = info.competencia;
    });
    Object.keys(invoices).forEach(function (k2) {
      var f = invoices[k2];
      if (f.data_vencimento < today) {
        var pay = { id: id(), tipo: 'transferencia', descricao: 'Pagamento da fatura Cartão Roxo (' + f.competencia.slice(5) + '/' + f.competencia.slice(0, 4) + ')', valor: f.valor_total, data: f.data_vencimento, competencia: Utils.monthKey(f.data_vencimento), status: 'pago', conta_id: nubank.id, cartao_id: cartao.id, forma_pagamento: 'transferencia', origem: 'demo' };
        tx.push(pay); f.status = 'paga'; f.lancamento_pagamento_id = pay.id;
      } else if (f.data_fechamento <= today) f.status = 'fechada';
    });
    T('fin_faturas').insertMany(Object.keys(invoices).map(function (k3) { return invoices[k3]; }), { silent: true });

    // recorrência do aluguel
    var rec = { id: id(), descricao: 'Aluguel', modelo_json: { tipo: 'despesa', descricao: 'Aluguel', valor: 1650, categoria_id: cats['Aluguel'], conta_id: nubank.id, forma_pagamento: 'pix', status: 'pendente' }, frequencia: 'mensal', intervalo: 1, dia: 10, inicio: Utils.shiftMonthKey(m0, -3) + '-10', proxima_geracao: Utils.shiftMonthKey(m0, 1) + '-10', ativa: true };
    T('fin_recorrencias').insert(rec, { silent: true });
    tx.forEach(function (t) { if (t.descricao === 'Aluguel') t.recorrencia_id = rec.id; });

    // metas + reserva
    var metaReserva = { id: id(), titulo: 'Reserva de emergência', descricao: 'Seis meses de custo fixo guardados', motivo: 'Dormir tranquilo se algo apertar', area: 'financeira', horizonte: 'medio', data_inicio: Utils.addDays(today, -120), prazo: Utils.addDays(today, 240), medicao: 'automatica', origem_metrica: 'fin_reserva', valor_inicial: 0, valor_atual: 8340, valor_alvo: 20000, unidade: 'R$', status: 'ativa', prioridade: 1, cor: '#F2B705' };
    var reserva = { id: id(), nome: 'Reserva de emergência', meta_id: metaReserva.id, conta_id: poup.id, valor_alvo: 20000, saldo_atual: 8340, rendimento_pct: 0.85, cor: '#F2B705' };
    metaReserva.origem_id = reserva.id;
    var viagem = { id: id(), nome: 'Viagem para o Nordeste', conta_id: poup.id, valor_alvo: 6000, saldo_atual: 1850, rendimento_pct: 0.85, cor: '#5F9E8F' };
    T('fin_reservas').insertMany([reserva, viagem], { silent: true });
    for (var a = 3; a >= 1; a--) tx.push({ id: id(), tipo: 'transferencia', descricao: 'Aporte em Reserva de emergência', valor: 600, data: Utils.shiftMonthKey(m0, -a + 1) + '-07', competencia: Utils.shiftMonthKey(m0, -a + 1), status: 'pago', conta_id: nubank.id, reserva_id: reserva.id, meta_id: metaReserva.id, origem: 'demo' });
    tx = tx.filter(function (t) { return t.data <= Utils.addDays(today, 40) || t.parcela_num; });
    T('fin_lancamentos').insertMany(tx, { silent: true });
    out.push(tx.length + ' lançamentos');

    T('fin_orcamentos').insertMany([['Mercado', 1400], ['Alimentação fora', 600], ['Transporte', 700], ['Lazer', 300], ['Assinaturas', 80], ['Saúde', 600], ['Moradia', 2650], ['Compras', 450]].map(function (b) {
      return { id: id(), categoria_id: cats[b[0]], competencia: m0, valor_planejado: b[1], rollover: false };
    }), { silent: true });
    T('fin_investimentos').insertMany([
      { id: id(), nome: 'Tesouro Selic 2029', tipo: 'tesouro', instituicao: 'Tesouro Direto', valor_aplicado: 4000, valor_atual: 4387.12, data_aplicacao: Utils.addDays(today, -300), vencimento: '2029-03-01', rentabilidade: 9.68 },
      { id: id(), nome: 'CDB 110% do CDI', tipo: 'renda_fixa', instituicao: 'Banco Médio', valor_aplicado: 2500, valor_atual: 2611.4, data_aplicacao: Utils.addDays(today, -150), vencimento: Utils.addDays(today, 215), rentabilidade: 4.46 }
    ], { silent: true });
    T('fin_dividas').insert({ id: id(), credor: 'Financiamento da moto', valor_original: 9800, saldo_devedor: 4120.55, juros_mensal_pct: 1.49, parcelas: 12, valor_parcela: 389.9, proximo_vencimento: Utils.addDays(today, 12), status: 'ativa' }, { silent: true });
    T('fin_regras').insertMany([['supermercado bom preco', 'Mercado'], ['posto avenida', 'Combustível'], ['padaria estrela', 'Padaria e café'], ['drogaria sao bento', 'Farmácia']].map(function (r) {
      return { id: id(), padrao: r[0], categoria_id: cats[r[1]] };
    }), { silent: true });

    // ---------- FITNESS ----------
    var plans = [
      ['Treino A · Peito e tríceps', '1,4', '#F2B705', [['Supino reto com barra', 4, 8, 10, 62.5], ['Supino inclinado com halteres', 3, 10, 12, 24], ['Crossover na polia', 3, 12, 15, 17.5], ['Tríceps na polia com corda', 3, 10, 12, 25], ['Tríceps francês', 3, 10, 12, 14]]],
      ['Treino B · Costas e bíceps', '2,5', '#C4684A', [['Puxada frontal', 4, 8, 10, 55], ['Remada curvada com barra', 4, 8, 10, 50], ['Remada unilateral com halter', 3, 10, 12, 26], ['Rosca direta com barra', 3, 8, 10, 30], ['Rosca martelo', 3, 10, 12, 14]]],
      ['Treino C · Pernas e ombros', '3', '#5F9E8F', [['Agachamento livre', 4, 6, 8, 80], ['Leg press 45°', 4, 10, 12, 180], ['Mesa flexora', 3, 10, 12, 40], ['Desenvolvimento com halteres', 3, 8, 10, 22], ['Elevação lateral', 3, 12, 15, 9], ['Panturrilha em pé', 4, 12, 15, 70]]]
    ];
    var treinos = [], itens = [];
    plans.forEach(function (pl) {
      var tid = id();
      treinos.push({ id: tid, nome: pl[0], objetivo: 'hipertrofia', nivel: 'intermediario', dias_semana: pl[1], duracao_estimada_min: 65, cor: pl[2], ativo: true });
      pl[3].forEach(function (it, i) { if (ex[it[0]]) itens.push({ id: id(), treino_id: tid, exercicio_id: ex[it[0]].id, ordem: i, series: it[1], reps_min: it[2], reps_max: it[3], carga_sugerida: it[4], descanso_s: i === 0 ? 120 : 90, metodo: 'normal' }); });
    });
    T('fit_treinos').insertMany(treinos, { silent: true });
    T('fit_treino_itens').insertMany(itens, { silent: true });

    var sessoes = [], series = [], best = {};
    for (var back = 56; back >= 1; back--) {
      var date = Utils.addDays(today, -back), dow = String(Utils.parseDate(date).getDay());
      var tr = treinos.filter(function (t) { return t.dias_semana.split(',').indexOf(dow) >= 0; })[0];
      if (!tr || (back > 7 && rnd() < 0.18)) continue;
      var sid = id(), prog = 1 + (56 - back) / 56 * 0.08, vol = 0;
      var trItens = itens.filter(function (i) { return i.treino_id === tr.id; });
      var dur = int(52, 78) * 60;
      trItens.forEach(function (it) {
        for (var s = 0; s < it.series; s++) {
          var carga = Math.round(it.carga_sugerida * prog / 2.5) * 2.5 || it.carga_sugerida;
          var reps = int(it.reps_min, it.reps_max) - (s === it.series - 1 ? 1 : 0);
          var e1 = Calc.oneRm(carga, reps).epley;
          var pr = !!best[it.exercicio_id] && e1 > best[it.exercicio_id] + 0.05;
          if (!best[it.exercicio_id] || e1 > best[it.exercicio_id]) best[it.exercicio_id] = e1;
          vol += carga * reps;
          series.push({ id: id(), sessao_id: sid, exercicio_id: it.exercicio_id, ordem: series.length, reps: reps, carga: carga, concluida: true, e1rm: e1, eh_pr: pr });
        }
      });
      var ini = date + 'T18:' + ('0' + int(0, 30)).slice(-2) + ':00-03:00';
      sessoes.push({ id: sid, treino_id: tr.id, data: date, inicio: ini, duracao_s: dur, kcal_estimadas: Calc.kcalMet(5.3, 82, dur / 3600), volume_total: Math.round(vol), rpe: int(6, 9), humor: int(3, 5), status: 'concluida' });
    }
    T('fit_sessoes').insertMany(sessoes, { silent: true });
    T('fit_series').insertMany(series, { silent: true });

    var medidas = [];
    for (var w = 12; w >= 0; w--) {
      var f = (12 - w) / 12;
      medidas.push({ id: id(), data: Utils.addDays(today, -w * 7), peso_kg: Math.round((84.6 - 3.7 * f + between(-0.35, 0.35)) * 10) / 10, gordura_pct: Math.round((22.4 - 2.6 * f) * 10) / 10, cintura: Math.round((94 - 4 * f) * 10) / 10, quadril: 101, peito: 104, braco_d: Math.round((35.2 + 0.8 * f) * 10) / 10, braco_e: 35, coxa_d: 58, coxa_e: 57.6, panturrilha: 38, pescoco: 39 });
    }
    T('fit_medidas').insertMany(medidas, { silent: true });
    var cardio = [], passos = [];
    for (var c = 42; c >= 1; c--) {
      var cd = Utils.addDays(today, -c), dw = Utils.parseDate(cd).getDay();
      if (dw === 0 || dw === 6) {
        var km = Math.round(between(4.2, 7.8) * 10) / 10, pace = between(5.6, 6.4), secs = Math.round(km * pace * 60);
        cardio.push({ id: id(), data: cd, atividade: 'corrida', distancia_km: km, duracao_s: secs, pace: Math.floor(pace) + ':' + ('0' + Math.round((pace % 1) * 60)).slice(-2), kcal: Math.round(km * 72), fc_media: int(142, 158) });
      }
      if (c <= 28) passos.push({ id: id(), data: cd, passos: int(4200, 11800) });
    }
    T('fit_cardio').insertMany(cardio, { silent: true });
    T('fit_passos').insertMany(passos, { silent: true });

    // ---------- ALIMENTAÇÃO ----------
    T('nut_metas').insert({ id: id(), vigencia_inicio: Utils.addDays(today, -30), objetivo: 'perder', kcal: 2150, proteina_g: 160, carbo_g: 220, gordura_g: 70, fibra_g: 30, agua_ml: 2900, tmb: 1790, tdee: 2775, ritmo_kg_semana: -0.5, formula: 'mifflin', nivel_atividade: 'moderado', peso_alvo_kg: 78, data_alvo: Utils.addDays(today, 90) }, { silent: true });
    var diario = [], agua = [];
    function scaleMicros(m, k) { var o = {}; Object.keys(m || {}).forEach(function (x) { o[x] = Math.round(m[x] * k * 100) / 100; }); return o; }
    function eat(data, refeicao, hora, nome, g) {
      var fd = food[nome]; if (!fd) return;
      var k2 = g / 100;
      diario.push({ id: id(), data: data, hora: hora, refeicao: refeicao, alimento_id: fd.id, nome: fd.nome, quantidade_g: g, kcal: Math.round(fd.kcal * k2), proteina_g: Math.round(fd.proteina_g * k2 * 10) / 10, carbo_g: Math.round(fd.carbo_g * k2 * 10) / 10, gordura_g: Math.round(fd.gordura_g * k2 * 10) / 10, fibra_g: fd.fibra_g ? Math.round(fd.fibra_g * k2 * 10) / 10 : null, sodio_mg: fd.sodio_mg ? Math.round(fd.sodio_mg * k2) : null, nutrientes_json: scaleMicros(fd.nutrientes_json, k2) });
    }
    for (var n = 20; n >= 0; n--) {
      var ddn = Utils.addDays(today, -n);
      eat(ddn, 'cafe', '07:20', pick(['Pão francês', 'Tapioca (goma hidratada)', 'Pão de forma integral']), pick([50, 60]));
      eat(ddn, 'cafe', '07:20', 'Ovo de galinha cozido', pick([50, 100]));
      eat(ddn, 'cafe', '07:20', 'Café coado sem açúcar', 150);
      if (n === 0 && Number(Utils.fmt(new Date(), 'H')) < 11) continue;
      eat(ddn, 'lanche_manha', '10:10', pick(['Banana prata', 'Maçã fuji', 'Mamão papaia']), pick([70, 130, 150]));
      eat(ddn, 'almoco', '12:40', pick(['Arroz branco cozido', 'Arroz integral cozido']), int(100, 150));
      eat(ddn, 'almoco', '12:40', 'Feijão carioca cozido', 86);
      eat(ddn, 'almoco', '12:40', pick(['Peito de frango grelhado', 'Patinho grelhado', 'Tilápia grelhada', 'Alcatra grelhada']), int(110, 160));
      eat(ddn, 'almoco', '12:40', pick(['Alface crespa', 'Brócolis cozido', 'Abobrinha cozida']), 60);
      eat(ddn, 'almoco', '12:40', 'Azeite de oliva', 10);
      if (n === 0 && Number(Utils.fmt(new Date(), 'H')) < 16) continue;
      eat(ddn, 'lanche_tarde', '16:00', 'Iogurte natural integral', 170);
      eat(ddn, 'lanche_tarde', '16:00', pick(['Granola', 'Aveia em flocos']), 40);
      if (rnd() < 0.5) eat(ddn, 'lanche_tarde', '16:00', 'Banana prata', 70);
      if (n === 0) continue;
      if (rnd() < 0.25) { eat(ddn, 'jantar', '20:30', 'Pizza de muçarela', 220); eat(ddn, 'jantar', '20:30', 'Refrigerante cola', 350); }
      else { eat(ddn, 'jantar', '20:00', pick(['Batata-doce cozida', 'Macarrão cozido', 'Mandioca cozida']), int(170, 230)); eat(ddn, 'jantar', '20:00', pick(['Peito de frango grelhado', 'Carne moída (acém) refogada', 'Ovo frito']), int(90, 130)); }
      if (rnd() < 0.3) eat(ddn, 'ceia', '22:30', 'Whey protein concentrado', 30);
      var copos = int(6, 11);
      for (var cp = 0; cp < copos; cp++) agua.push({ id: id(), data: ddn, hora: ('0' + (8 + cp)).slice(-2) + ':00', ml: 250 });
    }
    for (var cp2 = 0; cp2 < 4; cp2++) agua.push({ id: id(), data: today, hora: ('0' + (8 + cp2 * 2)).slice(-2) + ':00', ml: 300 });
    T('nut_diario').insertMany(diario, { silent: true });
    T('nut_agua').insertMany(agua, { silent: true });

    // ---------- TAREFAS ----------
    var projetos = [{ id: id(), nome: 'Casa', cor: '#5F9E8F', icone: 'home' }, { id: id(), nome: 'Trabalho', cor: '#F2B705', icone: 'briefcase' }, { id: id(), nome: 'Estudos', cor: '#8FA3B8', icone: 'book' }];
    T('tar_projetos').insertMany(projetos, { silent: true });
    var P = { casa: projetos[0].id, trab: projetos[1].id, est: projetos[2].id };
    var tarefas = [
      ['Pagar boleto do condomínio', 1, P.casa, 0, '10:00', 'a_fazer', 'contas'], ['Revisar proposta do cliente', 2, P.trab, 0, '15:00', 'fazendo', ''],
      ['Agendar revisão da moto', 3, P.casa, 0, null, 'a_fazer', ''], ['Responder e-mails pendentes', 3, P.trab, 0, '09:30', 'a_fazer', ''],
      ['Enviar relatório mensal', 1, P.trab, -2, '18:00', 'a_fazer', ''], ['Trocar filtro do purificador', 4, P.casa, -5, null, 'a_fazer', ''],
      ['Estudar capítulo 4 de SQL', 2, P.est, 1, '20:00', 'a_fazer', 'faculdade'], ['Comprar presente da Marina', 2, null, 3, null, 'a_fazer', ''],
      ['Renovar seguro do celular', 3, P.casa, 6, null, 'a_fazer', ''], ['Preparar apresentação de sexta', 1, P.trab, 2, '14:00', 'a_fazer', ''],
      ['Lista de exercícios de modelagem', 2, P.est, 4, null, 'a_fazer', 'faculdade'], ['Ligar para a operadora de internet', 3, P.casa, null, null, 'a_fazer', ''],
      ['Organizar fotos de 2025', 4, null, null, null, 'a_fazer', ''], ['Atualizar currículo', 3, P.trab, 9, null, 'a_fazer', ''],
      ['Montar planilha de viagem', 4, null, 12, null, 'a_fazer', ''], ['Pagar fatura do cartão', 1, P.casa, -8, null, 'feito', 'contas'],
      ['Entregar trabalho de banco de dados', 1, P.est, -3, null, 'feito', 'faculdade'], ['Comprar ração', 3, P.casa, -1, null, 'feito', ''],
      ['Reunião de alinhamento', 2, P.trab, -4, '11:00', 'feito', ''], ['Marcar dentista', 3, null, -6, null, 'feito', '']
    ].map(function (t, i) {
      var due = t[3] === null ? null : Utils.addDays(today, t[3]);
      return { id: id(), titulo: t[0], prioridade: t[1], projeto_id: t[2], data_vencimento: due, hora: t[4], status: t[5], tags: t[6] || null, ordem: i, concluida_em: t[5] === 'feito' ? (due || today) + 'T17:00:00-03:00' : null, duracao_estimada_min: pick([15, 30, 45, 60]) };
    });
    T('tar_tarefas').insertMany(tarefas, { silent: true });
    T('tar_eventos').insertMany([
      { id: id(), titulo: 'Consulta no dentista', inicio: Utils.addDays(today, 2) + 'T09:00:00-03:00', fim: Utils.addDays(today, 2) + 'T10:00:00-03:00', local: 'Clínica Sorriso', cor: '#8FA3B8' },
      { id: id(), titulo: 'Aniversário da Marina', inicio: Utils.addDays(today, 5) + 'T00:00:00-03:00', dia_inteiro: true, cor: '#F2B705' },
      { id: id(), titulo: 'Prova de Banco de Dados', inicio: Utils.addDays(today, 9) + 'T19:00:00-03:00', fim: Utils.addDays(today, 9) + 'T21:00:00-03:00', local: 'Polo UNINTER', cor: '#C4684A' }
    ], { silent: true });
    var foco = [];
    for (var fz = 13; fz >= 0; fz--) if (rnd() < 0.7) foco.push({ id: id(), tarefa_id: pick(tarefas).id, inicio: Utils.addDays(today, -fz) + 'T19:30:00-03:00', duracao_s: pick([1500, 1500, 3000]), tipo: 'pomodoro' });
    T('tar_foco').insertMany(foco, { silent: true });

    // ---------- ROTINAS ----------
    var rotinas = [
      { titulo: 'Beber 500 ml ao acordar', categoria: 'saude', frequencia: 'diaria', modo: 'habito', hora_inicio: '06:40', cor: '#5F9E8F', icone: 'droplet' },
      { titulo: 'Meditação', categoria: 'saude', frequencia: 'diaria', modo: 'habito', hora_inicio: '07:00', duracao_min: 10, cor: '#8FA3B8', icone: 'leaf' },
      { titulo: 'Bloco de trabalho focado', categoria: 'trabalho', frequencia: 'semanal', dias_semana: '1,2,3,4,5', modo: 'bloco', hora_inicio: '09:00', hora_fim: '11:30', duracao_min: 150, cor: '#F2B705', icone: 'briefcase' },
      { titulo: 'Treino de musculação', categoria: 'treino', frequencia: 'semanal', dias_semana: '1,2,3,4,5', modo: 'bloco', hora_inicio: '18:00', hora_fim: '19:15', duracao_min: 75, cor: '#C4684A', icone: 'dumbbell', vinculo_modulo: 'fit' },
      { titulo: 'Estudo para a faculdade', categoria: 'estudo', frequencia: 'semanal', dias_semana: '1,2,3,4', modo: 'bloco', hora_inicio: '20:00', hora_fim: '21:30', duracao_min: 90, cor: '#8FA3B8', icone: 'book' },
      { titulo: 'Leitura antes de dormir', categoria: 'hobby', frequencia: 'diaria', modo: 'habito', hora_inicio: '22:30', cor: '#B98900', icone: 'book' },
      { titulo: 'Preparar marmitas', categoria: 'alimentacao', frequencia: 'semanal', dias_semana: '0', modo: 'checklist', hora_inicio: '15:00', hora_fim: '17:00', duracao_min: 120, cor: '#F6D365', icone: 'utensils' },
      { titulo: 'Revisar finanças do mês', categoria: 'casa', frequencia: 'mensal', dia_mes: 1, modo: 'habito', hora_inicio: '10:00', cor: '#F2B705', icone: 'wallet' }
    ].map(function (r) { return Object.assign({ id: id(), ativa: true, data_inicio: Utils.addDays(today, -70) }, r); });
    T('rot_rotinas').insertMany(rotinas, { silent: true });
    var marmitas = rotinas[6];
    T('rot_itens').insertMany(['Cozinhar arroz e feijão', 'Grelhar frango da semana', 'Separar legumes', 'Porcionar e congelar'].map(function (t, i) { return { id: id(), rotina_id: marmitas.id, titulo: t, ordem: i }; }), { silent: true });
    var execs = [];
    for (var e = 63; e >= 0; e--) {
      var ed = Utils.addDays(today, -e);
      rotinas.forEach(function (r) {
        if (!Routines.isDue(r, ed)) return;
        if (e === 0 && r.hora_inicio > Utils.fmt(new Date(), 'HH:mm')) return;
        var x = rnd(), adh = r.categoria === 'saude' ? 0.86 : 0.74;
        execs.push({ id: id(), rotina_id: r.id, data: ed, status: x < adh ? 'feito' : (x < adh + 0.08 ? 'parcial' : 'pulado'), hora_real: r.hora_inicio });
      });
    }
    T('rot_execucoes').insertMany(execs, { silent: true });

    // ---------- METAS ----------
    var pesoIni = medidas[0].peso_kg, pesoAtual = medidas[medidas.length - 1].peso_kg;
    var metas = [
      metaReserva,
      { id: id(), titulo: 'Chegar a 78 kg', motivo: 'Correr mais leve e dormir melhor', area: 'fitness', horizonte: 'medio', data_inicio: Utils.addDays(today, -84), prazo: Utils.addDays(today, 90), medicao: 'automatica', origem_metrica: 'fit_peso', valor_inicial: pesoIni, valor_atual: pesoAtual, valor_alvo: 78, unidade: 'kg', status: 'ativa', prioridade: 1, cor: '#C4684A' },
      { id: id(), titulo: 'Correr 10 km sem parar', area: 'fitness', horizonte: 'curto', data_inicio: Utils.addDays(today, -40), prazo: Utils.addDays(today, 50), medicao: 'marcos', valor_inicial: 0, valor_atual: 7.8, valor_alvo: 10, unidade: 'km', status: 'ativa', prioridade: 2, cor: '#5F9E8F' },
      { id: id(), titulo: 'Ler 12 livros no ano', area: 'estudos', horizonte: 'longo', data_inicio: today.slice(0, 4) + '-01-01', prazo: today.slice(0, 4) + '-12-31', medicao: 'manual', valor_inicial: 0, valor_atual: 8, valor_alvo: 12, unidade: 'livros', status: 'ativa', prioridade: 3, cor: '#B98900' },
      { id: id(), titulo: 'Trocar de carro', descricao: 'Entrada de 45 mil para um seminovo', area: 'financeira', horizonte: 'longo', data_inicio: Utils.addDays(today, -200), prazo: Utils.addDays(today, 520), medicao: 'manual', valor_inicial: 0, valor_atual: 6800, valor_alvo: 45000, unidade: 'R$', status: 'ativa', prioridade: 3, cor: '#8FA3B8' },
      { id: id(), titulo: 'Meditar 60 dias', area: 'saude', horizonte: 'curto', data_inicio: Utils.addDays(today, -63), prazo: Utils.addDays(today, 10), medicao: 'automatica', origem_metrica: 'rotina', origem_id: rotinas[1].id, valor_inicial: 0, valor_atual: 0, valor_alvo: 60, unidade: 'dias', status: 'ativa', prioridade: 2, cor: '#8FA3B8' },
      { id: id(), titulo: 'Inglês nível B2', area: 'carreira', horizonte: 'medio', data_inicio: Utils.addDays(today, -60), prazo: Utils.addDays(today, 240), medicao: 'marcos', valor_inicial: 0, valor_atual: 1, valor_alvo: 4, unidade: 'marcos', status: 'ativa', prioridade: 2, cor: '#F6D365' }
    ];
    T('met_metas').insertMany(metas, { silent: true });
    var marcos = [];
    [[metas[2].id, [['Correr 5 km', 5, -20, true], ['Correr 7,5 km', 7.5, 5, true], ['Correr 10 km', 10, 50, false]]],
     [metas[6].id, [['Terminar módulo intermediário', 1, -10, true], ['Simulado com 70%', 2, 60, false], ['Conversação semanal por 2 meses', 3, 150, false], ['Prova de certificação', 4, 240, false]]]].forEach(function (g) {
      g[1].forEach(function (mc, i) { marcos.push({ id: id(), meta_id: g[0], titulo: mc[0], valor_alvo: mc[1], data_prevista: Utils.addDays(today, mc[2]), concluido: mc[3], concluido_em: mc[3] ? Utils.addDays(today, mc[2]) + 'T12:00:00-03:00' : null, ordem: i }); });
    });
    T('met_marcos').insertMany(marcos, { silent: true });
    T('met_checkins').insertMany([[metas[3].id, -60, 6, 'Terminei "O Hobbit"'], [metas[3].id, -25, 7, 'Mais um, ritmo bom'], [metas[3].id, -4, 8, 'Faltam 4'], [metas[4].id, -30, 6800, 'Guardei o bônus']].map(function (c) {
      return { id: id(), meta_id: c[0], data: Utils.addDays(today, c[1]), valor: c[2], nota: c[3], humor: 4 };
    }), { silent: true });

    T('notificacoes').insertMany([
      { id: id(), tipo: 'meta', titulo: 'Meta pede atenção: Trocar de carro', corpo: '15% concluído com 28% do prazo passado', data_ref: today, link: '#/met', lida: false },
      { id: id(), tipo: 'conta', titulo: 'Vence em breve: Conta de luz', corpo: 'Confira o valor antes de pagar', data_ref: today, link: '#/fin/lancamentos', lida: false }
    ], { silent: true });

    AppLog.info('sistema', 'demo', 'Dados de demonstração criados: ' + out.join(', '));
    return ['Dados de demonstração criados.'].concat(out);
  }

  function runRoute() { return { resultado: run() }; }

  /** Remove tudo que tem id "demo-" do usuário atual. */
  function clear() {
    var email = Auth.email(), total = 0;
    Object.keys(SCHEMA).forEach(function (n) {
      if (n === 'logs' || n === 'usuarios') return;
      total += Db.table(n).hardDelete(function (r) { return r.user_id === email && String(r.id).indexOf('demo-') === 0; });
    });
    AppLog.info('sistema', 'demo', total + ' registros de demonstração removidos');
    return ['Dados de demonstração removidos: ' + total + ' registros.'];
  }

  function clearRoute() { return { resultado: clear() }; }

  return { run: run, runRoute: runRoute, clear: clear, clearRoute: clearRoute };
})();
