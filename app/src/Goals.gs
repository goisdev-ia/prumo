/**
 * Metas: medição automática a partir dos outros módulos e status de ritmo (servidor, usado no resumo diário).
 * O cliente tem a mesma lógica em js_calc para atualizar a tela na hora.
 */
var Goals = (function () {
  /** Valor atual de uma meta automática. */
  function currentValue(m) {
    if (m.medicao !== 'automatica') return Number(m.valor_atual || 0);
    switch (m.origem_metrica) {
      case 'fin_reserva':
        var r = m.origem_id ? Db.table('fin_reservas').get(m.origem_id) : Db.table('fin_reservas').list({ where: { meta_id: m.id } })[0];
        return r ? Number(r.saldo_atual || 0) : Number(m.valor_atual || 0);
      case 'fit_peso': case 'nut_peso':
        var w = Db.table('fit_medidas').list({ orderBy: 'data desc' }).filter(function (x) { return x.peso_kg; })[0];
        return w ? Number(w.peso_kg) : Number(m.valor_atual || 0);
      case 'tarefas':
        return Db.table('tar_tarefas').list().filter(function (t) { return t.meta_id === m.id && t.status === 'feito'; }).length;
      case 'rotina':
        return Db.table('rot_execucoes').list().filter(function (e) { return (!m.origem_id || e.rotina_id === m.origem_id) && e.status === 'feito' && (!m.data_inicio || e.data >= m.data_inicio); }).length;
      case 'est_horas': case 'est_questoes': case 'est_precisao': case 'est_revisoes': case 'est_cobertura': case 'est_redacoes':
        return Studies.goalValue(m);
      default:
        return Number(m.valor_atual || 0);
    }
  }

  /** @return {'no_ritmo'|'atencao'|'atrasada'|'concluida'} */
  function pace(m, atual) {
    var mm = Object.assign({}, m, { valor_atual: atual });
    var pct = Calc.goalProgress(mm);
    if (pct >= 100) return 'concluida';
    if (!m.prazo || !m.data_inicio) return 'no_ritmo';
    var total = Utils.diffDays(m.data_inicio, m.prazo), passado = Utils.diffDays(m.data_inicio, Utils.today());
    if (total <= 0) return pct >= 100 ? 'concluida' : 'atrasada';
    var esperado = Utils.clamp(passado / total * 100, 0, 100);
    if (pct + 5 >= esperado) return 'no_ritmo';
    if (pct + 20 >= esperado) return 'atencao';
    return 'atrasada';
  }

  function atRisk() {
    return Db.table('met_metas').list({ where: { status: 'ativa' } }).map(function (m) {
      var a = currentValue(m);
      return { meta: m, atual: a, progresso: Calc.goalProgress(Object.assign({}, m, { valor_atual: a })), ritmo: pace(m, a) };
    }).filter(function (x) { return x.ritmo === 'atrasada' || x.ritmo === 'atencao'; });
  }

  return { currentValue: currentValue, pace: pace, atRisk: atRisk };
})();
