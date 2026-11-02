/**
 * Login por e-mail + senha compartilhada, com sessão por token.
 *
 * - Qualquer pessoa abre o app, mas só entra quem sabe a senha.
 * - O e-mail informado vira o usuário: tudo o que ele cadastra leva user_id = e-mail, e os logs também.
 * - Tokens ficam nas propriedades do script (hash do token → e-mail, validade); cache de 6 h na frente.
 */

/** Rode no editor para trocar a senha do app. Ex.: definirSenha('minhaNovaSenha') */
function definirSenha(nova) {
  if (!nova || String(nova).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  PropertiesService.getScriptProperties().setProperty('LOGIN_SENHA_SHA256', Login.hash_(CONFIG.LOGIN.SALT + nova));
  console.log('Senha alterada. Sessões abertas continuam válidas; use encerrarSessoes() para derrubar todas.');
}

/** Rode no editor para desconectar todo mundo. */
function encerrarSessoes() { console.log(Login.purge_(true) + ' sessão(ões) encerrada(s).'); }

var Login = (function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PREFIX = 'sess_';

  function hash_(s) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
    return bytes.map(function (b) { var h = (b & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
  }
  function props_() { return PropertiesService.getScriptProperties(); }
  function cache_() { return CacheService.getScriptCache(); }
  function key_(token) { return PREFIX + hash_('tok:' + token).slice(0, 40); }

  function senhaOk_(senha) {
    var stored = props_().getProperty('LOGIN_SENHA_SHA256') || CONFIG.LOGIN.SENHA_SHA256;
    return hash_(CONFIG.LOGIN.SALT + String(senha || '')) === stored;
  }

  function normEmail_(e) {
    var s = String(e || '').trim().toLowerCase();
    if (!EMAIL_RE.test(s) || s.length > 120) throw Utils.error('VALIDATION', 'Informe um e-mail válido.', 'email');
    return s;
  }

  // ---------- limite de tentativas ----------
  function blocked_(email) {
    var n = Number(cache_().get('lf_' + email) || 0);
    if (n >= CONFIG.LOGIN.MAX_TENTATIVAS) throw Utils.error('VALIDATION', 'Muitas tentativas. Aguarde ' + CONFIG.LOGIN.BLOQUEIO_MIN + ' minutos e tente de novo.');
    return n;
  }
  function fail_(email, n) { cache_().put('lf_' + email, String(n + 1), CONFIG.LOGIN.BLOQUEIO_MIN * 60); }

  // ---------- sessões ----------
  function create_(email, device) {
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    var exp = Date.now() + CONFIG.LOGIN.SESSAO_DIAS * 86400000;
    var val = JSON.stringify({ e: email, x: exp, d: String(device || '').slice(0, 80), c: Utils.nowIso() });
    props_().setProperty(key_(token), val);
    cache_().put(key_(token), val, 21600);
    return token;
  }

  /** E-mail dono do token, ou null. */
  function resolve(token) {
    if (!token || typeof token !== 'string' || token.length < 40 || token.length > 80) return null;
    var k = key_(token);
    var raw = cache_().get(k);
    if (!raw) { raw = props_().getProperty(k); if (raw) cache_().put(k, raw, 21600); }
    if (!raw) return null;
    var s; try { s = JSON.parse(raw); } catch (e) { return null; }
    if (!s || !s.e || Date.now() > s.x) { drop_(k); return null; }
    return s.e;
  }

  function drop_(k) { try { props_().deleteProperty(k); } catch (e) { /* ok */ } try { cache_().remove(k); } catch (e2) { /* ok */ } }

  /** Remove sessões vencidas (ou todas). @return {number} */
  function purge_(all) {
    var p = props_().getProperties(), n = 0;
    Object.keys(p).forEach(function (k) {
      if (k.indexOf(PREFIX) !== 0) return;
      var s = null; try { s = JSON.parse(p[k]); } catch (e) { s = null; }
      if (all || !s || Date.now() > s.x) { drop_(k); n++; }
    });
    return n;
  }

  function done_(email, device) {
    Auth.as(email);
    Auth.profile();
    AppLog.audit('auth', 'login', email, null, { dispositivo: String(device || '').slice(0, 80) });
    return { token: create_(email, device), email: email };
  }

  // ---------- rotas públicas ----------
  /** @param {{email:string, senha:string}} p */
  function login(p, device) {
    var email = normEmail_(p.email);
    Auth.as(email);
    var n = blocked_(email);
    if (!senhaOk_(p.senha)) {
      fail_(email, n);
      AppLog.warn('auth', 'senha_incorreta', 'Tentativa de login com senha incorreta');
      var rest = CONFIG.LOGIN.MAX_TENTATIVAS - n - 1;
      throw Utils.error('VALIDATION', rest > 0 ? 'Senha incorreta. ' + rest + (rest === 1 ? ' tentativa restante.' : ' tentativas restantes.') : 'Senha incorreta. Acesso bloqueado por ' + CONFIG.LOGIN.BLOQUEIO_MIN + ' minutos.', 'senha');
    }
    cache_().remove('lf_' + email);
    return done_(email, device);
  }

  /** Rota autenticada: encerra a sessão atual. */
  function logout(p, token) {
    if (token) drop_(key_(token));
    AppLog.audit('auth', 'logout', Auth.email(), null, null);
    return { ok: true };
  }

  return { login: login, logout: logout, resolve: resolve, purge_: purge_, hash_: hash_ };
})();
