/**
 * Identidade, perfil, preferências e PIN.
 */
var Auth = (function () {
  var email_ = null;

  /** E-mail do usuário atual (sessão web) ou do dono (gatilhos). */
  function email() {
    if (email_) return email_;
    var e = '';
    try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
    if (!e) { try { e = Session.getEffectiveUser().getEmail(); } catch (err2) { e = ''; } }
    email_ = (e || 'usuario@local').toLowerCase();
    return email_;
  }

  /** Define o usuário explicitamente (gatilhos multiusuário). */
  function as(mail) { email_ = String(mail || '').toLowerCase() || null; }

  /** Perfil do usuário; cria na primeira visita. */
  function profile() {
    var t = Db.table('usuarios');
    var row = t.list({ where: { email: email() } })[0];
    if (!row) {
      var nome = email().split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      row = t.insert({ email: email(), nome: nome, tema: 'dark', inicio_semana: 0, unidade_peso: 'kg', ultimo_acesso: Utils.nowIso() }, { silent: true });
    }
    var out = Object.assign({}, row);
    out.tem_pin = !!row.pin_hash;
    delete out.pin_hash;
    return out;
  }

  function touch() {
    var t = Db.table('usuarios');
    var row = t.list({ where: { email: email() } })[0];
    if (!row) return;
    var last = row.ultimo_acesso ? String(row.ultimo_acesso).slice(0, 10) : '';
    if (last !== Utils.today()) t.update(row.id, { ultimo_acesso: Utils.nowIso() }, { silent: true });
  }

  /** @param {{profile:Object}} p */
  function saveProfile(p) {
    var allowed = ['nome', 'foto_arquivo_id', 'nascimento', 'sexo', 'altura_cm', 'tema', 'moeda', 'idioma', 'inicio_semana', 'unidade_peso'];
    var patch = {};
    allowed.forEach(function (k) { if (p.profile && k in p.profile) patch[k] = p.profile[k]; });
    if (patch.nome !== undefined && !String(patch.nome || '').trim()) throw Utils.error('VALIDATION', 'Informe seu nome.', 'nome');
    if (patch.altura_cm && (patch.altura_cm < 80 || patch.altura_cm > 250)) throw Utils.error('VALIDATION', 'Altura deve estar entre 80 e 250 cm.', 'altura_cm');
    var prof = profile();
    Db.table('usuarios').update(prof.id, patch);
    return { profile: profile() };
  }

  /** Configurações como mapa "modulo.chave" → valor. */
  function settings() {
    var map = {};
    Db.table('configuracoes').list().forEach(function (r) { map[r.modulo + '.' + r.chave] = r.valor_json; });
    return map;
  }

  function setting(key, fallback) {
    var s = settings();
    return key in s && s[key] !== null ? s[key] : fallback;
  }

  /** @param {{values:Object}} p mapa "modulo.chave" → valor */
  function saveSettings(p) {
    var t = Db.table('configuracoes');
    var rows = t.list();
    Object.keys(p.values || {}).forEach(function (k) {
      var parts = k.split('.');
      if (parts.length !== 2) throw Utils.error('VALIDATION', 'Chave de configuração inválida: ' + k);
      var row = rows.filter(function (r) { return r.modulo === parts[0] && r.chave === parts[1]; })[0];
      var val = p.values[k];
      if (row) t.update(row.id, { valor_json: val === undefined ? null : val });
      else t.insert({ modulo: parts[0], chave: parts[1], valor_json: val === undefined ? null : val });
    });
    return { settings: settings() };
  }

  function pinHash_(pin) { return Utils.sha256(email() + ':prumo:' + pin); }

  /** @param {{pin:string|null, atual:string=}} p */
  function setPin(p) {
    profile();
    var t = Db.table('usuarios');
    var row = t.list({ where: { email: email() } })[0];
    if (row.pin_hash && pinHash_(String(p.atual || '')) !== row.pin_hash) throw Utils.error('VALIDATION', 'PIN atual incorreto.', 'atual');
    if (p.pin === null || p.pin === '') { t.update(row.id, { pin_hash: null }); return { tem_pin: false }; }
    if (!/^\d{4,6}$/.test(String(p.pin))) throw Utils.error('VALIDATION', 'O PIN precisa ter de 4 a 6 números.', 'pin');
    t.update(row.id, { pin_hash: pinHash_(String(p.pin)) });
    return { tem_pin: true };
  }

  function verifyPin(p) {
    var row = Db.table('usuarios').list({ where: { email: email() } })[0];
    if (!row || !row.pin_hash) return { ok: true };
    var ok = pinHash_(String(p.pin || '')) === row.pin_hash;
    if (!ok) AppLog.warn('auth', 'pin_incorreto', 'Tentativa de PIN incorreta');
    return { ok: ok };
  }

  return { email: email, as: as, profile: profile, touch: touch, saveProfile: saveProfile, settings: settings, setting: setting, saveSettings: saveSettings, setPin: setPin, verifyPin: verifyPin };
})();
