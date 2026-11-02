/**
 * WhatsApp (Cloud API oficial da Meta), pensado para custo zero.
 *
 * Regras da Meta em vigor desde 01/10/2026 (página "Pricing on the WhatsApp Business Platform"):
 *  - Mensagens de texto livre (não-template) só podem ser enviadas dentro da janela de atendimento de 24 h,
 *    que abre/renova quando a PESSOA manda uma mensagem para o número comercial.
 *  - Cada número comercial tem 1.000 mensagens de serviço grátis por mês. Sem forma de pagamento na Meta,
 *    as que passarem disso não são entregues (e não são cobradas).
 *  - Templates fora da janela são cobrados. Por isso este módulo NUNCA envia template.
 *
 * Proteções do Prumo:
 *  - Desligado por padrão; modo de teste (simulação, nada sai para a Meta) ligado por padrão para cada usuário.
 *  - Envios automáticos só com autorização explícita do usuário (wa.automatico).
 *  - Limite mensal global (padrão 900, máx. 1.000) e limite diário por usuário (padrão 20).
 *  - Só envia com a janela aberta (registrada pelo webhook ou pelo botão "Já mandei a mensagem").
 *  - Chave de deduplicação por envio; vários avisos viram uma mensagem só.
 *  - Credenciais só nas propriedades do script (nunca na planilha, no navegador ou no GitHub).
 */

/** Rode no editor para ver a situação da integração (sem mostrar o token). */
function whatsappStatus() { console.log(JSON.stringify(WhatsApp.adminInfo_(), null, 2)); }

/** Rode no editor para desligar tudo na hora (todas as pessoas). */
function whatsappDesligar() { PropertiesService.getScriptProperties().setProperty('WA_ATIVO', 'false'); console.log('Envios pelo WhatsApp desligados para todos.'); }

var WhatsApp = (function () {
  var DEF_VERSION = 'v26.0';
  var MAX_MES = 1000;           // faixa gratuita da Meta por número comercial
  var DEF_MES = 900;            // folga para o fuso de corte da Meta e para respostas do webhook
  var DEF_DIA = 20, MAX_DIA = 100;
  var JANELA_MS = 24 * 3600000, MARGEM_MS = 10 * 60000;   // considera a janela fechada 10 min antes
  var TIPOS = ['tarefa', 'rotina', 'evento', 'conta', 'fatura', 'meta', 'sistema'];
  var DEF_TIPOS = ['tarefa', 'rotina', 'evento', 'conta', 'fatura'];

  // ---------- propriedades (credenciais e contadores globais) ----------
  function props_() { return PropertiesService.getScriptProperties(); }
  function cfg_() {
    var p = props_().getProperties();
    return {
      token: p.WA_TOKEN || '', phoneId: p.WA_PHONE_ID || '', versao: p.WA_VERSAO || DEF_VERSION,
      ativo: p.WA_ATIVO === 'true', limiteMes: Math.min(MAX_MES, Number(p.WA_LIMITE_MES) || DEF_MES),
      numeroComercial: p.WA_NUMERO_COMERCIAL || '', nomeVerificado: p.WA_NOME || '',
      verifyToken: p.WA_VERIFY_TOKEN || '', webhookKey: p.WA_WEBHOOK_KEY || ''
    };
  }
  function owner_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }
  function isOwner_() { return Auth.email() === owner_(); }
  function mesKey_() { return 'WA_MES_' + Utils.today().slice(0, 7); }
  function usadoMes_() { return Number(props_().getProperty(mesKey_()) || 0); }
  function somaMes_() {
    var lock = LockService.getScriptLock(); lock.tryLock(10000);
    try { var n = usadoMes_() + 1; props_().setProperty(mesKey_(), String(n)); return n; } finally { try { lock.releaseLock(); } catch (e) { /* ok */ } }
  }
  function mask_(s) { s = String(s || ''); return s ? '••••' + s.slice(-4) : ''; }
  function randomKey_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

  // ---------- telefone ----------
  function digits_(s) { return String(s || '').replace(/\D/g, ''); }
  function normNumero_(s) {
    var d = digits_(s);
    if (d.length === 10 || d.length === 11) d = '55' + d;   // número brasileiro sem DDI
    if (d.length < 11 || d.length > 15) throw Utils.error('VALIDATION', 'Informe o número com DDD (ex.: +55 11 98765-4321).', 'numero');
    return d;
  }
  /** Mesmo número? Considera o 9º dígito dos celulares brasileiros (o WhatsApp às vezes manda o wa_id sem ele). */
  function mesmoNumero_(a, b) {
    a = digits_(a); b = digits_(b);
    if (a === b) return true;
    if (a.indexOf('55') === 0 && b.indexOf('55') === 0 && a.slice(2, 4) === b.slice(2, 4)) return a.slice(-8) === b.slice(-8);
    return false;
  }
  /**
   * Número no formato que o WhatsApp usa (wa_id). Celulares brasileiros fora dos DDDs 11–19, 21, 22, 24, 27 e 28
   * continuam com o ID antigo de 8 dígitos (sem o 9 na frente): mandar com o 9 é aceito pela API mas não chega.
   * Se o webhook já informou o wa_id real, ele vence.
   */
  var DDD_COM_9 = { 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 21: 1, 22: 1, 24: 1, 27: 1, 28: 1 };
  function waId_(num, aprendido) {
    if (aprendido) return digits_(aprendido);
    var d = digits_(num);
    if (d.length === 13 && d.indexOf('55') === 0 && d.charAt(4) === '9' && !DDD_COM_9[Number(d.slice(2, 4))]) return d.slice(0, 4) + d.slice(5);
    return d;
  }

  function emailDoNumero_(num) {
    var all = props_().getProperties(), d = digits_(num);
    if (all['WA_NUM_' + d]) return all['WA_NUM_' + d];
    var k = Object.keys(all).filter(function (x) { return x.indexOf('WA_NUM_') === 0 && mesmoNumero_(x.slice(7), d); })[0];
    return k ? all[k] : null;
  }

  // ---------- preferências do usuário (aba configuracoes) ----------
  function user_() {
    var s = Auth.settings();
    var g = function (k, def) { var v = s['wa.' + k]; return v === undefined || v === null ? def : v; };
    return {
      numero: digits_(g('numero', '')), ativo: g('ativo', false) === true, modoTeste: g('modo_teste', true) !== false,
      automatico: g('automatico', false) === true, tipos: Array.isArray(g('tipos', null)) ? g('tipos', null) : DEF_TIPOS,
      limiteDia: Math.max(1, Math.min(MAX_DIA, Number(g('limite_dia', DEF_DIA)) || DEF_DIA)),
      janelaAte: g('janela_ate', ''), janelaOrigem: g('janela_origem', ''), desde: g('desde', ''), waId: digits_(g('wa_id', ''))
    };
  }
  /** A coluna valor_json interpreta texto como JSON: textos vão codificados para continuarem texto. */
  function saveVals_(vals) {
    var out = {};
    Object.keys(vals).forEach(function (k) { out[k] = typeof vals[k] === 'string' ? JSON.stringify(vals[k]) : vals[k]; });
    Auth.saveSettings({ values: out });
  }
  function janelaAberta_(u) { return !!u.janelaAte && new Date(u.janelaAte).getTime() - MARGEM_MS > Date.now(); }
  function setJanela_(ate, origem) { saveVals_({ 'wa.janela_ate': ate, 'wa.janela_origem': origem }); }

  // ---------- registro (aba wa_mensagens) ----------
  function tabela_() { return Db.table('wa_mensagens'); }
  function enviadosHoje_() {
    var hoje = Utils.today();
    return tabela_().list().filter(function (m) { return m.direcao === 'saida' && m.status !== 'falhou' && m.status !== 'bloqueado' && m.status !== 'simulado' && String(m.created_at).slice(0, 10) === hoje; }).length;
  }
  function jaFeito_(chave) {
    return tabela_().list().some(function (m) { return m.chave === chave && m.status !== 'falhou' && m.status !== 'bloqueado'; });
  }
  function refsFeitas_() {
    var done = {};
    tabela_().list().forEach(function (m) { if (m.direcao === 'saida' && m.status !== 'falhou' && m.status !== 'bloqueado') String(m.ref_ids || '').split(',').forEach(function (id) { if (id) done[id] = 1; }); });
    return done;
  }

  // ---------- chamada à Graph API ----------
  function graph_(method, path, body) {
    var c = cfg_();
    if (!c.token || !c.phoneId) throw Utils.error('VALIDATION', 'Configure o token e o ID do número da Meta em Configurações › WhatsApp.');
    var opts = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + c.token } };
    if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
    var res = UrlFetchApp.fetch('https://graph.facebook.com/' + c.versao + '/' + path, opts);
    var code = res.getResponseCode(), json = null;
    try { json = JSON.parse(res.getContentText()); } catch (e) { json = null; }
    return { http: code, json: json || {}, ok: code >= 200 && code < 300 };
  }

  /** Traduz o erro da Graph API para algo acionável (sem expor token). */
  function erro_(r) {
    var e = (r.json && r.json.error) || {}, code = Number(e.code) || r.http;
    var det = (e.error_data && e.error_data.details) || e.message || ('HTTP ' + r.http);
    var M = {
      190: 'O token de acesso venceu ou foi revogado. Gere um token de usuário do sistema (System User) e salve de novo.',
      131047: 'A janela de 24 h está fechada: mande uma mensagem para o número do Prumo no WhatsApp e tente de novo.',
      131031: 'A Meta bloqueou a conta do WhatsApp Business (Business Account locked). Complete as informações da empresa e veja a Qualidade da conta no Gerenciador de Negócios.',
      131030: 'Este número não está na lista de destinatários do número de teste. Adicione-o em WhatsApp › API Setup › To (até 5).',
      130429: 'Limite de velocidade da Meta atingido. O Prumo tenta de novo depois.',
      131056: 'Muitas mensagens seguidas para o mesmo número. O Prumo tenta de novo depois.',
      131026: 'A Meta não conseguiu entregar: confira se o número tem WhatsApp e está atualizado.',
      131049: 'A Meta segurou a mensagem para proteger o engajamento. Aguarde 24 h.',
      133010: 'O número comercial não está registrado na plataforma.',
      100: 'Parâmetro inválido: confira o ID do número e a versão da API.',
      10: 'O token não tem a permissão whatsapp_business_messaging.',
      200: 'O token não tem permissão para este número.'
    };
    return { codigo: String(code), mensagem: M[code] || ('Meta: ' + String(det).slice(0, 240)), transitorio: code === 130429 || code === 131056 || code === 131000 || r.http >= 500, janela: code === 131047, token: code === 190 };
  }

  /**
   * Envia (ou simula) um texto livre para o usuário atual. Nunca envia template.
   * @return {{status:string, id?:string, erro?:Object}}
   */
  function enviar_(texto, chave, origem, refIds, opts) {
    opts = opts || {};
    var c = cfg_(), u = user_(), t = tabela_();
    if (u.modoTeste && chave) chave = 'sim:' + chave;   // simulação não impede o envio real depois
    var corpo = String(texto || '').slice(0, 4000);
    var base = { direcao: 'saida', chave: chave, origem: origem, ref_ids: (refIds || []).join(',').slice(0, 1800), para: u.numero, corpo: corpo.slice(0, 1000), tentativas: 1 };
    if (chave && jaFeito_(chave)) return { status: 'duplicado' };
    var bloq = function (motivo) { t.insert(Object.assign(base, { status: 'bloqueado', erro_msg: motivo }), { silent: true }); AppLog.info('whatsapp', 'bloqueado', motivo); return { status: 'bloqueado', erro: { mensagem: motivo } }; };
    if (!u.numero) return bloq('Cadastre seu número de WhatsApp.');
    if (!u.ativo) return bloq('WhatsApp desligado para este usuário.');
    if (u.modoTeste) {
      var sim = t.insert(Object.assign(base, { status: 'simulado' }), { silent: true });
      AppLog.info('whatsapp', 'simulado', 'Modo de teste: mensagem registrada, nada enviado à Meta (' + origem + ')');
      return { status: 'simulado', id: sim.id };
    }
    if (!c.ativo) return bloq('Envios pelo WhatsApp estão desligados pelo dono do app.');
    if (!c.token || !c.phoneId) return bloq('Credenciais da Meta não configuradas.');
    if (!opts.ignorarJanela && !janelaAberta_(u)) return bloq('Janela de 24 h fechada: mande uma mensagem para o número do Prumo no WhatsApp.');
    if (enviadosHoje_() >= u.limiteDia) return bloq('Limite diário de ' + u.limiteDia + ' mensagens atingido.');
    if (usadoMes_() >= c.limiteMes) return bloq('Limite mensal de ' + c.limiteMes + ' mensagens atingido (faixa gratuita da Meta: 1.000/mês).');
    var row = t.insert(Object.assign(base, { status: 'enviando' }), { silent: true });
    var r;
    try {
      r = graph_('post', c.phoneId + '/messages', { messaging_product: 'whatsapp', recipient_type: 'individual', to: '+' + waId_(u.numero, u.waId), type: 'text', text: { preview_url: false, body: corpo } });
    } catch (ex) {
      t.update(row.id, { status: 'falhou', erro_codigo: 'rede', erro_msg: String(ex.message).slice(0, 300) }, { silent: true });
      AppLog.error('whatsapp', 'envio', ex);
      return { status: 'falhou', erro: { mensagem: 'Falha de comunicação com a Meta. Tente de novo.' } };
    }
    if (r.ok) {
      var wamid = r.json.messages && r.json.messages[0] && r.json.messages[0].id;
      t.update(row.id, { status: 'enviado', wamid: wamid || null }, { silent: true });
      var n = somaMes_();
      if (wamid) props_().setProperty('WA_ID_' + Utils.sha256(wamid).slice(0, 24), Auth.email());
      AppLog.info('whatsapp', 'enviado', 'Mensagem aceita pela Meta (' + origem + '). Mês: ' + n + '/' + c.limiteMes);
      return { status: 'enviado', id: row.id, wamid: wamid };
    }
    var er = erro_(r);
    t.update(row.id, { status: 'falhou', erro_codigo: er.codigo, erro_msg: er.mensagem }, { silent: true });
    AppLog.warn('whatsapp', 'falhou', er.codigo + ' · ' + er.mensagem);
    if (er.janela) setJanela_('', 'fechada pela Meta');
    if (er.token) {
      props_().setProperty('WA_ATIVO', 'false');
      AppLog.error('whatsapp', 'token', new Error('Token da Meta inválido: envios desligados até salvar um token novo.'));
    }
    return { status: 'falhou', erro: er };
  }

  // ---------- rotas ----------
  function adminInfo_() {
    var c = cfg_(), url = '';
    try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; }
    return {
      configurado: !!(c.token && c.phoneId), ativo: c.ativo, versao: c.versao, phoneId: c.phoneId, token: mask_(c.token),
      numeroComercial: c.numeroComercial, nome: c.nomeVerificado, limiteMes: c.limiteMes, usadoMes: usadoMes_(),
      webhookUrl: url && c.webhookKey ? url + '?wa=' + c.webhookKey : '', verifyToken: c.verifyToken
    };
  }

  /** Rota: situação para a tela. Credenciais só mascaradas; dados do webhook só para o dono. */
  function status() {
    var c = cfg_(), u = user_(), owner = isOwner_();
    var info = adminInfo_();
    if (!owner) { delete info.webhookUrl; delete info.verifyToken; delete info.phoneId; delete info.token; }
    var hist = tabela_().list().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 25)
      .map(function (m) { return { id: m.id, direcao: m.direcao, status: m.status, origem: m.origem, corpo: String(m.corpo || '').slice(0, 160), erro: m.erro_msg || '', em: m.created_at }; });
    return {
      dono: owner, conta: info, tipos: TIPOS,
      usuario: { numero: u.numero, waId: waId_(u.numero, u.waId), ativo: u.ativo, modoTeste: u.modoTeste, automatico: u.automatico, tipos: u.tipos, limiteDia: u.limiteDia, janelaAte: u.janelaAte, janelaOrigem: u.janelaOrigem, janelaAberta: janelaAberta_(u) },
      uso: { hoje: enviadosHoje_(), mes: usadoMes_(), limiteMes: c.limiteMes },
      historico: hist
    };
  }

  /** Rota (dono): salva credenciais e limites. O token só é trocado se vier preenchido. */
  function saveConfig(p) {
    var pr = props_(), mudou = [];
    if (p.token) {
      var tk = String(p.token).trim();
      if (tk.length < 50 || /\s/.test(tk)) throw Utils.error('VALIDATION', 'Token inválido: cole o token inteiro, sem espaços.', 'token');
      pr.setProperty('WA_TOKEN', tk); mudou.push('token');
    }
    if (p.phoneId !== undefined) {
      var id = digits_(p.phoneId);
      if (id && (id.length < 8 || id.length > 25)) throw Utils.error('VALIDATION', 'O ID do número é só números (API Setup › Phone number ID).', 'phoneId');
      pr.setProperty('WA_PHONE_ID', id); mudou.push('phoneId');
    }
    if (p.versao) {
      if (!/^v\d{2}\.0$/.test(p.versao)) throw Utils.error('VALIDATION', 'Versão no formato v26.0.', 'versao');
      pr.setProperty('WA_VERSAO', p.versao); mudou.push('versao');
    }
    if (p.limiteMes !== undefined) {
      var n = Math.round(Number(p.limiteMes));
      if (!(n >= 1 && n <= MAX_MES)) throw Utils.error('VALIDATION', 'O limite mensal vai de 1 a 1.000 (a faixa gratuita da Meta).', 'limiteMes');
      pr.setProperty('WA_LIMITE_MES', String(n)); mudou.push('limiteMes');
    }
    if (p.ativo !== undefined) {
      if (p.ativo === true && !(cfg_().token && cfg_().phoneId)) throw Utils.error('VALIDATION', 'Salve o token e o ID do número antes de ativar.');
      pr.setProperty('WA_ATIVO', p.ativo === true ? 'true' : 'false'); mudou.push('ativo=' + (p.ativo === true));
    }
    if (!pr.getProperty('WA_VERIFY_TOKEN')) pr.setProperty('WA_VERIFY_TOKEN', randomKey_());
    if (!pr.getProperty('WA_WEBHOOK_KEY')) pr.setProperty('WA_WEBHOOK_KEY', randomKey_());
    AppLog.audit('whatsapp', 'configurar', 'conta', null, { campos: mudou });   // nunca registra o valor do token
    return status();
  }

  /** Rota (dono): confere token e número com uma leitura (não envia nada, não tem custo). */
  function testConnection() {
    var c = cfg_();
    var r = graph_('get', c.phoneId + '?fields=display_phone_number,verified_name,quality_rating,code_verification_status');
    if (!r.ok) { var er = erro_(r); AppLog.warn('whatsapp', 'teste_conexao', er.codigo + ' · ' + er.mensagem); throw Utils.error('VALIDATION', er.mensagem); }
    var pr = props_();
    pr.setProperty('WA_NUMERO_COMERCIAL', digits_(r.json.display_phone_number));
    pr.setProperty('WA_NOME', String(r.json.verified_name || ''));
    AppLog.info('whatsapp', 'teste_conexao', 'Conexão ok: ' + r.json.display_phone_number + ' (' + (r.json.verified_name || '') + ')');
    return { numero: r.json.display_phone_number || '', nome: r.json.verified_name || '', qualidade: r.json.quality_rating || '', verificacao: r.json.code_verification_status || '' };
  }

  /** Rota: preferências do usuário (número, ligar, modo de teste, automático, tipos, limite). */
  function saveUser(p) {
    var vals = {}, email = Auth.email(), pr = props_();
    if (p.numero !== undefined) {
      var antigo = user_().numero;
      if (p.numero) {
        var d = normNumero_(p.numero), dono = emailDoNumero_(d);
        if (dono && dono !== email) throw Utils.error('VALIDATION', 'Este número já está em uso por outra pessoa no Prumo.', 'numero');
        if (antigo && antigo !== d) pr.deleteProperty('WA_NUM_' + antigo);
        pr.setProperty('WA_NUM_' + d, email);
        vals['wa.numero'] = d;
        if (antigo !== d) { vals['wa.janela_ate'] = ''; vals['wa.janela_origem'] = ''; vals['wa.wa_id'] = ''; }
      } else {
        if (antigo) pr.deleteProperty('WA_NUM_' + antigo);
        vals['wa.numero'] = ''; vals['wa.ativo'] = false;
      }
    }
    ['ativo', 'modo_teste', 'automatico'].forEach(function (k) { if (p[k] !== undefined) vals['wa.' + k] = p[k] === true; });
    if (p.automatico === true) vals['wa.desde'] = Utils.nowIso();   // só avisos criados depois da autorização
    if (p.tipos !== undefined) vals['wa.tipos'] = (p.tipos || []).filter(function (x) { return TIPOS.indexOf(x) >= 0; });
    if (p.limiteDia !== undefined) {
      var n = Math.round(Number(p.limiteDia));
      if (!(n >= 1 && n <= MAX_DIA)) throw Utils.error('VALIDATION', 'Limite diário de 1 a ' + MAX_DIA + '.', 'limiteDia');
      vals['wa.limite_dia'] = n;
    }
    if (vals['wa.ativo'] === true && !(vals['wa.numero'] || user_().numero)) throw Utils.error('VALIDATION', 'Cadastre seu número antes de ativar.', 'numero');
    saveVals_(vals);
    return status();
  }

  /** Rota: a pessoa avisa que mandou mensagem para o número do Prumo (abre a janela sem webhook). */
  function markWindow() {
    var u = user_();
    if (!u.numero) throw Utils.error('VALIDATION', 'Cadastre seu número primeiro.');
    setJanela_(new Date(Date.now() + JANELA_MS).toISOString(), 'manual');
    AppLog.info('whatsapp', 'janela', 'Janela de 24 h marcada manualmente');
    return status();
  }

  /** Rota: mensagem de teste (respeita modo de teste, limites e janela). */
  function sendTest() {
    var r = enviar_('Prumo: teste de envio pelo WhatsApp em ' + Utils.fmt(new Date(), 'dd/MM HH:mm') + '. Se você recebeu, está tudo certo.', 'teste:' + Utils.fmt(new Date(), 'yyyy-MM-dd HH:mm'), 'teste', []);
    if (r.status === 'falhou' || r.status === 'bloqueado') throw Utils.error('VALIDATION', r.erro.mensagem);
    return { resultado: r.status, status: status() };
  }

  // ---------- envio automático (gatilho de 15 min) ----------
  var ROTULO = { tarefa: 'Tarefa', rotina: 'Rotina', evento: 'Evento', conta: 'Conta', fatura: 'Fatura', meta: 'Meta', sistema: 'Prumo' };

  /** Junta as notificações novas do usuário numa mensagem só. Nada acontece sem autorização explícita. */
  function dispatch() {
    var c = cfg_(), u = user_();
    if (!u.ativo || !u.automatico || !u.numero) return { enviados: 0 };
    if (!u.modoTeste && (!c.ativo || !janelaAberta_(u))) return { enviados: 0 };
    if (!u.modoTeste && (enviadosHoje_() >= u.limiteDia || usadoMes_() >= c.limiteMes)) {
      var ck = 'wa_lim_' + Utils.sha256(Auth.email()).slice(0, 12) + Utils.today();
      if (!CacheService.getScriptCache().get(ck)) { CacheService.getScriptCache().put(ck, '1', 21600); AppLog.warn('whatsapp', 'limite', 'Limite de envios atingido; avisos automáticos pausados até a virada do dia/mês.'); }
      return { enviados: 0, status: 'limite' };
    }
    var desde = u.desde || Utils.nowIso(), limiteIdade = new Date(Date.now() - 12 * 3600000).toISOString();
    var feitas = refsFeitas_();
    var novas = Db.table('notificacoes').list().filter(function (n) {
      return !n.lida && !feitas[n.id] && u.tipos.indexOf(n.tipo || 'sistema') >= 0 && String(n.created_at) >= String(desde) && new Date(n.created_at).toISOString() >= limiteIdade;
    }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; }).slice(0, 8);
    if (!novas.length) return { enviados: 0 };
    var linhas = novas.map(function (n) { return '• *' + (ROTULO[n.tipo] || 'Prumo') + ':* ' + n.titulo + (n.corpo ? ' — ' + n.corpo : ''); });
    var texto = (novas.length === 1 ? '*Prumo*\n' : '*Prumo · ' + novas.length + ' avisos*\n') + linhas.join('\n');
    var ids = novas.map(function (n) { return n.id; });
    var r = enviar_(texto, 'lote:' + Utils.sha256(ids.join(',')).slice(0, 32), 'automatico', ids);
    return { enviados: r.status === 'enviado' || r.status === 'simulado' ? 1 : 0, status: r.status };
  }

  // ---------- webhook (opcional) ----------
  /** GET de verificação da Meta. Pode não ser aceito porque o Apps Script responde via redirecionamento 302. */
  function verify(params) {
    var c = cfg_();
    if (params['hub.mode'] === 'subscribe' && c.verifyToken && params['hub.verify_token'] === c.verifyToken) {
      AppLog.info('whatsapp', 'webhook', 'Verificação do webhook recebida');
      return String(params['hub.challenge'] || '');
    }
    return null;
  }

  /**
   * POST da Meta. O Apps Script não lê cabeçalhos, então não dá para conferir a assinatura X-Hub-Signature-256:
   * a URL leva uma chave secreta (?wa=…) e só aceitamos o phone_number_id configurado.
   */
  function webhook(params, body) {
    var c = cfg_();
    if (!c.webhookKey || params.wa !== c.webhookKey) return 'ignorado';
    var data; try { data = JSON.parse(body || '{}'); } catch (e) { return 'json inválido'; }
    (data.entry || []).forEach(function (en) {
      (en.changes || []).forEach(function (ch) {
        var v = ch.value || {};
        if (!v.metadata || String(v.metadata.phone_number_id) !== String(c.phoneId)) return;
        (v.messages || []).forEach(function (m) { inbound_(m); });
        (v.statuses || []).forEach(function (s) { status_(s); });
      });
    });
    return 'ok';
  }

  function inbound_(m) {
    var email = emailDoNumero_(m.from);
    if (!email) return;
    Auth.as(email);
    var t = tabela_(), chave = 'in:' + m.id;
    if (t.list().some(function (x) { return x.chave === chave; })) return;   // a Meta reenvia: ignora repetidos
    var ts = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
    var texto = m.text && m.text.body ? String(m.text.body) : '(' + (m.type || 'mensagem') + ')';
    t.insert({ direcao: 'entrada', chave: chave, origem: 'webhook', para: digits_(m.from), corpo: texto.slice(0, 1000), status: 'recebido', wamid: m.id }, { silent: true });
    setJanela_(new Date(ts.getTime() + JANELA_MS).toISOString(), 'webhook');
    if (digits_(m.from) !== user_().waId) saveVals_({ 'wa.wa_id': digits_(m.from) });
    AppLog.info('whatsapp', 'recebido', 'Mensagem recebida: janela de 24 h aberta');
    var cmd = texto.trim().toLowerCase();
    var resp = cmd === 'hoje' || cmd === 'resumo' ? resumoHoje_() : cmd === 'ajuda' || cmd === 'menu' ? ajuda_() : null;
    if (resp) enviar_(resp, 'resp:' + m.id, 'resposta', []);
  }

  function status_(s) {
    var email = props_().getProperty('WA_ID_' + Utils.sha256(String(s.id)).slice(0, 24));
    if (!email) return;
    Auth.as(email);
    var t = tabela_(), row = t.list().filter(function (x) { return x.wamid === s.id; })[0];
    if (!row) return;
    var map = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'falhou' };
    var st = map[s.status]; if (!st) return;
    var patch = { status: st };
    if (st === 'falhou' && s.errors && s.errors[0]) { var er = erro_({ json: { error: { code: s.errors[0].code, message: s.errors[0].title } }, http: 200 }); patch.erro_codigo = er.codigo; patch.erro_msg = er.mensagem; if (er.janela) setJanela_('', 'fechada pela Meta'); }
    t.update(row.id, patch, { silent: true });
  }

  function resumoHoje_() {
    var hoje = Utils.today();
    var tarefas = Db.table('tar_tarefas').list().filter(function (x) { return x.status !== 'feito' && x.status !== 'cancelada' && x.data_vencimento && x.data_vencimento <= hoje; });
    var rotinas = Routines.forDate(hoje);
    var contas = Db.table('fin_lancamentos').list().filter(function (l) { return l.status !== 'pago' && l.tipo === 'despesa' && l.data <= Utils.addDays(hoje, 3); });
    var out = ['*Prumo · hoje, ' + Utils.brDate(hoje) + '*'];
    out.push(rotinas.length ? '*Rotinas:* ' + rotinas.slice(0, 6).map(function (r) { return (r.hora_inicio ? r.hora_inicio + ' ' : '') + r.titulo; }).join(' · ') : '*Rotinas:* nenhuma');
    out.push(tarefas.length ? '*Tarefas (' + tarefas.length + '):* ' + tarefas.slice(0, 6).map(function (x) { return x.titulo; }).join(' · ') : '*Tarefas:* nada pendente');
    if (contas.length) out.push('*Contas a vencer:* ' + contas.slice(0, 5).map(function (l) { return l.descricao + ' ' + Utils.money(l.valor); }).join(' · '));
    return out.join('\n');
  }
  function ajuda_() { return '*Prumo no WhatsApp*\nMande *hoje* para ver o resumo do dia.\nCada mensagem sua abre 24 h para o Prumo te mandar os lembretes.'; }

  return { status: status, saveConfig: saveConfig, testConnection: testConnection, saveUser: saveUser, markWindow: markWindow, sendTest: sendTest,
    dispatch: dispatch, verify: verify, webhook: webhook, adminInfo_: adminInfo_, _: { mesmoNumero_: mesmoNumero_, normNumero_: normNumero_, waId_: waId_ } };
})();
