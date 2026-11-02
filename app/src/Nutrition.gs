/**
 * Alimentação: consulta por código de barras (base local e Open Food Facts) e meta calórica revalidada no servidor.
 */
var Nutrition = (function () {
  function num_(v, mult) { var n = Number(v); return isFinite(n) ? Math.round(n * (mult || 1) * 10) / 10 : null; }

  /** @param {{code:string}} p */
  function barcode(p) {
    var code = String(p.code || '').replace(/\D/g, '');
    if (code.length < 8 || code.length > 14) throw Utils.error('VALIDATION', 'Código de barras inválido (8 a 14 dígitos).', 'code');
    var local = Db.table('nut_alimentos').list({ where: { codigo_barras: code } })[0];
    if (local) return { fonte: 'local', alimento: local };
    if (Auth.setting('int.off', true) === false) throw Utils.error('NOT_FOUND', 'Produto não está na sua base. A consulta à Open Food Facts está desligada nas configurações.');
    var cached = Cache.get('off', code);
    if (cached) return cached;
    var res;
    try {
      res = UrlFetchApp.fetch(CONFIG.OFF_URL + code + '.json?fields=product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity', {
        muteHttpExceptions: true, headers: { 'User-Agent': 'Prumo/1.0 (app pessoal; Apps Script)' }
      });
    } catch (e) {
      throw Utils.error('NOT_FOUND', 'Sem resposta da Open Food Facts agora. Cadastre manualmente ou tente mais tarde.');
    }
    if (res.getResponseCode() === 404) throw Utils.error('NOT_FOUND', 'Produto não encontrado na Open Food Facts. Cadastre manualmente.');
    if (res.getResponseCode() !== 200) throw Utils.error('NOT_FOUND', 'Open Food Facts indisponível (' + res.getResponseCode() + '). Tente mais tarde.');
    var body = Utils.parseJson(res.getContentText(), {});
    if (body.status !== 1 || !body.product) throw Utils.error('NOT_FOUND', 'Produto não encontrado na Open Food Facts. Cadastre manualmente.');
    var pr = body.product, n = pr.nutriments || {};
    var kcal = n['energy-kcal_100g'] !== undefined ? n['energy-kcal_100g'] : (n.energy_100g ? n.energy_100g / 4.184 : null);
    var out = {
      fonte: 'OFF',
      alimento: {
        nome: String(pr.product_name_pt || pr.product_name || 'Produto ' + code).slice(0, 120),
        marca: pr.brands ? String(pr.brands).split(',')[0].trim().slice(0, 80) : null,
        codigo_barras: code, fonte: 'OFF', porcao_g: Number(pr.serving_quantity) || 100, porcao_desc: pr.serving_size ? String(pr.serving_size).slice(0, 60) : '100 g',
        kcal: num_(kcal), proteina_g: num_(n.proteins_100g), carbo_g: num_(n.carbohydrates_100g), gordura_g: num_(n.fat_100g),
        gord_sat_g: num_(n['saturated-fat_100g']), gord_trans_g: num_(n['trans-fat_100g']), fibra_g: num_(n.fiber_100g),
        acucar_g: num_(n.sugars_100g), sodio_mg: n.sodium_100g !== undefined ? num_(n.sodium_100g, 1000) : null,
        nutrientes_json: {
          calcio_mg: n.calcium_100g !== undefined ? num_(n.calcium_100g, 1000) : undefined,
          ferro_mg: n.iron_100g !== undefined ? num_(n.iron_100g, 1000) : undefined,
          potassio_mg: n.potassium_100g !== undefined ? num_(n.potassium_100g, 1000) : undefined,
          vitamina_c_mg: n['vitamin-c_100g'] !== undefined ? num_(n['vitamin-c_100g'], 1000) : undefined
        }
      }
    };
    if (out.alimento.kcal === null) throw Utils.error('NOT_FOUND', 'O produto existe na Open Food Facts, mas sem tabela nutricional. Cadastre manualmente.');
    Cache.put('off', code, out);
    return out;
  }

  /**
   * Recalcula TMB/TDEE/meta no servidor a partir do perfil e grava nova meta vigente.
   * @param {{goal:Object, peso:number, gordura_pct:number=}} p
   */
  function saveGoal(p) {
    var prof = Auth.profile();
    var g = Object.assign({}, p.goal || {});
    var peso = Number(p.peso), idade = Calc.age(prof.nascimento);
    if (!peso || !prof.altura_cm || !idade || !prof.sexo) throw Utils.error('VALIDATION', 'Complete sexo, nascimento e altura no perfil e informe o peso.');
    var tmb = Calc.bmr({ peso: peso, altura: prof.altura_cm, idade: idade, sexo: prof.sexo, formula: g.formula, gordura_pct: p.gordura_pct });
    var tdee = Calc.tdee(tmb, g.nivel_atividade);
    var ritmo = Number(g.ritmo_kg_semana) || 0;
    if (g.objetivo === 'perder') ritmo = -Math.abs(ritmo); else if (g.objetivo === 'ganhar') ritmo = Math.abs(ritmo); else ritmo = 0;
    var target = Calc.calorieTarget({ tdee: tdee, ritmo: ritmo, sexo: prof.sexo, peso: peso });
    var kcal = g.kcal_manual ? Math.round(Number(g.kcal_manual)) : target.kcal;
    var mac = g.proteina_g && g.carbo_g && g.gordura_g ? { proteina_g: g.proteina_g, carbo_g: g.carbo_g, gordura_g: g.gordura_g } : Calc.macros({ kcal: kcal, peso: peso, proteina_gkg: g.proteina_gkg, gordura_pct: g.gordura_pct });
    var row = Db.table('nut_metas').insert({
      vigencia_inicio: g.vigencia_inicio || Utils.today(), objetivo: g.objetivo || 'manter', kcal: kcal,
      proteina_g: mac.proteina_g, carbo_g: mac.carbo_g, gordura_g: mac.gordura_g, fibra_g: g.fibra_g || 30,
      agua_ml: g.agua_ml || Calc.water(peso, 0), tmb: tmb, tdee: tdee, ritmo_kg_semana: ritmo, formula: g.formula || 'mifflin',
      nivel_atividade: g.nivel_atividade || 'moderado', peso_alvo_kg: g.peso_alvo_kg || null, data_alvo: g.data_alvo || null
    });
    return { changes: { nut_metas: [row] }, avisos: target.avisos };
  }

  /** Meta de água do usuário atual (mesma regra do cliente): escolhida > meta alimentar > 35 ml/kg. */
  function waterGoal() {
    var m = Number(Auth.setting('nut.meta_agua_ml', 0)) || 0;
    if (m >= 500) return m;
    var metas = Db.table('nut_metas').list().sort(function (a, b) { return String(a.vigencia_inicio) < String(b.vigencia_inicio) ? 1 : -1; });
    if (metas[0] && Number(metas[0].agua_ml)) return Number(metas[0].agua_ml);
    var pesos = Db.table('fit_medidas').list().filter(function (x) { return x.peso_kg; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    return Calc.water(pesos[0] ? Number(pesos[0].peso_kg) : 70, 0);
  }
  function waterToday() { var hoje = Utils.today(); return Db.table('nut_agua').list().filter(function (a) { return a.data === hoje; }).reduce(function (s, a) { return s + (Number(a.ml) || 0); }, 0); }

  return { waterGoal: waterGoal, waterToday: waterToday, barcode: barcode, saveGoal: saveGoal };
})();
