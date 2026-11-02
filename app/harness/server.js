// Servidor local: monta o Index.html como o HtmlService faria e expõe google.script.run via /rpc.
const http = require('http');
const fs = require('fs');
const path = require('path');
const G = require('./gas');
const SRC = process.env.PRUMO_SRC || path.join(__dirname, '..', 'src');

const SHIM = `<script>
(function(){
  function runner(ok, fail){ return new Proxy({}, { get: function(_, p){
    if (p === 'withSuccessHandler') return function(f){ return runner(f, fail); };
    if (p === 'withFailureHandler') return function(f){ return runner(ok, f); };
    return function(){ var args = Array.prototype.slice.call(arguments);
      fetch('/rpc', { method: 'POST', body: JSON.stringify({ fn: p, args: args }) }).then(function(r){ return r.json(); })
        .then(function(j){ setTimeout(function(){ if (j.error) { fail && fail(new Error(j.error)); } else { ok && ok(j.result); } }, window.__latency || 60); })
        .catch(function(e){ fail && fail(e); }); };
  } }); }
  window.google = { script: { run: runner(null, null), url: { getLocation: function(cb){ cb({ hash: '' }); } } } };
})();
</script>`;

let DEV_TOKEN = null;
function buildIndex(url = '/') {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!= include\('([\w]+)'\) \?>/g, (m, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
  if (/<\?/.test(html.replace(/<\?xml/g, ''))) throw new Error('Sobrou scriptlet no HTML montado');
  html = html.replace('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', '/chart.js');
  html = html.replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g, '');
  let auto = '';
  if (!/[?&]login/.test(url)) {
    try { if (!DEV_TOKEN) DEV_TOKEN = G.devLogin(); } catch (e) { DEV_TOKEN = null; }
    if (DEV_TOKEN) auto = `<script>try{localStorage.setItem('prumo.auth.token', JSON.stringify(${JSON.stringify(DEV_TOKEN)}));localStorage.setItem('prumo.auth.email', '"voce@exemplo.com"')}catch(e){}</script>`;
  } else auto = "<script>try{if(!sessionStorage.getItem('lg')){sessionStorage.setItem('lg','1');localStorage.removeItem('prumo.auth.token')}}catch(e){}</script>";
  return html.replace('<head>', '<head>' + SHIM + auto);
}

function start(port = 8765) {
  const srv = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { fn, args } = JSON.parse(body);
          if (!['api', 'apiBatch'].includes(fn)) throw new Error('Função não exposta: ' + fn);
          G.resetMemo();
          const result = JSON.parse(JSON.stringify(G.context[fn](...args)));
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result }));
        } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }
    if (/[?&]push=/.test(req.url)) {
      G.resetMemo();
      const pid = new URL(req.url, 'http://x').searchParams.get('push');
      const out = G.context.doGet({ parameter: { push: pid } });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out.getContent()); return;
    }
    if (req.url.startsWith('/pwa/')) {
      let rp = req.url.split('?')[0]; if (rp.endsWith('/')) rp += 'index.html';
      const f = path.join(__dirname, '..', rp);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
      try { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); } catch (e) { res.writeHead(404); res.end(); }
      return;
    }
    if (req.url.startsWith('/ocr/')) {
      const k = req.url.split('?')[0].slice(5), NMo = path.join(__dirname, 'node_modules');
      const f = k.startsWith('core/') ? path.join(NMo, 'tesseract.js-core', k.slice(5)) : k.startsWith('lang/') ? path.join(NMo, '@tesseract.js-data/por/4.0.0_best_int', k.slice(5)) : path.join(__dirname, 'vendor/tesseract7', k);
      const ty = f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
      try { const body = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': ty, 'Access-Control-Allow-Origin': '*' }); res.end(body); } catch (e) { res.writeHead(404); res.end(); }
      return;
    }
    if (req.url === '/chart.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js'))); return; }
    try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(buildIndex(req.url)); }
    catch (e) { res.writeHead(500); res.end(e.message); }
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}
module.exports = { start, G };
if (require.main === module) start().then(() => console.log('http://localhost:8765'));
