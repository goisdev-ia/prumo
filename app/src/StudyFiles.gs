/**
 * Estudos — arquivos no Drive.
 *  - Upload em partes direto para o Drive (upload retomável da API v3): arquivos de até 50 MB sem passar
 *    o arquivo inteiro numa única chamada. Nada vira base64 em célula de planilha.
 *  - Leitura por faixas de bytes (Range) para o leitor de PDF.
 *  - Anotações dos PDFs: um JSON versionado por material/versão do original, no Drive; índice na aba est_pdf_anot.
 *  - Texto extraído (para busca, Telegram e IA): JSON por material no Drive.
 *  - Cópias exportadas registram a revisão exata das anotações que contêm.
 */
var StudyFiles = (function () {
  var API = 'https://www.googleapis.com/drive/v3/files/';
  var UP = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType';
  var FORMATO = 'prumo-anotacoes', VERSAO_FORMATO = 1;

  function T(n) { return Db.table(n); }
  function props_() { return PropertiesService.getScriptProperties(); }
  function auth_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }; }

  /** Pasta de Estudos da pessoa: estudos/<id curto do e-mail>/<sub>. */
  function folder_(sub) {
    var u = Utils.sha256(Auth.email()).slice(0, 10), key = 'estfolder:' + u + ':' + sub, id = props_().getProperty(key);
    if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recria */ } }
    var root = Setup.folder('estudos'), uname = 'u-' + u, it = root.getFoldersByName(uname);
    var uf = it.hasNext() ? it.next() : root.createFolder(uname);
    if (!sub) { props_().setProperty(key, uf.getId()); return uf; }
    var it2 = uf.getFoldersByName(sub), sf = it2.hasNext() ? it2.next() : uf.createFolder(sub);
    props_().setProperty(key, sf.getId());
    return sf;
  }

  // ================= pastas da biblioteca =================
  // Prumo/estudos/u-<pessoa>/<Tipo>/<Concurso>/<AAAA-MM-DD>/<Categoria>/arquivo
  var CATEGORIAS = { questoes: 'Questões', revisoes: 'Revisões', teoria: 'Teoria', flashcards: 'Flashcards', outros: 'Outros' };
  function tipoPasta_(mime) { mime = String(mime || ''); return /pdf/.test(mime) ? 'PDFs' : /sheet|excel|csv/.test(mime) ? 'Planilhas' : /^image\//.test(mime) ? 'Imagens' : 'Outros'; }
  function nomePasta_(s) { return String(s || '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Geral'; }
  /** Caminho (lista de nomes) da pasta do material. */
  function caminho_(mat, arq) {
    var cid = String(mat.concurso_ids || '').split(',').filter(Boolean)[0], conc = cid ? T('est_concursos').get(cid) : null;
    var quando = (arq && arq.created_at) || mat.created_at, data = quando ? Utils.fmt(new Date(quando), 'yyyy-MM-dd') : Utils.today();
    return [tipoPasta_(arq && arq.mime), nomePasta_(conc ? conc.nome : 'Geral'), data, CATEGORIAS[mat.categoria] || 'Outros'];
  }
  /** Resolve (e cria o que faltar) a pasta do caminho, a partir da pasta da pessoa. */
  function pastaDe_(partes) {
    var key = 'estpath:' + Utils.sha256(Auth.email() + '/' + partes.join('/')).slice(0, 24), id = props_().getProperty(key);
    if (id) { try { var f0 = DriveApp.getFolderById(id); if (!f0.isTrashed()) return f0; } catch (e) { /* recria */ } }
    var f = folder_('');
    partes.forEach(function (n) { var it = f.getFoldersByName(n); f = it.hasNext() ? it.next() : f.createFolder(n); });
    props_().setProperty(key, f.getId());
    return f;
  }
  /** Coloca o arquivo do material na pasta certa (mover preserva id, hash e links). Devolve o caminho. */
  function place_(mat) {
    if (!mat || !mat.arquivo_id) return null;
    var arq = T('arquivos').get(mat.arquivo_id); if (!arq || arq.deleted_at) return null;
    var partes = caminho_(mat, arq), destino = pastaDe_(partes), caminho = partes.join('/');
    try {
      var f = DriveApp.getFileById(arq.drive_id), it = f.getParents(), ja = false;
      while (it.hasNext()) { if (it.next().getId() === destino.getId()) ja = true; }
      if (!ja) f.moveTo(destino);
    } catch (e) { AppLog.warn('estudos', 'pasta', 'Não consegui mover ' + arq.nome + ': ' + e.message); return null; }
    if (mat.pasta !== caminho) T('est_materiais').update(mat.id, { pasta: caminho }, { silent: true });
    return caminho;
  }
  /** "Reorganizar biblioteca": prévia (dry) ou mover tudo para a estrutura nova, dentro do tempo. */
  function reorganize(p) {
    var t0 = Date.now(), itens = [], movidos = 0, pend = 0;
    T('est_materiais').list().forEach(function (m) {
      if (!m.arquivo_id) return;
      var arq = T('arquivos').get(m.arquivo_id); if (!arq || arq.deleted_at) return;
      var para = caminho_(m, arq).join('/');
      if (m.pasta === para) return;
      itens.push({ material_id: m.id, codigo: m.codigo, titulo: m.titulo, de: m.pasta || 'originais (estrutura antiga)', para: para });
    });
    if (p && p.dry !== false) return { itens: itens, total: itens.length };
    itens.forEach(function (x) {
      if (Date.now() - t0 > 240000) { pend++; return; }
      if (place_(T('est_materiais').get(x.material_id))) movidos++;
    });
    AppLog.audit('estudos', 'reorganizar', 'est_materiais', null, { movidos: movidos, pendentes: pend });
    return { movidos: movidos, pendentes: pend, total: itens.length };
  }

  function safeName_(s) { return String(s || 'arquivo').replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 150); }

  // ================= upload em partes =================
  /**
   * Abre o envio. Se o mesmo conteúdo (hash) já está na biblioteca, devolve o existente (duplicata exata).
   * @param {{nome:string, mime:string, tamanho:number, hash:string, destino?:string}} p destino: originais|exportacoes
   */
  function upStart(p) {
    var mime = String(p.mime || '').toLowerCase(), size = Number(p.tamanho) || 0;
    if (CONFIG.EST.MIME.indexOf(mime) < 0) throw Utils.error('VALIDATION', 'Tipo não aceito na biblioteca. Envie PDF, planilha (XLSX/CSV), imagem ou texto.');
    if (size <= 0) throw Utils.error('VALIDATION', 'Arquivo vazio.');
    var max = Number(Auth.setting('est.upload_max_mb', CONFIG.EST.UPLOAD_MAX_BYTES / 1048576)) * 1048576;
    if (size > max) throw Utils.error('VALIDATION', 'Arquivo acima de ' + Math.round(max / 1048576) + ' MB.');
    var hash = String(p.hash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Utils.error('VALIDATION', 'Assinatura do arquivo inválida.');
    var destino = p.destino === 'exportacoes' ? 'exportacoes' : 'originais';
    if (destino === 'originais') {
      var dup = T('arquivos').list().filter(function (a) { return a.hash === hash && a.modulo === 'estudos'; })[0];
      if (dup) {
        var mat = T('est_materiais').list().filter(function (m) { return m.arquivo_id === dup.id; })[0] || null;
        return { duplicado: true, arquivo: dup, material: mat };
      }
    }
    // Cópia anotada (e outras exportações "do material"): um arquivo só por material e tipo. A nova revisão
    // substitui o conteúdo do mesmo arquivo no Drive; conteúdo idêntico (mesmo hash) não é enviado de novo.
    var alvo = null;
    if (destino === 'exportacoes' && p.substituir && p.substituir.material_id) {
      var matS = Studies.own('est_materiais', p.substituir.material_id, 'Material'), tipoS = String(p.substituir.tipo || 'anotado');
      var ex = exportOf_(matS.id, tipoS), arqS = ex && ex.arquivo_id ? T('arquivos').get(ex.arquivo_id) : null;
      if (arqS && !arqS.deleted_at) {
        if (arqS.hash === hash) return { duplicado: true, arquivo: arqS, mesmo_conteudo: true };
        alvo = arqS;
      }
    }
    if (alvo) {
      var resU = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(alvo.drive_id) + '?uploadType=resumable&fields=id,name,size,mimeType', { method: 'patch', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ name: safeName_(p.nome) }), headers: Object.assign({ 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) }, auth_()), muteHttpExceptions: true });
      var hU = resU.getHeaders() || {}, urlU = hU.Location || hU.location;
      if (resU.getResponseCode() === 200 && urlU) {
        var idU = Utilities.getUuid();
        CacheService.getScriptCache().put('estup:' + idU, JSON.stringify({ url: urlU, nome: safeName_(p.nome), mime: mime, size: size, hash: hash, user: Auth.email(), recebido: 0, destino: destino, alvo: alvo.id }), 21600);
        return { upload_id: idU, chunk: CONFIG.EST.CHUNK, substitui: alvo.id };
      }
      // o arquivo antigo sumiu do Drive: cria outro (o registro passa a apontar para ele)
    }
    var meta = { name: safeName_(p.nome), parents: [folder_(destino).getId()], mimeType: mime };
    var res = UrlFetchApp.fetch(UP, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify(meta), headers: Object.assign({ 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) }, auth_()), muteHttpExceptions: true });
    var h = res.getHeaders() || {}, url = h.Location || h.location;
    if (res.getResponseCode() !== 200 || !url) throw Utils.error('UNKNOWN', 'O Drive não abriu o envio (HTTP ' + res.getResponseCode() + ').');
    var id = Utilities.getUuid();
    CacheService.getScriptCache().put('estup:' + id, JSON.stringify({ url: url, nome: meta.name, mime: mime, size: size, hash: hash, user: Auth.email(), recebido: 0, destino: destino }), 21600);
    return { upload_id: id, chunk: CONFIG.EST.CHUNK };
  }

  /**
   * Envia uma parte (base64). offset tem de ser o próximo byte esperado; se não for, devolve o offset certo
   * (retomada depois de queda de rede). Ao terminar, cria o registro em arquivos.
   */
  function upChunk(p) {
    var c = CacheService.getScriptCache(), raw = c.get('estup:' + p.upload_id);
    if (!raw) throw Utils.error('VALIDATION', 'O envio expirou. Comece de novo.');
    var st = JSON.parse(raw);
    if (st.user !== Auth.email()) throw Utils.error('FORBIDDEN', 'Envio de outra pessoa.');
    if (Number(p.offset) !== st.recebido) return { esperado: st.recebido };
    var bytes = Utilities.base64Decode(String(p.base64 || ''));
    if (!bytes.length) throw Utils.error('VALIDATION', 'Parte vazia.');
    var end = st.recebido + bytes.length - 1, last = end + 1 >= st.size;
    if (!last && bytes.length % (256 * 1024) !== 0) throw Utils.error('VALIDATION', 'Parte com tamanho inválido.');
    if (end + 1 > st.size) throw Utils.error('VALIDATION', 'O arquivo ficou maior que o informado.');
    var res = UrlFetchApp.fetch(st.url, { method: 'put', contentType: st.mime, payload: bytes, headers: Object.assign({ 'Content-Range': 'bytes ' + st.recebido + '-' + end + '/' + st.size }, auth_()), muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 308) {
      var range = (res.getHeaders() || {}).Range || (res.getHeaders() || {}).range || '';
      var m = String(range).match(/-(\d+)$/); st.recebido = m ? Number(m[1]) + 1 : end + 1;
      c.put('estup:' + p.upload_id, JSON.stringify(st), 21600);
      return { recebido: st.recebido, total: st.size };
    }
    if (code !== 200 && code !== 201) throw Utils.error('UNKNOWN', 'O Drive recusou a parte (HTTP ' + code + '). Tente de novo.');
    var file = JSON.parse(res.getContentText() || '{}');
    c.remove('estup:' + p.upload_id);
    if (st.alvo) {
      var upd = T('arquivos').update(st.alvo, { drive_id: file.id, nome: st.nome, mime: st.mime, tamanho_bytes: st.size, hash: st.hash }, { silent: true });
      return { concluido: true, arquivo: upd, substituido: true };
    }
    var row = T('arquivos').insert({ drive_id: file.id, nome: st.nome, mime: st.mime, tamanho_bytes: st.size, modulo: 'estudos', entidade: st.destino === 'exportacoes' ? 'est_exportacoes' : 'est_materiais', tipo: 'outro', hash: st.hash });
    return { concluido: true, arquivo: row };
  }

  function ownArq_(id) {
    var a = T('arquivos').get(id);
    if (!a || a.deleted_at) throw Utils.error('NOT_FOUND', 'Arquivo não encontrado.');
    return a;
  }

  /** Lê uma faixa de bytes do arquivo (para o leitor de PDF). */
  function fileChunk(p) {
    var a = ownArq_(p.arquivo_id), start = Math.max(0, Number(p.start) || 0), len = Math.min(Number(p.len) || CONFIG.EST.CHUNK, 4 * 1024 * 1024);
    var total = Number(a.tamanho_bytes) || 0;
    if (total && start >= total) return { base64: '', start: start, total: total };
    var end = total ? Math.min(total - 1, start + len - 1) : start + len - 1;
    var res = UrlFetchApp.fetch(API + encodeURIComponent(a.drive_id) + '?alt=media', { headers: Object.assign({ Range: 'bytes=' + start + '-' + end }, auth_()), muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 404) throw Utils.error('NOT_FOUND', 'O arquivo não está mais no Drive. Veja Estudos › Preferências › Verificar arquivos.');
    if (code !== 200 && code !== 206) throw Utils.error('UNKNOWN', 'Não foi possível ler o arquivo (HTTP ' + code + ').');
    var bytes = res.getContent();
    if (!total && code === 200) total = bytes.length;
    return { base64: Utilities.base64Encode(bytes), start: start, total: total || Number(((res.getHeaders() || {})['Content-Range'] || '').split('/')[1]) || bytes.length };
  }

  // ================= anotações dos PDFs =================
  function annRow_(materialId, arquivoId) {
    return T('est_pdf_anot').list().filter(function (r) { return r.material_id === materialId && r.arquivo_id === arquivoId; })[0] || null;
  }
  function emptyDoc_(mat, arquivoId) { return { formato: FORMATO, versao_formato: VERSAO_FORMATO, material_id: mat.id, arquivo_id: arquivoId, revisao: 0, paginas: {}, favoritos: [], favoritos_rev: 0, ops: [] }; }
  function readDoc_(row, mat, arquivoId) {
    if (!row || !row.json_drive_id) return emptyDoc_(mat, arquivoId);
    var txt = DriveApp.getFileById(row.json_drive_id).getBlob().getDataAsString('UTF-8');
    var doc = Utils.parseJson(txt, null);
    if (!doc || doc.formato !== FORMATO) throw Utils.error('UNKNOWN', 'Arquivo de anotações danificado. Veja os logs.');
    if (doc.versao_formato > VERSAO_FORMATO) throw Utils.error('VALIDATION', 'As anotações foram salvas por uma versão mais nova do Prumo. Atualize o app.');
    return doc;
  }

  function matFor_(materialId, arquivoId) {
    var mat = Studies.own('est_materiais', materialId, 'Material');
    if (!arquivoId || mat.arquivo_id !== arquivoId) throw Utils.error('VALIDATION', 'Esta versão do arquivo não é a do material. Reabra o material.');
    ownArq_(arquivoId);
    return mat;
  }

  function annGet(p) {
    var mat = matFor_(p.material_id, p.arquivo_id), row = annRow_(mat.id, mat.arquivo_id), doc = readDoc_(row, mat, mat.arquivo_id);
    var exps = T('est_exportacoes').list().filter(function (e) { return e.material_id === mat.id && e.tipo === 'anotado'; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    delete doc.ops;
    return { doc: doc, indice: row, exportacoes: exps.slice(0, 10) };
  }

  /**
   * Salva páginas alteradas. base_revs = revisão de cada página que o aparelho conhecia.
   * Se alguma página mudou no servidor desde então, nada é gravado e volta CONFLICT com a versão do servidor
   * (o app pergunta: manter a minha, a do servidor ou juntar as duas). op_id torna a gravação idempotente.
   */
  function annSave(p) {
    var mat = matFor_(p.material_id, p.arquivo_id);
    var paginas = p.paginas || {}, base = p.base_revs || {};
    var nItens = 0; Object.keys(paginas).forEach(function (pg) { if (!/^\d{1,5}$/.test(pg)) throw Utils.error('VALIDATION', 'Página inválida.'); if (!Array.isArray(paginas[pg])) throw Utils.error('VALIDATION', 'Anotações inválidas.'); nItens += paginas[pg].length; });
    if (nItens > 20000) throw Utils.error('VALIDATION', 'Anotações demais num único envio.');
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw Utils.error('LOCKED', 'Outra gravação está em andamento. Tente de novo.');
    try {
      Db.resetMemo();
      var row = annRow_(mat.id, mat.arquivo_id), doc = readDoc_(row, mat, mat.arquivo_id);
      if (p.op_id && (doc.ops || []).indexOf(p.op_id) >= 0) return { revisao: doc.revisao, revs: revs_(doc), repetido: true };
      var conflitos = {};
      Object.keys(paginas).forEach(function (pg) { var cur = doc.paginas[pg] ? doc.paginas[pg].rev : 0; if (Number(base[pg] || 0) !== cur) conflitos[pg] = { rev: cur, itens: doc.paginas[pg] ? doc.paginas[pg].itens : [] }; });
      if (p.favoritos && Number(p.favoritos.base_rev || 0) !== Number(doc.favoritos_rev || 0)) conflitos._favoritos = { rev: doc.favoritos_rev || 0, lista: doc.favoritos || [] };
      if (Object.keys(conflitos).length) { var e = Utils.error('CONFLICT', 'As anotações mudaram em outro aparelho.'); e.data = { conflitos: conflitos, revisao: doc.revisao }; throw e; }
      Object.keys(paginas).forEach(function (pg) {
        var itens = paginas[pg].map(clean_).filter(Boolean);
        doc.paginas[pg] = { rev: (doc.paginas[pg] ? doc.paginas[pg].rev : 0) + 1, itens: itens };
        if (!itens.length) doc.paginas[pg].vazia = true;
      });
      if (p.favoritos) { doc.favoritos = (p.favoritos.lista || []).slice(0, 500).map(function (f) { return { pagina: Number(f.pagina), titulo: String(f.titulo || '').slice(0, 120), criado: f.criado || Utils.nowIso() }; }); doc.favoritos_rev = (doc.favoritos_rev || 0) + 1; }
      doc.revisao = (doc.revisao || 0) + 1;
      doc.ops = (doc.ops || []).concat(p.op_id ? [p.op_id] : []).slice(-200);
      doc.salvo_em = Utils.nowIso();
      var json = JSON.stringify(doc);
      var fileId = row && row.json_drive_id;
      if (fileId) DriveApp.getFileById(fileId).setContent(json);
      else fileId = folder_('anotacoes').createFile(Utilities.newBlob(json, 'application/json', 'anotacoes_' + mat.codigo + '_' + mat.arquivo_id.slice(0, 8) + '.json')).getId();
      var total = Object.keys(doc.paginas).reduce(function (s, k) { return s + doc.paginas[k].itens.length; }, 0);
      var patch = { json_drive_id: fileId, revisao: doc.revisao, revisoes_json: revs_(doc), total: total, favoritos: (doc.favoritos || []).length, atualizado: doc.salvo_em };
      if (row) T('est_pdf_anot').update(row.id, patch, { silent: true }); else T('est_pdf_anot').insert(Object.assign({ material_id: mat.id, arquivo_id: mat.arquivo_id }, patch), { silent: true });
      return { revisao: doc.revisao, revs: revs_(doc), favoritos_rev: doc.favoritos_rev, salvo_em: doc.salvo_em };
    } finally { try { lock.releaseLock(); } catch (x) { /* ok */ } }
  }

  function revs_(doc) { var o = {}; Object.keys(doc.paginas || {}).forEach(function (k) { o[k] = doc.paginas[k].rev; }); return o; }

  var TIPOS_ANOT = { texto: 1, marca: 1, marca_texto: 1, caneta: 1, pincel: 1, sublinhado: 1, riscado: 1, linha: 1, seta: 1, retangulo: 1, elipse: 1, comentario: 1 };
  /** Mantém só os campos conhecidos de cada anotação (geometria em pontos do PDF, espaço da página). */
  function clean_(a) {
    if (!a || !TIPOS_ANOT[a.tipo] || !a.id) return null;
    var num = function (v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
    var o = { id: String(a.id).slice(0, 40), tipo: a.tipo, cor: String(a.cor || '#F2B705').slice(0, 9), opacidade: Utils.clamp(num(a.opacidade || 1), 0.05, 1), espessura: Utils.clamp(num(a.espessura || 2), 0.2, 60), ordem: num(a.ordem) };
    if (a.rect) o.rect = a.rect.slice(0, 4).map(num);
    if (a.rects) o.rects = a.rects.slice(0, 400).map(function (r) { return r.slice(0, 4).map(num); });
    if (a.pts) o.pts = a.pts.slice(0, 20000).map(num);
    if (a.texto != null) o.texto = String(a.texto).slice(0, 5000);
    if (a.fonte) o.fonte = Utils.clamp(num(a.fonte), 4, 96);
    if (a.alinhamento) o.alinhamento = ['left', 'center', 'right'].indexOf(a.alinhamento) >= 0 ? a.alinhamento : 'left';
    if (a.trecho) o.trecho = String(a.trecho).slice(0, 2000);
    if (a.tags) o.tags = String(a.tags).slice(0, 120);
    o.criado = a.criado || Utils.nowIso(); o.alterado = a.alterado || o.criado;
    return o;
  }

  // ================= texto extraído =================
  var OCR_DIA = 300;
  function n2_(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 10) / 10 : 0; }
  function textDoc_(mat) {
    var fileId = mat.texto_json_id, doc = null;
    if (fileId) { try { doc = Utils.parseJson(DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8'), null); } catch (e) { fileId = null; } }
    return { id: fileId, doc: doc };
  }
  /** Mesmo arquivo (mesma versão ou mesmo hash): o texto e o OCR já feitos servem. */
  function sameFile_(doc, mat) { return doc && (doc.arquivo_id === mat.arquivo_id || (mat.hash && doc.hash === mat.hash)); }

  /**
   * Guarda o texto das páginas (camada nativa ou OCR) num JSON no Drive, um por material.
   * p.ocr = { "<pág>": { motor, conf, angulo, palavras: [[texto,x,y,l,a], …] } } guarda as coordenadas para a camada
   * de texto do leitor e evita refazer o OCR da página.
   */
  function textSave(p) {
    var mat = matFor_(p.material_id, p.arquivo_id), key = 'textos', cur = textDoc_(mat), fileId = cur.id;
    var doc = sameFile_(cur.doc, mat) ? cur.doc : { material_id: mat.id, arquivo_id: mat.arquivo_id, paginas: {}, sem_texto: [] };
    doc.arquivo_id = mat.arquivo_id; doc.hash = mat.hash || doc.hash || ''; doc.ocr = doc.ocr || {}; doc.sem_texto = doc.sem_texto || [];
    Object.keys(p.paginas || {}).forEach(function (pg) {
      var t = String(p.paginas[pg] || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 20000), n = Number(pg);
      if (t) { doc.paginas[pg] = t; doc.sem_texto = doc.sem_texto.filter(function (x) { return x !== n; }); }
      else if (!doc.paginas[pg] && doc.sem_texto.indexOf(n) < 0) doc.sem_texto.push(n);
    });
    Object.keys(p.ocr || {}).forEach(function (pg) {
      var o = p.ocr[pg] || {}, ws = (Array.isArray(o.palavras) ? o.palavras : []).slice(0, 4000).map(function (w) { return [String(w[0] || '').slice(0, 60), n2_(w[1]), n2_(w[2]), n2_(w[3]), n2_(w[4])]; });
      doc.ocr[pg] = { motor: String(o.motor || '').slice(0, 60), conf: o.conf == null ? null : Utils.clamp(n2_(o.conf), 0, 100), angulo: n2_(o.angulo), palavras: ws, em: Utils.nowIso() };
    });
    var json = JSON.stringify(doc);
    if (fileId) DriveApp.getFileById(fileId).setContent(json);
    else fileId = folder_(key).createFile(Utilities.newBlob(json, 'application/json', 'texto_' + mat.codigo + '.json')).getId();
    var n = Object.keys(doc.paginas).length;
    T('est_materiais').update(mat.id, { texto_json_id: fileId, texto_paginas: n, paginas: p.total ? Number(p.total) : mat.paginas }, { silent: true });
    if (Object.keys(p.ocr || {}).length) AppLog.info('estudos', 'ocr', 'OCR de ' + Object.keys(p.ocr).length + ' página(s) de ' + mat.codigo + ' guardado');
    return { paginas_com_texto: n, sem_texto: doc.sem_texto.length, paginas_ocr: Object.keys(doc.ocr).length };
  }

  /** Documento de texto do material, ou de outro material do usuário com o mesmo arquivo (hash), para nunca repetir o OCR. */
  function textDocFor_(mat) {
    var cur = textDoc_(mat);
    if (sameFile_(cur.doc, mat)) return cur.doc;
    if (!mat.hash) return null;
    var outros = T('est_materiais').list().filter(function (m) { return m.id !== mat.id && m.hash === mat.hash && m.texto_json_id; });
    for (var i = 0; i < outros.length; i++) { var d = textDoc_(outros[i]).doc; if (d && (d.hash === mat.hash || d.arquivo_id === outros[i].arquivo_id)) return d; }
    return null;
  }

  /** Texto das páginas (para a busca do Telegram, a IA, a leitura do edital). Diz quando o documento ainda não tem texto. */
  function textOf(mat, range, comOcr) {
    var doc = textDocFor_(mat);
    if (!doc) return { disponivel: false, paginas: {} };
    var set = range ? Studies.rangesToSet_(range) : null, out = {}, ocr = {};
    Object.keys(doc.paginas || {}).forEach(function (k) { if (!set || set[k]) out[k] = doc.paginas[k]; });
    if (comOcr) Object.keys(doc.ocr || {}).forEach(function (k) { if (!set || set[k]) ocr[k] = doc.ocr[k]; });
    var r = { disponivel: true, paginas: out, sem_texto: doc.sem_texto || [], paginas_ocr: Object.keys(doc.ocr || {}).map(Number) };
    if (comOcr) r.ocr = ocr;
    return r;
  }
  function textGet(p) { var mat = Studies.own('est_materiais', p.material_id, 'Material'); return textOf(mat, p.paginas, !!p.ocr); }

  /** OCR de uma página pelo Google Drive (alternativa ao OCR do aparelho). Recebe a página como PNG; nada fica guardado além do texto. */
  function ocrPage(p) {
    var mat = Studies.own('est_materiais', p.material_id, 'Material'), png = String(p.png || '');
    if (!png || png.length > 8 * 1024 * 1024) throw Utils.error('VALIDATION', 'Imagem da página ausente ou grande demais (máx. 6 MB).', 'png');
    var props = PropertiesService.getScriptProperties(), k = 'ocrdia:' + Auth.email() + ':' + Utils.fmt(new Date(), 'yyyy-MM-dd'), usado = Number(props.getProperty(k) || 0);
    if (usado >= OCR_DIA) throw Utils.error('LIMIT', 'Limite diário de OCR pelo Google Drive atingido (' + OCR_DIA + ' páginas). Use o OCR do aparelho ou tente amanhã.');
    var blob = Utilities.newBlob(Utilities.base64Decode(png), 'image/png', 'pagina_' + (p.pagina || 1) + '.png');
    var t0 = Date.now(), texto = Ocr.blobText(blob, 'ocr_' + mat.codigo + '_p' + (p.pagina || 1));
    props.setProperty(k, String(usado + 1));
    return { texto: String(texto).slice(0, 20000), motor: 'drive', ms: Date.now() - t0 };
  }

  // ================= exportações e versões =================
  /** Exportação atual do material para o tipo (a mais recente que não está na lixeira). */
  function exportOf_(materialId, tipo) {
    return T('est_exportacoes').list().filter(function (x) { return x.material_id === materialId && x.tipo === tipo; })
      .sort(function (a, b) { return Number(b.revisao) - Number(a.revisao) || (a.updated_at < b.updated_at ? 1 : -1); })[0] || null;
  }
  /** Registra a cópia anotada que o app gerou (revisão exata das anotações). Um registro por material e tipo: atualiza. */
  function exportRegister(p) {
    var mat = Studies.own('est_materiais', p.material_id, 'Material');
    var arq = ownArq_(p.arquivo_id), tipo = p.tipo || 'anotado';
    var row = annRow_(mat.id, mat.arquivo_id), atual = row ? Number(row.revisao) : 0, rev = Number(p.revisao);
    if (!(rev >= 0) || rev > atual) throw Utils.error('VALIDATION', 'Salve as anotações antes de exportar (revisão ' + rev + ' ainda não chegou ao servidor).');
    var dados = { revisao: rev, arquivo_id: arq.id, hash: arq.hash, tamanho_bytes: arq.tamanho_bytes, titulo: arq.nome };
    var ex = exportOf_(mat.id, tipo), e;
    if (ex) {
      if (ex.arquivo_id !== arq.id) { var velho = T('arquivos').get(ex.arquivo_id); if (velho && !velho.deleted_at && velho.drive_id !== arq.drive_id) dupTrash_(velho, 'substituído pela cópia nova'); }
      e = T('est_exportacoes').update(ex.id, dados, { silent: true });
    } else e = T('est_exportacoes').insert(Object.assign({ material_id: mat.id, tipo: tipo }, dados));
    return { exportacao: e, atual: rev === atual };
  }

  /** Exportação mais recente e se ela corresponde à revisão atual das anotações. */
  function latestExport(mat) {
    var row = annRow_(mat.id, mat.arquivo_id), atual = row ? Number(row.revisao) : 0;
    var e = T('est_exportacoes').list().filter(function (x) { return x.material_id === mat.id && x.tipo === 'anotado'; }).sort(function (a, b) { return Number(b.revisao) - Number(a.revisao) || (a.created_at < b.created_at ? 1 : -1); })[0] || null;
    return { exportacao: e, revisao_atual: atual, atualizada: !!e && Number(e.revisao) === atual, tem_anotacoes: !!row && Number(row.total) > 0 };
  }

  /** Nova versão do material (novo arquivo). As anotações da versão antiga ficam onde estão. */
  function newVersion(p) {
    var old = Studies.own('est_materiais', p.material_id, 'Material');
    var arq = ownArq_(p.arquivo_id);
    if (arq.id === old.arquivo_id) throw Utils.error('VALIDATION', 'É o mesmo arquivo da versão atual.');
    var fields = ['titulo', 'descricao', 'autor', 'tipo', 'disciplina_id', 'assunto_ids', 'concurso_ids', 'tags', 'favorito'];
    var row = { versao: (old.versao || 1) + 1, versao_de: old.id, arquivo_id: arq.id, hash: arq.hash, tamanho_bytes: arq.tamanho_bytes, data_ref: p.data_ref || Utils.today(), situacao: 'a_estudar', origem: 'app', codigo: null };
    fields.forEach(function (k) { row[k] = old[k]; });
    var max = 0; T('est_materiais').list({ withDeleted: true }).forEach(function (r) { var m = String(r.codigo || '').match(/^M(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
    row.codigo = 'M' + (max + 1);
    var nova = T('est_materiais').insert(row);
    T('est_materiais').update(old.id, { situacao: 'arquivado' });
    return { material: nova, anterior: old.id };
  }

  function trashMaterial(p) {
    var mat = Studies.own('est_materiais', p.material_id, 'Material');
    // o original continua no Drive: a lixeira do Prumo é reversível (Restaurar)
    return { material: T('est_materiais').softDelete(mat.id) };
  }

  // ================= backup dos arquivos de Estudos =================
  /**
   * Manifesto (todos os arquivos, anotações, textos e exportações com hash) + cópia dos JSONs de anotação
   * e, sem duplicar, dos originais (uma cópia por hash). Chamado pelo backup semanal.
   */
  function backup(budgetMs) {
    var t0 = Date.now(), dir = Setup.subfolder('backups', 'estudos-arquivos'), dirAnn = Setup.subfolder('backups', 'estudos-anotacoes');
    var have = {}, it = dir.getFiles();
    while (it.hasNext()) { var f = it.next(); var m = f.getName().match(/^([a-f0-9]{64})/); if (m) have[m[1]] = f.getId(); }
    var arqs = T('arquivos').list().filter(function (a) { return a.modulo === 'estudos'; });
    var copiados = 0, pend = 0, faltando = [];
    arqs.forEach(function (a) {
      if (!a.hash || have[a.hash]) return;
      if (Date.now() - t0 > budgetMs) { pend++; return; }
      try { DriveApp.getFileById(a.drive_id).makeCopy(a.hash + ' ' + a.nome, dir); copiados++; have[a.hash] = 1; }
      catch (e) { faltando.push(a.nome); }
    });
    var anot = T('est_pdf_anot').list(), jsons = 0, temAnn = {}, ita = dirAnn.getFiles();
    while (ita.hasNext()) { var fa = ita.next(); temAnn[fa.getName()] = 1; }
    anot.forEach(function (r) {
      if (!r.json_drive_id || Date.now() - t0 > budgetMs) return;
      // uma cópia por material e revisão: a mesma revisão não é copiada de novo na semana seguinte
      var nome = 'anotacoes_' + r.material_id + '_rev' + r.revisao + '.json';
      if (temAnn[nome]) return;
      try { var b = DriveApp.getFileById(r.json_drive_id).getBlob(); dirAnn.createFile(Utilities.newBlob(b.getBytes(), 'application/json', nome)); jsons++; temAnn[nome] = 1; } catch (e) { faltando.push('anotações ' + r.material_id); }
    });
    var manifest = { gerado_em: Utils.nowIso(), email: Auth.email(), arquivos: arqs.map(function (a) { return { id: a.id, drive_id: a.drive_id, nome: a.nome, hash: a.hash, bytes: a.tamanho_bytes, copia: !!have[a.hash] }; }),
      anotacoes: anot.map(function (r) { return { material_id: r.material_id, arquivo_id: r.arquivo_id, json_drive_id: r.json_drive_id, revisao: r.revisao }; }),
      textos: T('est_materiais').list().filter(function (m) { return m.texto_json_id; }).map(function (m) { return { material_id: m.id, texto_json_id: m.texto_json_id }; }),
      exportacoes: T('est_exportacoes').list().map(function (e) { return { id: e.id, material_id: e.material_id, arquivo_id: e.arquivo_id, revisao: e.revisao }; }) };
    Setup.subfolder('backups', 'estudos-manifestos').createFile(Utilities.newBlob(JSON.stringify(manifest), 'application/json', 'manifesto_' + Utils.sha256(Auth.email()).slice(0, 8) + '_' + Utils.fmt(new Date(), 'yyyyMMdd_HHmm') + '.json'));
    if (copiados || jsons || faltando.length) AppLog.info('estudos', 'backup', copiados + ' original(is) copiado(s), ' + jsons + ' arquivo(s) de anotações, ' + pend + ' para a próxima vez' + (faltando.length ? ', faltando: ' + faltando.slice(0, 5).join('; ') : ''));
    return { copiados: copiados, anotacoes: jsons, pendentes: pend, faltando: faltando };
  }

  // ================= duplicados e órfãos =================
  function dupTrash_(arq, motivo) {
    try { DriveApp.getFileById(arq.drive_id).setTrashed(true); } catch (e) { /* já não está no Drive */ }
    T('arquivos').softDelete(arq.id);
    AppLog.info('estudos', 'duplicado', 'Arquivo ' + arq.nome + ' para a lixeira (' + motivo + ')');
  }
  /** Referências vivas a arquivos (originais dos materiais, cópias atuais, imagens de questões e cartões). */
  function refs_() {
    var r = {};
    T('est_materiais').list().forEach(function (m) { if (m.arquivo_id) r[m.arquivo_id] = 'material ' + (m.codigo || ''); });
    T('est_questoes').list().forEach(function (q) { if (q.imagem_arquivo_id) r[q.imagem_arquivo_id] = 'questão ' + (q.codigo || ''); });
    T('est_flashcards').list().forEach(function (c) { if (c.imagem_arquivo_id) r[c.imagem_arquivo_id] = 'flashcard'; if (c.audio_arquivo_id) r[c.audio_arquivo_id] = 'flashcard'; });
    return r;
  }
  /**
   * Duplicados: cópias anotadas antigas do mesmo material (fica a da revisão mais nova) e arquivos com o mesmo
   * conteúdo (hash) que nada usa. Nunca lista a versão atual nem um original de material.
   */
  function dupScan() {
    var itens = [], usados = refs_(), arqs = T('arquivos').list().filter(function (a) { return a.modulo === 'estudos'; });
    var byId = {}; arqs.forEach(function (a) { byId[a.id] = a; });
    var grupos = {};
    T('est_exportacoes').list().forEach(function (e) { var k = e.material_id + '|' + e.tipo; (grupos[k] = grupos[k] || []).push(e); });
    var atuais = {};
    Object.keys(grupos).forEach(function (k) {
      var l = grupos[k].sort(function (a, b) { return Number(b.revisao) - Number(a.revisao) || (a.updated_at < b.updated_at ? 1 : -1); });
      atuais[l[0].arquivo_id] = 1;
      l.slice(1).forEach(function (e) {
        var a = byId[e.arquivo_id];
        if (!a || usados[a.id] || atuais[a.id]) return;
        var mat = T('est_materiais').get(e.material_id);
        itens.push({ id: a.id, exportacao_id: e.id, nome: a.nome, bytes: Number(a.tamanho_bytes) || 0, tipo: 'cópia ' + e.tipo + ' antiga', motivo: 'revisão ' + e.revisao + ' (a atual é ' + l[0].revisao + ')', material: mat ? mat.codigo + ' · ' + mat.titulo : '' });
      });
    });
    var porHash = {};
    arqs.forEach(function (a) { if (a.hash) (porHash[a.hash] = porHash[a.hash] || []).push(a); });
    Object.keys(porHash).forEach(function (h) {
      var l = porHash[h]; if (l.length < 2) return;
      var fica = l.filter(function (a) { return usados[a.id] || atuais[a.id]; })[0] || l.sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; })[0];
      l.forEach(function (a) {
        if (a.id === fica.id || usados[a.id] || atuais[a.id] || itens.some(function (x) { return x.id === a.id; })) return;
        itens.push({ id: a.id, nome: a.nome, bytes: Number(a.tamanho_bytes) || 0, tipo: 'mesmo conteúdo', motivo: 'igual a ' + fica.nome, material: '' });
      });
    });
    return { itens: itens, bytes: itens.reduce(function (s, x) { return s + x.bytes; }, 0) };
  }
  /** Manda para a lixeira (Drive e app) só o que a varredura atual aponta como duplicado. */
  function dupClean(p) {
    var ids = (p.ids || []).map(String), scan = dupScan(), ok = {}, out = [], bytes = 0;
    scan.itens.forEach(function (x) { ok[x.id] = x; });
    ids.forEach(function (id) {
      var x = ok[id]; if (!x) return;
      dupTrash_(T('arquivos').get(id), x.motivo);
      if (x.exportacao_id) T('est_exportacoes').softDelete(x.exportacao_id);
      out.push(id); bytes += x.bytes;
    });
    AppLog.audit('estudos', 'limpar_duplicados', 'arquivos', null, { total: out.length, bytes: bytes });
    return { removidos: out, bytes: bytes };
  }
  function dupRestore(p) {
    var n = 0;
    (p.ids || []).forEach(function (id) {
      var a = T('arquivos').list({ withDeleted: true }).filter(function (x) { return x.id === id; })[0]; if (!a || !a.deleted_at) return;
      try { DriveApp.getFileById(a.drive_id).setTrashed(false); } catch (e) { /* sem o arquivo no Drive */ }
      T('arquivos').restore(id);
      T('est_exportacoes').list({ withDeleted: true }).filter(function (e) { return e.arquivo_id === id && e.deleted_at; }).forEach(function (e) { T('est_exportacoes').restore(e.id); });
      n++;
    });
    return { restaurados: n };
  }
  /** Órfãos: registros de arquivo sem uso e arquivos nas pastas de Estudos que o app não conhece. */
  function orphans() {
    var usados = refs_(), conhecidos = {}, regs = [], soltos = [];
    T('est_exportacoes').list().forEach(function (e) { usados[e.arquivo_id] = 1; });
    var arqs = T('arquivos').list().filter(function (a) { return a.modulo === 'estudos'; });
    arqs.forEach(function (a) { conhecidos[a.drive_id] = 1; if (!usados[a.id]) regs.push({ id: a.id, nome: a.nome, bytes: Number(a.tamanho_bytes) || 0 }); });
    T('est_pdf_anot').list().forEach(function (r) { if (r.json_drive_id) conhecidos[r.json_drive_id] = 1; });
    T('est_materiais').list().forEach(function (m) { if (m.texto_json_id) conhecidos[m.texto_json_id] = 1; });
    ['originais', 'exportacoes', 'anotacoes', 'textos'].forEach(function (sub) {
      try { var it = folder_(sub).getFiles(); while (it.hasNext()) { var f = it.next(); if (!conhecidos[f.getId()] && !f.isTrashed()) soltos.push({ drive_id: f.getId(), nome: f.getName(), pasta: sub, bytes: f.getSize ? f.getSize() : 0 }); } } catch (e) { /* pasta ainda não existe */ }
    });
    return { registros: regs, no_drive: soltos };
  }

  /** Diagnóstico: arquivos da biblioteca que sumiram do Drive e se há cópia no backup para restaurar. */
  function checkFiles(p) {
    var dir = Setup.subfolder('backups', 'estudos-arquivos'), copias = {}, it = dir.getFiles();
    while (it.hasNext()) { var f = it.next(); var m = f.getName().match(/^([a-f0-9]{64})/); if (m) copias[m[1]] = f; }
    var out = [];
    T('est_materiais').list().forEach(function (mat) {
      if (!mat.arquivo_id) return;
      var a = T('arquivos').get(mat.arquivo_id), ok = false;
      if (a) { try { ok = !DriveApp.getFileById(a.drive_id).isTrashed(); } catch (e) { ok = false; } }
      if (!ok) {
        var item = { material_id: mat.id, codigo: mat.codigo, titulo: mat.titulo, copia: !!(a && copias[a.hash]) };
        if (p && p.restaurar && item.copia) { var nf = copias[a.hash].makeCopy(a.nome, pastaDe_(caminho_(mat, a))); T('arquivos').update(a.id, { drive_id: nf.getId() }); item.restaurado = true; }
        out.push(item);
      }
    });
    return { faltando: out };
  }

  return { upStart: upStart, upChunk: upChunk, fileChunk: fileChunk, annGet: annGet, annSave: annSave, textSave: textSave, textGet: textGet, textOf: textOf, ocrPage: ocrPage,
    exportRegister: exportRegister, latestExport: latestExport, dupScan: dupScan, dupClean: dupClean, place_: place_, reorganize: reorganize, caminho_: caminho_, CATEGORIAS: CATEGORIAS, dupRestore: dupRestore, orphans: orphans, exportOf_: exportOf_, newVersion: newVersion, trashMaterial: trashMaterial, backup: backup, checkFiles: checkFiles, folder_: folder_, readDoc_: readDoc_, annRow_: annRow_ };
})();
