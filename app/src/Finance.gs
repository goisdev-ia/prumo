/**
 * Regras financeiras que envolvem mais de um registro: parcelas, faturas, recorrência, pagamento de fatura,
 * reconciliação, aportes em reservas, importação e exportação.
 */
var Finance = (function () {
  var T = function (n) { return Db.table(n); };

  function changes_() { return { fin_lancamentos: [], fin_faturas: [], fin_recorrencias: [], fin_regras: [], fin_reservas: [], met_metas: [] }; }

  /** Busca ou cria a fatura de um cartão numa competência. */
  function invoice_(cartao, info, ch) {
    var f = T('fin_faturas').list({ where: { cartao_id: cartao.id, competencia: info.competencia } })[0];
    if (f) return f;
    f = T('fin_faturas').insert({ cartao_id: cartao.id, competencia: info.competencia, data_fechamento: info.data_fechamento, data_vencimento: info.data_vencimento, status: 'aberta', valor_total: 0 });
    ch.fin_faturas.push(f);
    return f;
  }

  /** Recalcula total e status de uma fatura. */
  function touchInvoice(id, ch) {
    var f = T('fin_faturas').get(id);
    if (!f) return null;
    var cents = 0;
    T('fin_lancamentos').list({ where: { fatura_id: id } }).forEach(function (l) {
      if (l.tipo === 'despesa') cents += Utils.toCents(l.valor);
      else if (l.tipo === 'receita') cents -= Utils.toCents(l.valor);
    });
    var status = f.status === 'paga' ? 'paga' : (Utils.today() >= f.data_fechamento ? 'fechada' : 'aberta');
    var total = Utils.fromCents(cents);
    if (total !== f.valor_total || status !== f.status) f = T('fin_faturas').update(id, { valor_total: total, status: status }, { silent: true });
    if (ch) ch.fin_faturas.push(f);
    return f;
  }

  function learnRule_(tx, ch) {
    if (!tx.estabelecimento || !tx.categoria_id || tx.tipo === 'transferencia') return;
    var padrao = Utils.norm(tx.estabelecimento).slice(0, 40);
    if (padrao.length < 3) return;
    var exists = T('fin_regras').list().some(function (r) { return Utils.norm(r.padrao) === padrao; });
    if (!exists) ch.fin_regras.push(T('fin_regras').insert({ padrao: padrao, categoria_id: tx.categoria_id }, { silent: true }));
  }

  function checkTx_(tx) {
    if (!(Number(tx.valor) > 0)) throw Utils.error('VALIDATION', 'O valor precisa ser maior que zero.', 'valor');
    if (tx.tipo === 'transferencia') {
      if (!tx.conta_id && !tx.reserva_id) throw Utils.error('VALIDATION', 'Escolha a conta de origem.', 'conta_id');
      if (!tx.conta_destino_id && !tx.cartao_id && !tx.reserva_id) throw Utils.error('VALIDATION', 'Escolha a conta de destino.', 'conta_destino_id');
      if (tx.conta_id && tx.conta_id === tx.conta_destino_id) throw Utils.error('VALIDATION', 'Origem e destino precisam ser diferentes.', 'conta_destino_id');
    } else if (!tx.conta_id && !tx.cartao_id) {
      throw Utils.error('VALIDATION', 'Escolha uma conta ou cartão.', 'conta_id');
    }
    if (tx.conta_id && !T('fin_contas').get(tx.conta_id)) throw Utils.error('VALIDATION', 'Conta não encontrada.', 'conta_id');
    if (tx.categoria_id && !T('fin_categorias').get(tx.categoria_id)) throw Utils.error('VALIDATION', 'Categoria não encontrada.', 'categoria_id');
  }

  function nextDate_(date, freq, n) {
    n = n || 1;
    if (freq === 'diaria') return Utils.addDays(date, n);
    if (freq === 'semanal') return Utils.addDays(date, 7 * n);
    if (freq === 'anual') return Utils.addMonths(date, 12 * n);
    return Utils.addMonths(date, n);
  }

  /**
   * Cria ou edita lançamento. Em criação aceita parcelamento e recorrência; no cartão vincula à fatura correta.
   * @param {{tx:Object, parcelas:number=, recorrencia:{frequencia:string, intervalo:number, fim:string}=}} p
   */
  function saveTx(p) {
    var tx = Object.assign({}, p.tx || {});
    Db.validate('fin_lancamentos', tx, null);
    checkTx_(tx);
    var ch = changes_();
    return Db.withLock(function () {
      var existing = tx.id ? T('fin_lancamentos').get(tx.id) : null;
      var cartao = tx.cartao_id ? T('fin_cartoes').get(tx.cartao_id) : null;
      if (tx.cartao_id && !cartao) throw Utils.error('VALIDATION', 'Cartão não encontrado.', 'cartao_id');
      if (cartao && tx.tipo !== 'transferencia') { tx.conta_id = null; tx.forma_pagamento = 'credito'; }

      if (existing) {
        var oldInvoice = existing.fatura_id;
        if (cartao && tx.tipo !== 'transferencia') {
          var info = Calc.invoiceFor(tx.data, cartao.dia_fechamento, cartao.dia_vencimento);
          tx.fatura_id = invoice_(cartao, info, ch).id; tx.competencia = info.competencia;
        } else if (tx.tipo !== 'transferencia' || !existing.cartao_id) { tx.fatura_id = null; tx.competencia = Utils.monthKey(tx.data); }
        var patch = Object.assign({}, tx); Db.COMMON.forEach(function (k) { delete patch[k]; });
        var row = T('fin_lancamentos').update(existing.id, patch);
        ch.fin_lancamentos.push(row);
        [oldInvoice, row.fatura_id].filter(Boolean).forEach(function (id, i, a) { if (a.indexOf(id) === i) touchInvoice(id, ch); });
        learnRule_(row, ch);
        return { changes: ch };
      }

      var n = Utils.clamp(Math.round(Number(p.parcelas) || 1), 1, 72);
      var cents = Utils.toCents(tx.valor), base = Math.floor(cents / n), rem = cents - base * n;
      var group = n > 1 ? Utils.uuid() : null;
      var firstInfo = cartao && tx.tipo !== 'transferencia' ? Calc.invoiceFor(tx.data, cartao.dia_fechamento, cartao.dia_vencimento) : null;
      var rows = [];
      for (var i = 0; i < n; i++) {
        var r = Object.assign({}, tx);
        r.id = i === 0 && Utils.isUuid(tx.id) ? tx.id : Utils.uuid();
        r.valor = Utils.fromCents(base + (i === 0 ? rem : 0));
        r.data = Utils.addMonths(tx.data, i);
        r.competencia = Utils.monthKey(r.data);
        if (n > 1) { r.parcela_num = i + 1; r.parcela_total = n; r.grupo_parcela_id = group; }
        if (firstInfo) {
          var comp = Utils.shiftMonthKey(firstInfo.competencia, i);
          var info2 = { competencia: comp, data_fechamento: Utils.addMonths(firstInfo.data_fechamento, i), data_vencimento: Utils.addMonths(firstInfo.data_vencimento, i) };
          r.fatura_id = invoice_(cartao, info2, ch).id; r.competencia = comp; r.status = 'pago';
        } else if (i > 0 && r.status === 'pago') {
          r.status = 'pendente';
        }
        rows.push(r);
      }
      if (p.recorrencia && n === 1 && p.recorrencia.frequencia) {
        var model = Object.assign({}, tx); delete model.id; delete model.data;
        var rec = T('fin_recorrencias').insert({
          descricao: tx.descricao, modelo_json: model, frequencia: p.recorrencia.frequencia,
          intervalo: Math.max(1, Number(p.recorrencia.intervalo) || 1), dia: Utils.parseDate(tx.data).getDate(),
          inicio: tx.data, fim: p.recorrencia.fim || null,
          proxima_geracao: nextDate_(tx.data, p.recorrencia.frequencia, Number(p.recorrencia.intervalo) || 1), ativa: true
        });
        rows[0].recorrencia_id = rec.id;
        ch.fin_recorrencias.push(rec);
      }
      ch.fin_lancamentos = T('fin_lancamentos').insertMany(rows);
      var seen = {};
      rows.forEach(function (r) { if (r.fatura_id && !seen[r.fatura_id]) { seen[r.fatura_id] = 1; touchInvoice(r.fatura_id, ch); } });
      learnRule_(tx, ch);
      return { changes: ch };
    });
  }

  /** Exclui parcelas de um grupo a partir de um número (inclusive). */
  function removeGroup(p) {
    var ch = changes_();
    var rows = T('fin_lancamentos').list({ where: { grupo_parcela_id: p.grupo_parcela_id } })
      .filter(function (r) { return !p.a_partir || r.parcela_num >= p.a_partir; });
    rows.forEach(function (r) { ch.fin_lancamentos.push(T('fin_lancamentos').softDelete(r.id)); });
    var inv = {};
    rows.forEach(function (r) { if (r.fatura_id && !inv[r.fatura_id]) { inv[r.fatura_id] = 1; touchInvoice(r.fatura_id, ch); } });
    return { changes: ch, removidos: rows.length };
  }

  /** Saldo atual de uma conta (somente lançamentos pagos). */
  function balance(contaId) {
    var c = T('fin_contas').get(contaId);
    if (!c) return 0;
    var cents = Utils.toCents(c.saldo_inicial);
    T('fin_lancamentos').list().forEach(function (l) {
      if (l.status !== 'pago') return;
      var v = Utils.toCents(l.valor);
      if (l.tipo === 'receita' && l.conta_id === contaId && !l.cartao_id) cents += v;
      else if (l.tipo === 'despesa' && l.conta_id === contaId && !l.cartao_id) cents -= v;
      else if (l.tipo === 'transferencia') {
        if (l.conta_id === contaId) cents -= v;
        if (l.conta_destino_id === contaId) cents += v;
      }
    });
    return Utils.fromCents(cents);
  }

  /** @param {{fatura_id:string, conta_id:string, valor:number=, data:string=}} p */
  function payInvoice(p) {
    var ch = changes_();
    var f = T('fin_faturas').get(p.fatura_id);
    if (!f) throw Utils.error('NOT_FOUND', 'Fatura não encontrada.');
    if (f.status === 'paga') throw Utils.error('VALIDATION', 'Essa fatura já está paga.');
    var cartao = T('fin_cartoes').get(f.cartao_id);
    if (!p.conta_id) throw Utils.error('VALIDATION', 'Escolha a conta de pagamento.', 'conta_id');
    f = touchInvoice(f.id, ch);
    var valor = Number(p.valor) > 0 ? Utils.round2(p.valor) : f.valor_total;
    if (!(valor > 0)) throw Utils.error('VALIDATION', 'Fatura sem valor a pagar.');
    var tx = T('fin_lancamentos').insert({
      tipo: 'transferencia', descricao: 'Pagamento da fatura ' + cartao.nome + ' (' + f.competencia.slice(5) + '/' + f.competencia.slice(0, 4) + ')',
      valor: valor, data: p.data || Utils.today(), competencia: Utils.monthKey(p.data || Utils.today()), status: 'pago',
      conta_id: p.conta_id, cartao_id: cartao.id, forma_pagamento: 'transferencia', origem: 'sistema'
    });
    ch.fin_lancamentos.push(tx);
    ch.fin_faturas = [T('fin_faturas').update(f.id, { status: 'paga', lancamento_pagamento_id: tx.id })];
    return { changes: ch };
  }

  /** Ajusta o saldo da conta para o valor real informado. */
  function reconcile(p) {
    var ch = changes_();
    var atual = balance(p.conta_id);
    var diff = Utils.round2(Number(p.saldo_real) - atual);
    if (Math.abs(diff) < 0.01) return { changes: ch, diferenca: 0 };
    ch.fin_lancamentos.push(T('fin_lancamentos').insert({
      tipo: diff > 0 ? 'receita' : 'despesa', descricao: 'Ajuste de saldo', valor: Math.abs(diff),
      data: p.data || Utils.today(), competencia: Utils.monthKey(p.data || Utils.today()), status: 'pago',
      conta_id: p.conta_id, origem: 'sistema', observacao: 'Saldo informado: ' + Utils.money(p.saldo_real)
    }));
    return { changes: ch, diferenca: diff };
  }

  /** Aporte (valor > 0) ou resgate (valor < 0) numa reserva, ligado à conta. */
  function aporte(p) {
    var ch = changes_();
    var r = T('fin_reservas').get(p.reserva_id);
    if (!r) throw Utils.error('NOT_FOUND', 'Reserva não encontrada.');
    var v = Utils.round2(p.valor);
    if (!v) throw Utils.error('VALIDATION', 'Informe o valor.', 'valor');
    if (v < 0 && Math.abs(v) > Number(r.saldo_atual || 0) + 0.001) throw Utils.error('VALIDATION', 'Resgate maior que o saldo da reserva.', 'valor');
    if (p.conta_id) {
      ch.fin_lancamentos.push(T('fin_lancamentos').insert({
        tipo: 'transferencia', descricao: (v > 0 ? 'Aporte em ' : 'Resgate de ') + r.nome, valor: Math.abs(v),
        data: p.data || Utils.today(), competencia: Utils.monthKey(p.data || Utils.today()), status: 'pago',
        conta_id: v > 0 ? p.conta_id : null, conta_destino_id: v < 0 ? p.conta_id : null, reserva_id: r.id,
        meta_id: r.meta_id || null, origem: 'sistema'
      }));
    }
    var saldo = Utils.round2(Number(r.saldo_atual || 0) + v);
    ch.fin_reservas.push(T('fin_reservas').update(r.id, { saldo_atual: saldo }));
    if (r.meta_id) {
      var m = T('met_metas').get(r.meta_id);
      if (m && m.medicao === 'automatica') ch.met_metas.push(T('met_metas').update(m.id, { valor_atual: saldo }));
    }
    return { changes: ch };
  }

  /** Gera lançamentos das recorrências até o horizonte (idempotente; retoma de onde parou). */
  function generateRecurring() {
    var ch = changes_(), t0 = Date.now();
    var horizon = Utils.addDays(Utils.today(), CONFIG.RECURRING_HORIZON_DAYS);
    var created = 0;
    T('fin_recorrencias').list({ where: { ativa: true } }).forEach(function (rec) {
      if (Date.now() - t0 > CONFIG.TIME_BUDGET_MS) return;
      var next = rec.proxima_geracao || rec.inicio, rows = [], guard = 0;
      while (next <= horizon && (!rec.fim || next <= rec.fim) && guard < 60) {
        var m = Object.assign({}, rec.modelo_json || {});
        m.data = next; m.competencia = Utils.monthKey(next); m.recorrencia_id = rec.id; m.origem = 'recorrencia';
        m.status = m.cartao_id ? 'pago' : (next <= Utils.today() && m.status === 'pago' ? 'pago' : 'pendente');
        rows.push(m);
        next = nextDate_(next, rec.frequencia, rec.intervalo || 1);
        guard++;
      }
      if (!rows.length) return;
      rows.forEach(function (m) {
        if (m.cartao_id) {
          var res = saveTx({ tx: m });
          ch.fin_lancamentos = ch.fin_lancamentos.concat(res.changes.fin_lancamentos);
          ch.fin_faturas = ch.fin_faturas.concat(res.changes.fin_faturas);
        } else {
          ch.fin_lancamentos.push(T('fin_lancamentos').insert(m));
        }
        created++;
      });
      var patch = { proxima_geracao: next };
      if (rec.fim && next > rec.fim) patch.ativa = false;
      ch.fin_recorrencias.push(T('fin_recorrencias').update(rec.id, patch, { silent: true }));
    });
    if (created) AppLog.info('financas', 'recorrencias', created + ' lançamento(s) gerado(s)');
    return { criados: created, changes: ch };
  }

  function generateRecurringRoute() { return generateRecurring(); }

  /** Copia o orçamento de um mês para outro (sem sobrescrever o que já existe). */
  function copyBudget(p) {
    var de = p.de, para = p.para;
    var existing = {};
    T('fin_orcamentos').list({ where: { competencia: para } }).forEach(function (o) { existing[o.categoria_id] = true; });
    var rows = T('fin_orcamentos').list({ where: { competencia: de } })
      .filter(function (o) { return !existing[o.categoria_id]; })
      .map(function (o) { return { categoria_id: o.categoria_id, competencia: para, valor_planejado: o.valor_planejado, rollover: o.rollover }; });
    return { changes: { fin_orcamentos: T('fin_orcamentos').insertMany(rows) }, copiados: rows.length };
  }

  /**
   * Importa linhas já mapeadas no cliente (CSV/OFX), ignorando duplicadas.
   * @param {{rows:Object[], conta_id:string=, cartao_id:string=}} p rows: {data, descricao, valor (com sinal), id_externo=}
   */
  function importRows(p) {
    if (!p.conta_id && !p.cartao_id) throw Utils.error('VALIDATION', 'Escolha a conta ou o cartão do extrato.', 'conta_id');
    var rows = (p.rows || []).slice(0, 1000);
    var all = T('fin_lancamentos').list();
    var hashes = {}, sig = {};
    all.forEach(function (l) {
      if (l.import_hash) hashes[l.import_hash] = 1;
      sig[[l.conta_id || l.cartao_id, l.data, Utils.toCents(l.valor), Utils.norm(l.descricao)].join('|')] = 1;
    });
    var regras = T('fin_regras').list();
    var toInsert = [], dup = 0;
    rows.forEach(function (r) {
      var valor = Number(r.valor);
      if (!r.data || !isFinite(valor) || !valor) return;
      var desc = String(r.descricao || 'Sem descrição').slice(0, 140);
      var h = Utils.sha256([p.conta_id || p.cartao_id, r.data, Utils.toCents(valor), Utils.norm(desc), r.id_externo || ''].join('|'));
      var s = [p.conta_id || p.cartao_id, r.data, Utils.toCents(Math.abs(valor)), Utils.norm(desc)].join('|');
      if (hashes[h] || sig[s]) { dup++; return; }
      hashes[h] = 1;
      var regra = regras.filter(function (g) { return Utils.norm(desc).indexOf(Utils.norm(g.padrao)) >= 0; })[0];
      var tipo = r.tipo || (valor < 0 ? 'despesa' : 'receita');
      toInsert.push({
        tipo: tipo, descricao: desc, valor: Math.abs(valor), data: r.data, competencia: Utils.monthKey(r.data), status: 'pago',
        conta_id: p.conta_id || null, cartao_id: p.cartao_id || null, categoria_id: regra ? regra.categoria_id : (r.categoria_id || null),
        estabelecimento: desc.slice(0, 120), origem: 'importacao', import_hash: h
      });
    });
    var ch = changes_();
    if (p.cartao_id) {
      toInsert.forEach(function (tx) { var res = saveTx({ tx: tx }); ch.fin_lancamentos = ch.fin_lancamentos.concat(res.changes.fin_lancamentos); ch.fin_faturas = ch.fin_faturas.concat(res.changes.fin_faturas); });
    } else {
      ch.fin_lancamentos = T('fin_lancamentos').insertMany(toInsert, { silent: true });
    }
    AppLog.info('financas', 'importar', toInsert.length + ' importado(s), ' + dup + ' duplicado(s) ignorado(s)');
    return { changes: ch, importados: toInsert.length, duplicados: dup };
  }

  /** Exporta lançamentos do período em CSV (Excel pt-BR: ; e vírgula decimal) para a pasta exportacoes. */
  function exportCsv(p) {
    var cats = {}, contas = {}, cartoes = {};
    T('fin_categorias').list({ withDeleted: true }).forEach(function (c) { cats[c.id] = c.nome; });
    T('fin_contas').list({ withDeleted: true }).forEach(function (c) { contas[c.id] = c.nome; });
    T('fin_cartoes').list({ withDeleted: true }).forEach(function (c) { cartoes[c.id] = c.nome; });
    var rows = T('fin_lancamentos').list({ orderBy: 'data' }).filter(function (l) { return (!p.de || l.data >= p.de) && (!p.ate || l.data <= p.ate); });
    var q = function (v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta/Cartão', 'Valor', 'Status', 'Parcela', 'Estabelecimento', 'Tags'].join(';')];
    rows.forEach(function (l) {
      var sign = l.tipo === 'despesa' ? -1 : 1;
      lines.push([Utils.brDate(l.data), l.tipo, q(l.descricao), q(cats[l.categoria_id] || ''), q(contas[l.conta_id] || cartoes[l.cartao_id] || ''),
        (sign * l.valor).toFixed(2).replace('.', ','), l.status, l.parcela_total ? l.parcela_num + '/' + l.parcela_total : '', q(l.estabelecimento || ''), q(l.tags || '')].join(';'));
    });
    return Files.saveExport('lancamentos_' + (p.de || 'inicio') + '_' + (p.ate || Utils.today()) + '.csv', 'text/csv', '﻿' + lines.join('\n'));
  }

  return {
    saveTx: saveTx, removeGroup: removeGroup, touchInvoice: touchInvoice, balance: balance, payInvoice: payInvoice,
    reconcile: reconcile, aporte: aporte, generateRecurring: generateRecurring, generateRecurringRoute: generateRecurringRoute,
    copyBudget: copyBudget, importRows: importRows, exportCsv: exportCsv, nextDate: nextDate_
  };
})();
