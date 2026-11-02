/**
 * Instalador/atualizador: lê o pacote "prumo-app-*.zip" do seu Drive e grava todos os arquivos
 * neste projeto pela Apps Script API — sem colar arquivo por arquivo.
 *
 * Pré-requisitos (uma vez):
 *  1. Ative a Apps Script API em https://script.google.com/home/usersettings
 *  2. Este projeto precisa do appsscript.json do Prumo (escopo script.projects).
 *  3. Envie o .zip para qualquer pasta do seu Drive.
 * Depois: selecione instalarDoZip e clique em Executar. Recarregue o editor ao terminar.
 */
function instalarDoZip() {
  var it = DriveApp.searchFiles("title contains 'prumo-app' and trashed = false");
  var latest = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!/\.zip$/i.test(f.getName())) continue;
    if (!latest || f.getLastUpdated() > latest.getLastUpdated()) latest = f;
  }
  if (!latest) throw new Error('Nenhum arquivo "prumo-app-*.zip" encontrado no seu Drive.');

  var blobs = Utilities.unzip(latest.getBlob().setContentType('application/zip'));
  var files = [];
  blobs.forEach(function (b) {
    var full = b.getName(), name = full.split('/').pop();
    if (!name || name.charAt(0) === '.') return;
    var src = b.getDataAsString('UTF-8');
    if (name === 'appsscript.json') files.push({ name: 'appsscript', type: 'JSON', source: src });
    else if (/\.gs$/.test(name)) files.push({ name: name.replace(/\.gs$/, ''), type: 'SERVER_JS', source: src });
    else if (/\.html$/.test(name)) files.push({ name: name.replace(/\.html$/, ''), type: 'HTML', source: src });
  });
  if (!files.some(function (x) { return x.name === 'Config'; })) throw new Error('Pacote inválido: Config.gs não encontrado.');

  // Config primeiro, depois os demais em ordem alfabética (o Apps Script carrega nessa ordem).
  files.sort(function (a, b) {
    var rank = function (x) { return x.name === 'appsscript' ? 0 : x.name === 'Config' ? 1 : x.type === 'SERVER_JS' ? 2 : 3; };
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  var url = 'https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + '/content';
  var res = UrlFetchApp.fetch(url, {
    method: 'put', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ files: files })
  });
  if (res.getResponseCode() !== 200) {
    var msg = res.getContentText();
    if (/has not been used|disabled|SERVICE_DISABLED|User has not enabled/i.test(msg)) {
      throw new Error('Ative a Apps Script API em https://script.google.com/home/usersettings e rode de novo.');
    }
    throw new Error('Falha ao gravar (' + res.getResponseCode() + '): ' + msg.slice(0, 500));
  }
  console.log('Instalado a partir de ' + latest.getName() + ': ' + files.length + ' arquivos. Recarregue o editor e rode setup().');
  return files.length;
}
