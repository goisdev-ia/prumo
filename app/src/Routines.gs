/**
 * Rotinas: agenda do dia (servidor, usado no resumo diário).
 */
var Routines = (function () {
  /** A rotina acontece nesta data? */
  function isDue(r, date) {
    if (!r.ativa) return false;
    if (r.data_inicio && date < r.data_inicio) return false;
    if (r.data_fim && date > r.data_fim) return false;
    var d = Utils.parseDate(date);
    switch (r.frequencia) {
      case 'diaria': return true;
      case 'semanal': return String(r.dias_semana || '').split(',').indexOf(String(d.getDay())) >= 0;
      case 'mensal': return d.getDate() === Number(r.dia_mes || 1);
      case 'anual': return d.getDate() === Number(r.dia_mes || 1) && d.getMonth() + 1 === Number(r.mes || 1);
      case 'intervalo': return Utils.diffDays(r.data_inicio || date, date) % Math.max(1, Number(r.intervalo_dias) || 1) === 0;
      default: return false;
    }
  }

  function forDate(date) {
    return Db.table('rot_rotinas').list().filter(function (r) { return isDue(r, date); })
      .sort(function (a, b) { return String(a.hora_inicio || '99').localeCompare(String(b.hora_inicio || '99')); });
  }

  return { isDue: isDue, forDate: forDate };
})();
