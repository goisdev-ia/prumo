// Prepara um <script> para o HtmlService: o Google remove comentários de forma ingênua (sem entender
// template literals com crase escapada, regex etc.) e pode cortar código válido. Aqui:
//  1) removemos nós mesmos todos os comentários (com um tokenizador de verdade);
//  2) dentro de strings, templates e regex, reescrevemos "/" vizinho de "/" ou "*" como escape (/ ou \x2F),
//     e as aspas/crases escapadas como ' " `.
// Resultado: o texto final não contém nenhum "//" nem "/*" — qualquer removedor ingênuo vira operação nula.
const fs = require('fs');
const acorn = require(require.resolve('acorn', { paths: [__dirname + '/../harness'] }));
const src = fs.readFileSync(process.argv[2], 'utf8');
const comments = [];
const tokens = [];
acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, onComment: (block, text, start, end) => comments.push([start, end, block]), onToken: tokens });
const edits = []; // [start, end, replacement]
comments.forEach(([s, e, block]) => { const t = src.slice(s, e); edits.push([s, e, block ? t.replace(/[^\n]/g, '') || ' ' : '']); });
const fixQuotes = (t) => t.replace(/\\`/g, '\\u0060').replace(/\\'/g, '\\u0027').replace(/\\"/g, '\\u0022');
const fixSlashStr = (t, esc) => { let o = ''; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '/' && (t[i + 1] === '/' || t[i + 1] === '*' || t[i - 1] === '*' || t[i - 1] === '/')) o += esc; else o += c; } return o; };
tokens.forEach((tk) => {
  const tl = tk.type.label;
  const raw = src.slice(tk.start, tk.end);
  if (tl === 'string') {
    const q = raw[0], body = raw.slice(1, -1);
    // dentro do corpo, "/" após "\" (\/) também precisa virar escape para não formar // com o vizinho
    let b = fixQuotes(body.replace(/\\\//g, '\\u002F'));
    b = fixSlashStr(b, '\\u002F');
    if (b !== body) { if (eval(q + b + q) !== eval(raw)) throw new Error('mudou o valor da string em ' + tk.start + ': ' + raw.slice(0, 80)); edits.push([tk.start, tk.end, q + b + q]); }
  } else if (tl === 'template') {
    // chunk cozido de template: raw entre ` / } e ${
    let b = fixQuotes(raw.replace(/\\\//g, '\\u002F'));
    b = fixSlashStr(b, '\\u002F');
    if (b !== raw) { if (eval('`' + b + '`') !== eval('`' + raw + '`')) throw new Error('mudou o valor do template em ' + tk.start); edits.push([tk.start, tk.end, b]); }
  } else if (tl === 'regexp') {
    const last = raw.lastIndexOf('/'), body = raw.slice(1, last), flags = raw.slice(last + 1);
    let b = body.replace(/\\\//g, '\\x2F');
    // "/" sem escape dentro de classe [..] e "*" no fim (forma */ com o delimitador)
    b = b.replace(/\//g, '\\x2F');
    if (b.endsWith('*') && !b.endsWith('\\*')) b = b.slice(0, -1) + '{0,}';
    if (b.startsWith('*')) throw new Error('regex começando com *');
    if (b !== body) { const r1 = eval(raw), r2 = eval('/' + b + '/' + flags); ['/', '//', 'a/b', 'image/png', 'x*/', 'http://x', '**', 'a'].forEach((t) => { r1.lastIndex = 0; r2.lastIndex = 0; if (r1.test(t) !== r2.test(t)) throw new Error('regex mudou: ' + raw); }); edits.push([tk.start, tk.end, '/' + b + '/' + flags]); }
  }
});
edits.sort((a, b) => b[0] - a[0]);
let out = src;
edits.forEach(([s, e, r]) => { out = out.slice(0, s) + r + out.slice(e); });
// regex dividida por operador: "a / /x/" não ocorre no código; se ocorrer, o assert do build pega.
process.stdout.write(out);
