/**
 * Fitness: fechamento de sessão de treino (volume, kcal estimadas, e1RM e detecção de PR).
 */
var Fitness = (function () {
  function latestWeight_() {
    var m = Db.table('fit_medidas').list({ orderBy: 'data desc' }).filter(function (x) { return x.peso_kg; })[0];
    return m ? Number(m.peso_kg) : 75;
  }

  /**
   * Salva a sessão e as séries numa só ida.
   * @param {{sessao:Object, series:Object[]}} p
   * @return {{changes:Object, prs:Object[], resumo:Object}}
   */
  function saveSession(p) {
    var s = Object.assign({}, p.sessao || {});
    var series = (p.series || []).slice(0, 400);
    if (!s.data) s.data = Utils.today();
    Db.validate('fit_sessoes', s, null);
    var exMap = {};
    Db.table('fit_exercicios').list({ withDeleted: true }).forEach(function (e) { exMap[e.id] = e; });

    // melhor e1RM histórico por exercício (antes desta sessão)
    var best = {};
    Db.table('fit_series').list().forEach(function (r) {
      if (r.e1rm && (!best[r.exercicio_id] || r.e1rm > best[r.exercicio_id])) best[r.exercicio_id] = r.e1rm;
    });

    var sessaoId = Utils.isUuid(s.id) ? s.id : Utils.uuid();
    var volume = 0, metSum = 0, metN = 0, prs = [], topNew = {};
    var rows = series.map(function (x, i) {
      var ex = exMap[x.exercicio_id];
      if (!ex) throw Utils.error('VALIDATION', 'Exercício inválido na série ' + (i + 1) + '.');
      var reps = Math.max(0, Math.round(Number(x.reps) || 0)), carga = Math.max(0, Number(x.carga) || 0);
      var done = x.concluida !== false;
      var e1rm = done && reps && carga ? Calc.oneRm(carga, reps).epley : null;
      if (done) { volume += reps * carga; metSum += Number(ex.met) || 5; metN++; }
      if (e1rm && e1rm > (best[ex.id] || 0) + 0.05 && (!topNew[ex.id] || e1rm > topNew[ex.id].e1rm)) topNew[ex.id] = { idx: i, e1rm: e1rm };
      return { sessao_id: sessaoId, exercicio_id: ex.id, ordem: i, reps: reps, carga: carga, concluida: done, tempo_s: x.tempo_s || null, e1rm: e1rm, eh_pr: false };
    });
    Object.keys(topNew).forEach(function (exId) {
      var t = topNew[exId];
      if (!best[exId]) return; // primeira vez não conta como recorde
      rows[t.idx].eh_pr = true;
      prs.push({ exercicio_id: exId, nome: exMap[exId].nome, e1rm: t.e1rm, carga: rows[t.idx].carga, reps: rows[t.idx].reps, anterior: best[exId] });
    });

    var dur = Number(s.duracao_s) || 0;
    var peso = latestWeight_();
    s.id = sessaoId;
    s.volume_total = Math.round(volume);
    s.kcal_estimadas = dur ? Calc.kcalMet(metN ? metSum / metN : 5, peso, dur / 3600) : null;
    s.status = s.status || 'concluida';

    var saved = Db.table('fit_sessoes').insert(s);
    var savedSeries = Db.table('fit_series').insertMany(rows, { silent: true });
    AppLog.info('fitness', 'sessao', 'Treino salvo: ' + savedSeries.length + ' séries, volume ' + s.volume_total + ' kg' + (prs.length ? ', ' + prs.length + ' PR(s)' : ''));
    return { changes: { fit_sessoes: [saved], fit_series: savedSeries }, prs: prs, resumo: { volume: s.volume_total, kcal: s.kcal_estimadas, duracao_s: dur } };
  }

  return { saveSession: saveSession, latestWeight: latestWeight_ };
})();
