// Simulador mínimo do Apps Script para testar o Prumo localmente.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = process.env.PRUMO_SRC || path.join(__dirname, '..', 'src');
const log = (...a) => { if (process.env.GAS_VERBOSE) console.log('[gas]', ...a); };

// ---------- Planilha ----------
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined || v === null ? '' : v); } out.push(row); }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error(`setValues: dimensões ${vals.length}x${vals[0].length} != ${this.nr}x${this.nc}`);
    for (let i = 0; i < this.nr; i++) {
      const ri = this.r - 1 + i;
      while (this.sh.data.length <= ri) this.sh.data.push([]);
      for (let j = 0; j < this.nc; j++) {
        let v = vals[i][j];
        if (v instanceof Date) v = new Date(v.getTime());
        if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
        if (typeof v === 'object' && v !== null && !(v instanceof Date)) throw new Error('setValues com objeto: ' + JSON.stringify(v));
        this.sh.data[ri][this.c - 1 + j] = v;
      }
    }
    this.sh.maxRows = Math.max(this.sh.maxRows, this.sh.data.length);
    return this;
  }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = this.sh.data[this.r - 1 + i]; if (row) row[this.c - 1 + j] = ''; } return this; }
  setNumberFormat() { this.sh.calls++; return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setDataValidation() { this.sh.calls++; return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; this.maxCols = 26; this.calls = 0; this.hidden = false; }
  getName() { return this.name; }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.data.forEach((r) => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== undefined && r[j] !== null) { m = Math.max(m, j + 1); break; } }); return m; }
  getMaxRows() { return this.maxRows; } getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(after, n) { this.maxCols += n; }
  getRange(r, c, nr = 1, nc = 1) { if (c + nc - 1 > this.maxCols) throw new Error(`Coluna ${c + nc - 1} fora dos limites (${this.maxCols}) em ${this.name}`); return new Range(this, r, c, nr, nc); }
  getDataRange() { const lr = Math.max(1, this.getLastRow()), lc = Math.max(1, this.getLastColumn()); return new Range(this, 1, 1, lr, lc); }
  setFrozenRows() { } setColumnWidth() { } hideSheet() { this.hidden = true; } setTabColor() { }
}
class Spreadsheet {
  constructor() { this.sheets = [new Sheet('Página1')]; }
  getName() { return 'Finanças'; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
}
const SS = new Spreadsheet();

// ---------- Cache ----------
const cache = new Map();
const CacheService = { getScriptCache: () => ({
  get: (k) => (cache.has(k) ? cache.get(k) : null),
  put: (k, v) => { if (String(v).length > 100000) throw new Error('Argument too large: value'); cache.set(k, String(v)); },
  getAll: (keys) => { const o = {}; keys.forEach((k) => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
  putAll: (obj) => Object.entries(obj).forEach(([k, v]) => { if (String(v).length > 100000) throw new Error('Argument too large'); cache.set(k, String(v)); }),
  remove: (k) => cache.delete(k)
}) };

// ---------- Utilities ----------
const toSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const toBuf = (arr) => Buffer.from(arr.map((b) => (b < 0 ? b + 256 : b)));
class Blob {
  constructor(bytes, mime, name) { this.bytes = Buffer.isBuffer(bytes) ? bytes : (typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : toBuf(bytes)); this.mime = mime; this.name = name; }
  getBytes() { return toSigned(this.bytes); } getDataAsString() { return this.bytes.toString('utf8'); }
  getContentType() { return this.mime; } setContentType(m) { this.mime = m; return this; } getName() { return this.name; } setName(n) { this.name = n; return this; }
}
const pad = (n, l = 2) => String(n).padStart(l, '0');
function formatDate(d, tz, pattern) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-';
  const tokens = { yyyy: d.getFullYear(), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()), H: d.getHours(), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()), XXX: `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}` };
  return pattern.replace(/'([^']*)'|yyyy|MM|dd|HH|H|mm|ss|XXX/g, (m, lit) => (lit !== undefined ? lit : tokens[m]));
}
const Utilities = {
  getUuid: () => crypto.randomUUID(),
  formatDate,
  DigestAlgorithm: { SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8' },
  computeDigest: (alg, input) => toSigned(crypto.createHash('sha256').update(typeof input === 'string' ? Buffer.from(input, 'utf8') : toBuf(input)).digest()),
  base64Decode: (s) => toSigned(Buffer.from(s, 'base64')),
  base64EncodeWebSafe: (b) => (typeof b === 'string' ? Buffer.from(b) : toBuf(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64Encode: (b) => (typeof b === 'string' ? Buffer.from(b) : toBuf(b)).toString('base64'),
  newBlob: (data, mime, name) => new Blob(data, mime, name),
  sleep: () => {},
  unzip: () => []
};

// ---------- Drive ----------
let fileSeq = 0;
const files = new Map();
class DFile {
  constructor(blob, parent) { this.id = 'file_' + (++fileSeq); this.blob = blob; this.name = blob.name; this.parent = parent; this.trashed = false; this.created = new Date(); files.set(this.id, this); }
  getId() { return this.id; } getName() { return this.name; } setName(n) { this.name = n; return this; }
  getBlob() { return this.blob; } getThumbnail() { return null; } setTrashed(t) { this.trashed = t; } isTrashed() { return this.trashed; }
  getUrl() { return 'https://drive.google.com/file/d/' + this.id; } getMimeType() { return this.blob ? this.blob.mime : ''; } getDateCreated() { return this.created; } getLastUpdated() { return this.created; }
  makeCopy(name, folder) { const f = new DFile(this.blob && this.blob.mime !== 'application/vnd.google-apps.spreadsheet' ? new Blob(Buffer.from(this.blob.bytes), this.blob.mime, name) : new Blob('copia', 'application/vnd.google-apps.spreadsheet', name), folder); f.name = name; folder.files.push(f); return f; }
  setContent(str) { this.blob = new Blob(String(str), this.blob ? this.blob.mime : 'text/plain', this.name); return this; }
  getSize() { return this.blob && this.blob.bytes ? this.blob.bytes.length : 0; }
  moveTo(folder) { if (this.parent && this.parent.files) this.parent.files = this.parent.files.filter((x) => x !== this); folder.files.push(this); this.parent = folder; return this; }
  getParents() { const p = this.parent ? [this.parent] : []; let i = 0; return { hasNext: () => i < p.length, next: () => p[i++] }; }
  getAs(mime) { const txt = this.doc ? this.doc.text.join('\n') : ''; return new Blob(Buffer.from('%PDF-1.4\n% mock\n' + txt + '\n%%EOF', 'utf8'), mime, this.name + '.pdf'); }
}
class Folder {
  constructor(name, id) { this.name = name; this.id = id || 'folder_' + (++fileSeq); this.folders = []; this.files = []; this.trashed = false; files.set(this.id, this); }
  getId() { return this.id; } getName() { return this.name; } isTrashed() { return this.trashed; }
  getFoldersByName(n) { const list = this.folders.filter((f) => f.name === n); let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; }
  createFolder(n) { const f = new Folder(n); this.folders.push(f); return f; }
  createFile(blob) { const f = new DFile(blob, this); this.files.push(f); return f; }
  getFiles() { const list = this.files.slice(); let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; }
}
const ROOT = new Folder('Prumo uploads', '1XGLH_e6TDg8RANZdVaOOPDJgfS4f32QV');
const sheetFile = new DFile(new Blob('planilha', 'application/vnd.google-apps.spreadsheet', 'Finanças'), ROOT);
files.set('1j2P-erYooziZF-7b8pMUAlvFO6bBlukgmJqIuSANW3I', sheetFile);
const DriveApp = {
  getFolderById: (id) => { const f = files.get(id); if (!f) throw new Error('Pasta não encontrada ' + id); return f; },
  getFileById: (id) => { const f = files.get(id); if (!f) throw new Error('Arquivo não encontrado ' + id); return f; },
  searchFiles: () => ({ hasNext: () => false })
};
const OCR_TEXT = {
  recibo: 'SUPERMERCADO BOM PRECO LTDA\nCNPJ 12.345.678/0001-90\nRUA DAS FLORES, 100\nCUPOM FISCAL ELETRONICO - SAT\n29/10/2026 18:42:10\n1 789100000123 ARROZ TIPO 1 5KG 1 UN X 27,90 27,90\n2 789100000456 FEIJAO CARIOCA 1KG 1 UN X 8,49 8,49\n3 789100000789 CAFE TORRADO 500G 1 UN X 18,90 18,90\nSUBTOTAL 55,29\nVALOR A PAGAR R$ 55,29\nCARTAO DE CREDITO 55,29',
  rotulo: 'INFORMAÇÃO NUTRICIONAL\nPorções por embalagem: 10\nPorção de 30 g (1 xícara)\n100 g 30 g %VD*\nValor energético (kcal) 380 114 6\nCarboidratos totais (g) 72 22 7\nAçúcares totais (g) 12 3,6\nProteínas (g) 9,5 2,9 6\nGorduras totais (g) 6,2 1,9 3\nGorduras saturadas (g) 1,1 0,3 2\nGorduras trans (g) 0 0 0\nFibras alimentares (g) 8,4 2,5 10\nSódio (mg) 210 63 3'
};
let lastOcrKind = 'recibo';
const docs = new Map();
const Drive = { Files: {
  create: (res, blob) => { const id = 'doc_' + (++fileSeq); docs.set(id, /rotulo|label/i.test(blob.name || '') || lastOcrKind === 'rotulo' ? OCR_TEXT.rotulo : OCR_TEXT.recibo); files.set(id, new DFile(new Blob('', 'doc', 'ocr'), ROOT)); files.get(id).id = id; return { id }; }
} };
const createdDocs = [];
const DocumentApp = { openById: (id) => ({ getBody: () => ({ getText: () => docs.get(id) || '' }) }),
  ParagraphHeading: { HEADING1: 'H1', HEADING2: 'H2' },
  create: (name) => { const f = new DFile(new Blob('', 'application/vnd.google-apps.document', name), ROOT); ROOT.files.push(f); f.doc = { text: [] }; createdDocs.push(f);
    const par = { setHeading() { return par; } };
    const body = { appendParagraph: (t) => { f.doc.text.push(String(t)); return par; }, appendTable: (rows) => { rows.forEach((r) => f.doc.text.push(r.join(' | '))); return {}; } };
    return { getId: () => f.id, getBody: () => body, saveAndClose: () => {} }; } };

// ---------- Outros serviços ----------
const props = new Map();
const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k), setProperties: (o) => Object.entries(o).forEach(([k, v]) => props.set(k, String(v))), getProperties: () => Object.fromEntries(props) }) };
const triggers = [];
const chain = (name) => { const t = { getHandlerFunction: () => name }; const c = new Proxy({}, { get: (_, p) => (p === 'create' ? () => { triggers.push(t); return t; } : () => c) }); return c; };
const ScriptApp = { getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1), newTrigger: chain, WeekDay: { SUNDAY: 'SUNDAY' }, getScriptId: () => 'script', getOAuthToken: () => 'token', getService: () => ({ getUrl: () => 'http://localhost:8765/exec' }) };
const mails = [];
const MailApp = { sendEmail: (o) => mails.push(o), getRemainingDailyQuota: () => 97 };
const pushCalls = [];
const graphCalls = [];
const tgCalls = [];
let tgHandler = (method, body) => ({ ok: true, result: {} });
let graphHandler = () => ({ code: 200, body: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.' + Math.random().toString(36).slice(2) }] } });
let pushStatus = 201;
const uploads = new Map(); let upSeq = 0; let tgFiles = {}; let aiHandler = null; const aiCalls = []; const driveCalls = [];
const resp = (code, body, headers, content) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)), getHeaders: () => headers || {}, getContent: () => content || [] });
const UrlFetchApp = { fetch: (url, opts) => {
  opts = opts || {};
  if (/api\.telegram\.org\/file\/bot/.test(url)) { const path = url.split('/').slice(-2).join('/'); tgCalls.push({ url, method: 'download', body: {} }); const b = tgFiles[path]; return b ? resp(200, '', {}, toSigned(b)) : resp(404, 'not found'); }
  if (/api\.telegram\.org/.test(url)) { const method = url.split('/').pop(); const body = typeof opts.payload === 'object' && opts.payload !== null && !Array.isArray(opts.payload) ? Object.assign({}, opts.payload) : JSON.parse(opts.payload || '{}'); tgCalls.push({ url, method, body }); const r = tgHandler(method, body, url); return resp(r.ok ? 200 : (r.error_code || 400), r); }
  if (/upload\/drive\/v3\/files\/[^/?]+\?uploadType=resumable/.test(url)) { const fid = decodeURIComponent(url.match(/files\/([^?]+)/)[1]); const f0 = files.get(fid); if (!f0 || f0.trashed) return resp(404, 'not found'); const id = 'sess' + (++upSeq); const meta = JSON.parse(opts.payload || '{}'); uploads.set(id, { meta, parts: [], total: Number(opts.headers['X-Upload-Content-Length']), target: fid }); driveCalls.push({ op: 'start-update', id: fid, meta, method: opts.method }); return resp(200, '', { Location: 'https://upload.mock/session/' + id }); }
  if (/upload\/drive\/v3\/files\?uploadType=resumable/.test(url)) { const id = 'sess' + (++upSeq); const meta = JSON.parse(opts.payload); uploads.set(id, { meta, parts: [], total: Number(opts.headers['X-Upload-Content-Length']) }); driveCalls.push({ op: 'start', meta }); return resp(200, '', { Location: 'https://upload.mock/session/' + id }); }
  if (/^https:\/\/upload\.mock\/session\//.test(url)) {
    const id = url.split('/').pop(), up = uploads.get(id), m = String(opts.headers['Content-Range']).match(/bytes (\d+)-(\d+)\/(\d+)/);
    const buf = toBuf(opts.payload); up.parts.push(buf); driveCalls.push({ op: 'chunk', start: +m[1], end: +m[2] });
    if (+m[2] + 1 < +m[3]) return resp(308, '', { Range: 'bytes=0-' + m[2] });
    const all = Buffer.concat(up.parts);
    if (up.target) { const f1 = files.get(up.target); f1.blob = new Blob(all, f1.blob ? f1.blob.mime : 'application/octet-stream', up.meta.name || f1.name); if (up.meta.name) f1.name = up.meta.name; driveCalls.push({ op: 'updated', id: f1.id }); return resp(200, { id: f1.id, name: f1.name, size: String(all.length) }); }
    const folder = files.get(up.meta.parents[0]); const f = folder.createFile(new Blob(all, up.meta.mimeType, up.meta.name));
    return resp(200, { id: f.id, name: f.name, size: String(all.length) });
  }
  if (/www\.googleapis\.com\/drive\/v3\/files\/[^/?]+\?alt=media/.test(url)) {
    const id = decodeURIComponent(url.match(/files\/([^?]+)/)[1]), f = files.get(id); driveCalls.push({ op: 'read', id, range: opts.headers && opts.headers.Range });
    if (!f || f.trashed) return resp(404, 'not found');
    const r = String((opts.headers || {}).Range || '').match(/bytes=(\d+)-(\d+)/), b = f.blob.bytes; const part = r ? b.slice(+r[1], +r[2] + 1) : b;
    return resp(r ? 206 : 200, '', { 'Content-Range': r ? 'bytes ' + r[1] + '-' + r[2] + '/' + b.length : '' }, toSigned(part));
  }
  if (/api\.anthropic\.com|\/chat\/completions|\/messages$|\/models$/.test(url) && !/graph\.facebook/.test(url)) { const body = opts.payload ? JSON.parse(opts.payload) : null; aiCalls.push({ url, body, headers: opts.headers || {}, method: opts.method }); const r = aiHandler ? aiHandler(url, body, opts.headers || {}) : { code: 500, body: {} }; return resp(r.code, r.body); }
  if (/graph\.facebook\.com/.test(url)) { graphCalls.push({ url, opts }); const r = graphHandler(url, opts || {}); return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) }; }
  if (/push|fcm|web\.push/.test(url)) { pushCalls.push({ url, opts }); return { getResponseCode: () => pushStatus, getContentText: () => '' }; }
  const code = (url.match(/product\/(\d+)/) || [])[1];
  const body = code === '7891000100103' ? { status: 1, product: { product_name: 'Leite condensado', brands: 'Marca Teste', serving_size: '20 g', serving_quantity: 20, nutriments: { 'energy-kcal_100g': 321, proteins_100g: 7.7, carbohydrates_100g: 55, fat_100g: 7.8, 'saturated-fat_100g': 4.8, fiber_100g: 0, sugars_100g: 55, sodium_100g: 0.11, calcium_100g: 0.26 } } } : { status: 0 };
  return { getResponseCode: () => (body.status ? 200 : 404), getContentText: () => JSON.stringify(body) };
} };
const Sheets = { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((r) => {
  const name = r.replace(/^'|'$/g, ''); const sh = SS.getSheetByName(name); if (!sh) throw new Error('Unable to parse range: ' + r);
  const lr = sh.getLastRow(), lc = sh.getLastColumn(); const vals = lr ? sh.getRange(1, 1, lr, lc).getValues().map((row) => { const c = row.slice(); while (c.length && c[c.length - 1] === '') c.pop(); return c; }) : [];
  return { values: vals };
}) }) } } };

const context = {
  console, SpreadsheetApp: { openById: () => SS, newDataValidation: () => { const b = new Proxy({}, { get: (_, p) => (p === 'build' ? () => ({}) : () => b) }); return b; } },
  CacheService, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities, Session: { getActiveUser: () => ({ getEmail: () => 'voce@exemplo.com' }), getEffectiveUser: () => ({ getEmail: () => 'voce@exemplo.com' }) },
  PropertiesService, DriveApp, Drive, DocumentApp, MailApp, ScriptApp, UrlFetchApp, Sheets,
  HtmlService: { XFrameOptionsMode: { DEFAULT: 1, ALLOWALL: 2 } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return s; } }) }, MimeType: { GOOGLE_DOCS: 'application/vnd.google-apps.document' }
};
vm.createContext(context);
const gsFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort((a, b) => (a === 'Config.gs' ? -1 : b === 'Config.gs' ? 1 : a.localeCompare(b)));
gsFiles.forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), context, { filename: f }));

/** Faz login completo (senha + código do e-mail) e devolve o token. */
function devLogin(email = 'voce@exemplo.com', senha = 'junio2019@') {
  context.Db.resetMemo();
  const r = context.api('auth.login', { email, senha }, 'teste');
  if (!r.ok) throw new Error('login: ' + JSON.stringify(r.error));
  if (r.data.token) return r.data.token;
  const code = mails[mails.length - 1].subject.slice(0, 6);
  context.Db.resetMemo();
  const v = context.api('auth.verify', { desafio: r.data.desafio, codigo: code }, 'teste');
  if (!v.ok) throw new Error('verify: ' + JSON.stringify(v.error));
  return v.data.token;
}
module.exports = { uploads, driveCalls, aiCalls, createdDocs, setTgFiles: (o) => { tgFiles = o; }, setAi: (f) => { aiHandler = f; }, ROOT, Blob, context, SS, mails, triggers, files, props, devLogin, pushCalls, graphCalls, tgCalls, setTg: (f) => { tgHandler = f; }, setGraph: (f) => { graphHandler = f; }, setPushStatus: (s) => { pushStatus = s; }, setOcrKind: (k) => { lastOcrKind = k; }, resetMemo: () => vm.runInContext('Db.resetMemo()', context) };
