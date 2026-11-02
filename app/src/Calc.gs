/**
 * Cálculos puros (espelhados em js_calc no cliente). Sem acesso a planilha.
 * Exemplos de teste em Calc.selfTest().
 */
var Calc = (function () {
  var ACTIVITY = { sedentario: 1.2, leve: 1.375, moderado: 1.55, intenso: 1.725, muito_intenso: 1.9 };
  var KCAL_KG = 7700;

  function age(birth, ref) {
    if (!birth) return null;
    var b = Utils.parseDate(birth), r = Utils.parseDate(ref || Utils.today());
    var a = r.getFullYear() - b.getFullYear();
    if (r.getMonth() < b.getMonth() || (r.getMonth() === b.getMonth() && r.getDate() < b.getDate())) a--;
    return a;
  }

  /** TMB: Mifflin-St Jeor ou Katch-McArdle (com % de gordura). */
  function bmr(p) {
    if (p.formula === 'katch' && p.gordura_pct) return Math.round(370 + 21.6 * (p.peso * (1 - p.gordura_pct / 100)));
    var base = 10 * p.peso + 6.25 * p.altura - 5 * p.idade;
    return Math.round(base + (p.sexo === 'feminino' ? -161 : 5));
  }

  function tdee(bmrValue, nivel) { return Math.round(bmrValue * (ACTIVITY[nivel] || 1.55)); }

  /** Meta calórica com avisos de segurança. ritmo em kg/semana (negativo = perder). */
  function calorieTarget(p) {
    var ajuste = Math.round((p.ritmo || 0) * KCAL_KG / 7);
    var kcal = p.tdee + ajuste, avisos = [];
    var minimo = p.sexo === 'feminino' ? 1200 : 1500;
    if (p.ritmo < 0 && Math.abs(p.ritmo) > p.peso * 0.01) avisos.push('Ritmo acima de 1% do peso por semana: tende a perder massa magra.');
    if (p.ritmo > 0.5) avisos.push('Ganho acima de 0,5 kg por semana costuma vir mais de gordura.');
    if (kcal < minimo) { avisos.push('Meta abaixo de ' + minimo + ' kcal. Ajustamos para o mínimo.'); kcal = minimo; }
    return { kcal: kcal, ajuste: ajuste, avisos: avisos };
  }

  /** Macros em gramas: proteína por g/kg, gordura por % das kcal (mín. 0,8 g/kg), carboidrato = restante. */
  function macros(p) {
    var prot = Math.round((p.proteina_gkg || 1.8) * p.peso);
    var gord = Math.max(Math.round(p.kcal * (p.gordura_pct || 25) / 100 / 9), Math.round(0.8 * p.peso));
    var carb = Math.max(0, Math.round((p.kcal - prot * 4 - gord * 9) / 4));
    return { proteina_g: prot, gordura_g: gord, carbo_g: carb };
  }

  function water(peso, treinoMin) { return Math.round(peso * 35 + (treinoMin || 0) * 12); }

  function bmi(peso, alturaCm) {
    var m = alturaCm / 100, v = peso / (m * m);
    var classe = v < 18.5 ? 'Abaixo do peso' : v < 25 ? 'Peso normal' : v < 30 ? 'Sobrepeso' : v < 35 ? 'Obesidade grau I' : v < 40 ? 'Obesidade grau II' : 'Obesidade grau III';
    return { imc: Math.round(v * 10) / 10, classe: classe };
  }

  function healthyRange(alturaCm) {
    var m2 = Math.pow(alturaCm / 100, 2);
    return { min: Math.round(18.5 * m2 * 10) / 10, max: Math.round(24.9 * m2 * 10) / 10 };
  }

  /** % de gordura pelo método da Marinha (medidas em cm). */
  function navyBodyFat(p) {
    var v;
    if (p.sexo === 'feminino') v = 495 / (1.29579 - 0.35004 * Math.log10(p.cintura + p.quadril - p.pescoco) + 0.22100 * Math.log10(p.altura)) - 450;
    else v = 495 / (1.0324 - 0.19077 * Math.log10(p.cintura - p.pescoco) + 0.15456 * Math.log10(p.altura)) - 450;
    return Math.round(v * 10) / 10;
  }

  function oneRm(carga, reps) {
    if (!carga || !reps) return { epley: 0, brzycki: 0 };
    if (reps === 1) return { epley: carga, brzycki: carga };
    return { epley: Math.round(carga * (1 + reps / 30) * 10) / 10, brzycki: reps < 37 ? Math.round(carga * 36 / (37 - reps) * 10) / 10 : 0 };
  }

  function kcalMet(met, peso, horas) { return Math.round(met * peso * horas); }

  function hrMax(idade) { return Math.round(208 - 0.7 * idade); }

  function hrZones(idade) {
    var max = hrMax(idade);
    return [[50, 60], [60, 70], [70, 80], [80, 90], [90, 100]].map(function (z, i) {
      return { zona: i + 1, de: Math.round(max * z[0] / 100), ate: Math.round(max * z[1] / 100) };
    });
  }

  function ema(values, alpha) {
    var a = alpha || 0.25, out = [], prev = null;
    values.forEach(function (v) { prev = prev === null ? v : a * v + (1 - a) * prev; out.push(Math.round(prev * 100) / 100); });
    return out;
  }

  /** Regressão linear simples; devolve inclinação e intercepto. */
  function linreg(xs, ys) {
    var n = xs.length; if (n < 2) return null;
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
    var den = n * sxx - sx * sx; if (!den) return null;
    var slope = (n * sxy - sx * sy) / den;
    return { slope: slope, intercept: (sy - slope * sx) / n };
  }

  /**
   * Competência da fatura (mês do vencimento) para uma compra no cartão.
   * Compra no dia do fechamento ou depois cai na fatura seguinte.
   */
  function invoiceFor(data, diaFech, diaVenc) {
    var d = Utils.parseDate(data);
    var closeKey = Utils.monthKey(data);
    if (d.getDate() >= diaFech) closeKey = Utils.shiftMonthKey(closeKey, 1);
    var dueKey = diaVenc > diaFech ? closeKey : Utils.shiftMonthKey(closeKey, 1);
    function at(key, day) { return key + '-' + ('0' + Math.min(day, Utils.daysInMonth(key))).slice(-2); }
    return { competencia: dueKey, data_fechamento: at(closeKey, diaFech), data_vencimento: at(dueKey, diaVenc) };
  }

  /** Progresso de meta (0–100), funciona para aumentar e reduzir. */
  function goalProgress(m) {
    var ini = Number(m.valor_inicial || 0), atu = Number(m.valor_atual || 0), alvo = Number(m.valor_alvo);
    if (!isFinite(alvo) || alvo === ini) return atu === alvo ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round((atu - ini) / (alvo - ini) * 1000) / 10));
  }

  function selfTest() {
    var r = [];
    r.push(['TMB homem 80kg 180cm 30a = 1780', bmr({ peso: 80, altura: 180, idade: 30, sexo: 'masculino' }) === 1780]);
    r.push(['TMB mulher 60kg 165cm 28a = 1330', bmr({ peso: 60, altura: 165, idade: 28, sexo: 'feminino' }) === 1330]);
    r.push(['1RM Epley 100x5 = 116.7', oneRm(100, 5).epley === 116.7]);
    r.push(['IMC 80/180 = 24.7', bmi(80, 180).imc === 24.7]);
    r.push(['Fatura: compra 05/10 fecha 03 vence 10 → 2026-11', invoiceFor('2026-10-05', 3, 10).competencia === '2026-11']);
    r.push(['Fatura: compra 02/10 fecha 03 vence 10 → 2026-10', invoiceFor('2026-10-02', 3, 10).competencia === '2026-10']);
    r.push(['Fatura: fecha 25 vence 5, compra 20/10 → 2026-11', invoiceFor('2026-10-20', 25, 5).competencia === '2026-11']);
    r.push(['Meta de reduzir 90→80, atual 85 = 50%', goalProgress({ valor_inicial: 90, valor_atual: 85, valor_alvo: 80 }) === 50]);
    return r;
  }

  return {
    ACTIVITY: ACTIVITY, age: age, bmr: bmr, tdee: tdee, calorieTarget: calorieTarget, macros: macros, water: water, bmi: bmi,
    healthyRange: healthyRange, navyBodyFat: navyBodyFat, oneRm: oneRm, kcalMet: kcalMet, hrMax: hrMax, hrZones: hrZones,
    ema: ema, linreg: linreg, invoiceFor: invoiceFor, goalProgress: goalProgress, selfTest: selfTest
  };
})();
