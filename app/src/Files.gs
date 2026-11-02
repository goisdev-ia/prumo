/**
 * Uploads para o Drive, metadados na aba "arquivos" e leitura via servidor (o app roda como o dono,
 * então nada precisa de link público).
 */
var Files = (function () {
  var FOLDER_BY_TYPE = { comprovante: 'comprovantes', foto_perfil: 'perfil', foto_progresso: 'progresso', rotulo: 'rotulos', outro: 'outros' };

  function folderFor_(tipo) {
    var sub = FOLDER_BY_TYPE[tipo] || 'outros';
    if (sub === 'comprovantes') return Setup.subfolder('comprovantes', Utils.today().slice(0, 7));
    return Setup.folder(sub);
  }

  function safeName_(s) {
    return String(s || 'arquivo').replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 120);
  }

  /**
   * Recebe arquivo em base64 e grava no Drive.
   * @param {{nome:string, mime:string, base64:string, modulo:string=, tipo:string=, entidade:string=, entidade_id:string=}} p
   */
  function upload(p) {
    if (!p.base64) throw Utils.error('VALIDATION', 'Arquivo vazio.');
    var mime = String(p.mime || '').toLowerCase();
    if (CONFIG.UPLOAD.MIME.indexOf(mime) < 0) throw Utils.error('VALIDATION', 'Tipo de arquivo não aceito. Envie imagem ou PDF.');
    var bytes = Utilities.base64Decode(String(p.base64).replace(/^data:[^,]+,/, ''));
    var maxBytes = Number(Auth.setting('sys.upload_max_mb', CONFIG.UPLOAD.MAX_BYTES / 1048576)) * 1048576;
    if (bytes.length > maxBytes) throw Utils.error('VALIDATION', 'Arquivo acima de ' + Math.round(maxBytes / 1048576) + ' MB.');
    var tipo = p.tipo && FOLDER_BY_TYPE[p.tipo] ? p.tipo : 'outro';
    var hash = Utils.sha256Bytes(bytes);
    var t = Db.table('arquivos');
    var dup = t.list({ where: function (r) { return r.hash === hash && r.tipo === tipo; } })[0];
    if (dup && !p.entidade_id) return { arquivo: dup, duplicado: true };

    var name = safeName_(p.nome);
    var file = folderFor_(tipo).createFile(Utilities.newBlob(bytes, mime, name));
    var row = t.insert({
      drive_id: file.getId(), nome: name, mime: mime, tamanho_bytes: bytes.length,
      modulo: p.modulo || null, entidade: p.entidade || null, entidade_id: p.entidade_id || null,
      tipo: tipo, hash: hash
    });
    return { arquivo: row };
  }

  function own_(id) {
    var row = Db.table('arquivos').get(id);
    if (!row || row.deleted_at) throw Utils.error('NOT_FOUND', 'Arquivo não encontrado.');
    return row;
  }

  /** Conteúdo como data URL (imagens) com cache. PDFs devolvem miniatura quando o Drive gera. */
  function dataUrl(p) {
    var row = own_(p.id);
    var key = row.id + ':' + (p.thumb ? 't' : 'f');
    var cached = Cache.get('files', key);
    if (cached) return cached;
    var file = DriveApp.getFileById(row.drive_id);
    var blob = null;
    if (/^image\//.test(row.mime) && !p.thumb) blob = file.getBlob();
    else { try { blob = file.getThumbnail(); } catch (e) { blob = null; } }
    if (!blob && /^image\//.test(row.mime)) blob = file.getBlob();
    var out = { id: row.id, mime: row.mime, nome: row.nome, url: blob ? 'data:' + (blob.getContentType() || row.mime) + ';base64,' + Utilities.base64Encode(blob.getBytes()) : null };
    Cache.put('files', key, out, 21600);
    return out;
  }

  function rename(p) {
    var row = own_(p.id);
    var name = safeName_(p.nome);
    if (!String(p.nome || '').trim()) throw Utils.error('VALIDATION', 'Informe um nome.', 'nome');
    DriveApp.getFileById(row.drive_id).setName(name);
    return { arquivo: Db.table('arquivos').update(row.id, { nome: name }) };
  }

  function trash(p) {
    var row = own_(p.id);
    try { DriveApp.getFileById(row.drive_id).setTrashed(true); } catch (e) { AppLog.warn('arquivos', 'lixeira', 'Arquivo já não existia no Drive: ' + row.drive_id); }
    return { arquivo: Db.table('arquivos').softDelete(row.id) };
  }

  function link(p) {
    var row = own_(p.id);
    return { url: 'https://drive.google.com/file/d/' + row.drive_id + '/view' };
  }

  /** Grava um arquivo gerado (CSV/JSON) na pasta exportacoes e devolve o link. */
  function saveExport(nome, mime, conteudo) {
    var file = Setup.folder('exportacoes').createFile(Utilities.newBlob(conteudo, mime, nome));
    return { nome: nome, url: 'https://drive.google.com/file/d/' + file.getId() + '/view', drive_id: file.getId() };
  }

  return { upload: upload, dataUrl: dataUrl, rename: rename, trash: trash, link: link, saveExport: saveExport };
})();
