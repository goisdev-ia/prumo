/**
 * OCR via serviço avançado do Drive (converte imagem/PDF em Google Doc com OCR em português),
 * mais parsers tolerantes para cupom/recibo, comprovante Pix e rótulo nutricional.
 */
var Ocr = (function () {
  var MONEY = '(\\d{1,3}(?:[.\\s]\\d{3})*,\\d{2}|\\d+[.,]\\d{2})';
  var KEYWORDS = [
    [/supermerc|mercado|atacad|hortifrut|sacolao|acougue/, 'Mercado'],
    [/posto|combust|gasolina|etanol|estacionamento|uber|99 ?pop|taxi|pedagio/, 'Transporte'],
    [/farma|drogaria|droga|clinica|laborat|hospital|odonto/, 'Saúde'],
    [/restaurante|lanchonete|padaria|pizzaria|hamburg|ifood|cafeteria|bar |sorveteria|churrascaria/, 'Alimentação fora'],
    [/netflix|spotify|prime video|disney|youtube premium|icloud|google one/, 'Assinaturas'],
    [/escola|faculdade|curso|livraria|udemy|alura/, 'Educação'],
    [/cinema|teatro|ingresso|show/, 'Lazer'],
    [/pet ?shop|veterin|racao/, 'Pets'],
    [/energia|eletric|saneamento|agua e esgoto|condominio|aluguel|gas /, 'Moradia'],
    [/magazine|loja|shopping|americanas|vestu|calcad/, 'Compras']
  ];

  /** Corrige confusões comuns do OCR dentro de números (O→0, l→1). */
  function fix_(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/(\d)[Oo](?=[\d,.])/g, '$10').replace(/(?<=[\d,.])[Oo](\d)/g, '0$1')
      .replace(/(\d)[lI](?=\d)/g, '$11')
      .replace(/R\s*\$/g, 'R$')
      .replace(/[ \t]+/g, ' ');
  }

  function parseMoney(s) {
    if (s === null || s === undefined) return null;
    var t = String(s).replace(/\s/g, '');
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    var n = Number(t);
    return isFinite(n) ? Utils.round2(n) : null;
  }

  function parseNum_(s) {
    if (s === null || s === undefined) return null;
    var n = Number(String(s).replace(/\./g, function (m, i, all) { return /,\d+$/.test(all) ? '' : '.'; }).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function findDate_(t) {
    var m = t.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4}|\d{2})\b/);
    if (!m) return null;
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    var d = y + '-' + m[2] + '-' + m[1];
    return Utils.parseDate(d) && Number(m[2]) <= 12 && Number(m[1]) <= 31 ? d : null;
  }

  function findTime_(t) {
    var m = t.match(/\b([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
    return m ? m[1] + ':' + m[2] : null;
  }

  function moneyIn_(line) {
    var re = new RegExp(MONEY, 'g'), m, out = [];
    while ((m = re.exec(line)) !== null) out.push(parseMoney(m[1]));
    return out;
  }

  /**
   * Cupom fiscal / NFC-e / recibo.
   * @param {string} text
   * @return {Object} campos + confianca por campo (alta|media|baixa)
   */
  function parseReceipt(text) {
    var t = fix_(text);
    var lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var out = { estabelecimento: null, cnpj: null, data: null, hora: null, total: null, forma_pagamento: null, itens: [], confianca: {} };

    var cm = t.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
    if (cm) { out.cnpj = cm[1]; out.confianca.cnpj = 'alta'; }
    out.data = findDate_(t); out.confianca.data = out.data ? 'alta' : 'baixa';
    out.hora = findTime_(t);

    var priorities = [/valor\s+a\s+pagar/i, /valor\s+total/i, /total\s+a\s+pagar/i, /\btotal\s*(r\$)?\s*:?/i];
    for (var p = 0; p < priorities.length && out.total === null; p++) {
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i];
        if (!priorities[p].test(L) || /sub\s*-?total|itens|qtd|tributos|desconto|troco/i.test(L)) continue;
        var vals = moneyIn_(L);
        if (!vals.length && lines[i + 1]) vals = moneyIn_(lines[i + 1]);
        if (vals.length) { out.total = vals[vals.length - 1]; out.confianca.total = p < 3 ? 'alta' : 'media'; break; }
      }
    }
    if (out.total === null) {
      var all = moneyIn_(t).filter(function (v) { return v > 0 && v < 100000; });
      if (all.length) { out.total = Math.max.apply(null, all); out.confianca.total = 'baixa'; }
    }

    for (var k = 0; k < Math.min(lines.length, 6); k++) {
      var l = lines[k];
      if (/cnpj|cpf|cupom|danfe|nfc-?e|documento|extrato|consumidor|\d{5,}/i.test(l)) continue;
      if ((l.match(/[A-Za-zÀ-ú]/g) || []).length >= 4) { out.estabelecimento = l.replace(/\s{2,}/g, ' ').slice(0, 120); out.confianca.estabelecimento = k < 3 ? 'media' : 'baixa'; break; }
    }

    if (/\bpix\b/i.test(t)) out.forma_pagamento = 'pix';
    else if (/cr[eé]dito/i.test(t)) out.forma_pagamento = 'credito';
    else if (/d[eé]bito/i.test(t)) out.forma_pagamento = 'debito';
    else if (/dinheiro/i.test(t)) out.forma_pagamento = 'dinheiro';

    lines.forEach(function (ln) {
      if (out.itens.length >= 40) return;
      if (/total|troco|desconto|cnpj|pagar|cart[aã]o|pix|dinheiro/i.test(ln)) return;
      var m = ln.match(new RegExp('^(?:\\d{1,3}\\s+)?(?:\\d{6,14}\\s+)?([A-Za-zÀ-ú].{2,60}?)\\s+\\d+(?:[.,]\\d+)?\\s*(?:UN|UND|KG|G|L|ML|PC|CX|PCT)\\s*[xX*].*?' + MONEY + '\\s*$', 'i')) ||
        ln.match(new RegExp('^(?:\\d{1,3}\\s+)?(?:\\d{6,14}\\s+)?([A-Za-zÀ-ú][^\\d]{2,60}?)\\s+.*?' + MONEY + '\\s*$'));
      if (m) out.itens.push({ descricao: m[1].trim(), valor: parseMoney(m[2]) });
    });
    return out;
  }

  /** Comprovante de Pix / transferência. */
  function parsePix(text) {
    var t = fix_(text);
    var lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var out = { valor: null, data: null, hora: null, favorecido: null, instituicao: null, confianca: {} };
    var vm = t.match(new RegExp('R\\$\\s*' + MONEY));
    if (vm) { out.valor = parseMoney(vm[1]); out.confianca.valor = 'alta'; }
    else { var any = moneyIn_(t); if (any.length) { out.valor = any[0]; out.confianca.valor = 'baixa'; } }
    out.data = findDate_(t); out.confianca.data = out.data ? 'alta' : 'baixa';
    out.hora = findTime_(t);
    for (var i = 0; i < lines.length; i++) {
      if (/^(para|destino|recebedor|favorecido|quem recebeu|nome)\b/i.test(lines[i])) {
        var same = lines[i].replace(/^(para|destino|recebedor|favorecido|quem recebeu|nome)\s*:?\s*/i, '');
        out.favorecido = (same.length > 2 ? same : (lines[i + 1] || '')).slice(0, 120) || null;
        out.confianca.favorecido = out.favorecido ? 'media' : 'baixa';
        break;
      }
    }
    var im = t.match(/(?:institui[cç][aã]o|banco)\s*:?\s*([^\n]{3,60})/i);
    if (im) out.instituicao = im[1].trim();
    return out;
  }

  /** Rótulo nutricional (RDC 429/2020: primeira coluna costuma ser 100 g). */
  function parseLabel(text) {
    var t = fix_(text).replace(/\n(?=\s*\d)/g, ' ');
    var out = { base: /100\s*(g|ml)\b/i.test(t) ? '100g' : 'porcao', porcao_g: null, porcao_desc: null, confianca: {} };
    var pm = t.match(/por[cç][aã]o\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*(\([^)]{1,40}\))?/i);
    if (pm) { out.porcao_g = parseNum_(pm[1]); out.porcao_desc = (pm[1] + ' ' + pm[2] + (pm[3] ? ' ' + pm[3] : '')).trim(); out.confianca.porcao_g = 'alta'; }

    var energy = t.match(/valor\s+energ[ée]tico[^\n]*/i);
    if (energy) {
      var line = energy[0];
      var km = line.match(/(\d+(?:[.,]\d+)?)\s*kcal/i) || (/kcal/i.test(line) ? line.match(/\)\s*(\d+(?:[.,]\d+)?)/) : null) || line.match(/(\d+(?:[.,]\d+)?)/);
      if (km) { out.kcal = parseNum_(km[1]); out.confianca.kcal = /kcal/i.test(line) ? 'alta' : 'media'; }
    }
    var fields = [
      ['carbo_g', /carboidratos?(?:\s+totais)?/i], ['acucar_g', /a[cç][uú]cares\s+(?:totais)?/i],
      ['proteina_g', /prote[ií]nas?/i], ['gordura_g', /gorduras?\s+totais/i], ['gord_sat_g', /gorduras?\s+saturadas/i],
      ['gord_trans_g', /gorduras?\s+trans/i], ['fibra_g', /fibras?\s+alimentar(?:es)?/i], ['sodio_mg', /s[oó]dio/i]
    ];
    fields.forEach(function (f) {
      var re = new RegExp(f[1].source + '[^\\d\\n]{0,30}?(\\d+(?:[.,]\\d+)?)', 'i');
      var m = t.match(re);
      if (m) { out[f[0]] = parseNum_(m[1]); out.confianca[f[0]] = 'media'; }
    });
    return out;
  }

  function detect_(text) {
    var t = Utils.norm(text);
    if (/valor energetico|informacao nutricional|carboidratos|porcao de/.test(t)) return 'rotulo';
    if (/\bpix\b|comprovante de transfer|transferencia realizada|chave pix|id da transacao/.test(t) && !/cupom fiscal|nfc-e|danfe/.test(t)) return 'pix';
    return 'recibo';
  }

  /** Sugere categoria: primeiro regras aprendidas, depois palavras-chave. */
  function suggestCategory(estab, text) {
    var key = Utils.norm(estab || '');
    var all = Utils.norm((estab || '') + ' ' + (text || '').slice(0, 600));
    var regra = Db.table('fin_regras').list().filter(function (r) { return key && key.indexOf(Utils.norm(r.padrao)) >= 0; })[0];
    if (regra) return { categoria_id: regra.categoria_id, motivo: 'regra' };
    var cats = Db.table('fin_categorias').list({ where: { tipo: 'despesa' } });
    for (var i = 0; i < KEYWORDS.length; i++) {
      if (KEYWORDS[i][0].test(all)) {
        var c = cats.filter(function (x) { return Utils.norm(x.nome) === Utils.norm(KEYWORDS[i][1]) && !x.pai_id; })[0];
        if (c) return { categoria_id: c.id, motivo: 'palavra-chave' };
      }
    }
    return null;
  }

  function runOcr_(row) { return blobText(DriveApp.getFileById(row.drive_id).getBlob(), 'ocr_' + row.id); }

  /** OCR de um blob (imagem ou PDF) pelo Google Drive em português. O documento temporário vai para a lixeira. */
  function blobText(blob, nome) {
    if (typeof Drive === 'undefined') throw Utils.error('OCR_FAILED', 'Ative o serviço avançado "Drive API" no projeto para usar o OCR.');
    var tmp = Setup.folder('ocr_tmp');
    var docId;
    try {
      if (Drive.Files.create) {
        docId = Drive.Files.create({ name: nome, mimeType: 'application/vnd.google-apps.document', parents: [tmp.getId()] }, blob, { ocrLanguage: 'pt', fields: 'id' }).id;
      } else {
        docId = Drive.Files.insert({ title: nome, mimeType: 'application/vnd.google-apps.document', parents: [{ id: tmp.getId() }] }, blob, { ocr: true, ocrLanguage: 'pt' }).id;
      }
    } catch (e) {
      throw Utils.error('OCR_FAILED', 'O Google não conseguiu processar este arquivo para OCR.');
    }
    var text = '';
    try { text = DocumentApp.openById(docId).getBody().getText(); } finally {
      try { DriveApp.getFileById(docId).setTrashed(true); } catch (x) { /* limpeza semanal cuida */ }
    }
    if (!String(text).trim()) throw Utils.error('OCR_FAILED', 'Não encontramos texto na imagem. Tente uma foto mais nítida e reta.');
    return text;
  }

  /**
   * Rota: roda OCR num arquivo já enviado e devolve campos para revisão.
   * @param {{id:string, tipo:string=, refazer:boolean=}} p
   */
  function extract(p) {
    var row = Db.table('arquivos').get(p.id);
    if (!row || row.deleted_at) throw Utils.error('NOT_FOUND', 'Arquivo não encontrado.');
    var text = (row.ocr_texto && !p.refazer) ? row.ocr_texto : runOcr_(row);
    var kind = p.tipo && p.tipo !== 'auto' ? p.tipo : detect_(text);
    var campos = kind === 'rotulo' ? parseLabel(text) : (kind === 'pix' ? parsePix(text) : parseReceipt(text));
    if (kind !== 'rotulo') campos.sugestao = suggestCategory(campos.estabelecimento || campos.favorecido, text);
    Db.table('arquivos').update(row.id, { ocr_texto: String(text).slice(0, 19000), ocr_json: { tipo: kind, campos: campos } }, { silent: true });
    AppLog.info('ocr', 'extrair', 'OCR ' + kind + ' em ' + row.nome);
    return { tipo: kind, campos: campos, texto: String(text).slice(0, 6000) };
  }

  return { extract: extract, blobText: blobText, parseReceipt: parseReceipt, parsePix: parsePix, parseLabel: parseLabel, parseMoney: parseMoney, suggestCategory: suggestCategory, detect: detect_ };
})();
