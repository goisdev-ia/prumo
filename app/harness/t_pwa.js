const { chromium } = require('playwright');
const { start, G } = require('./server');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
(async () => {
  G.context.setup();
  const srv = await start(8765);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:8765' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push('casca: ' + e.message));
  // A casca aponta para o app do harness; o PushManager é simulado (o headless não fala com o FCM).
  await page.addInitScript(() => {
    try { localStorage.setItem('prumo.shell.exec', 'http://localhost:8765/'); } catch (e) {}
    if (window.Notification) { let perm = 'default'; Object.defineProperty(Notification, 'permission', { get: () => perm }); Notification.requestPermission = async () => (perm = 'granted'); }
    if (window.PushManager) {
      let sub = null;
      const mk = (key) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/teste-pwa', options: { applicationServerKey: key.buffer }, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BP', auth: 'au' } }; }, unsubscribe: async () => { sub = null; return true; } });
      PushManager.prototype.subscribe = async function (o) { sub = mk(o.applicationServerKey); return sub; };
      PushManager.prototype.getSubscription = async function () { return sub; };
    }
  });
  await page.goto('http://localhost:8765/pwa/');
  await page.waitForSelector('#splash.hide', { timeout: 20000 });
  ok(true, 'casca abriu o app e escondeu o splash quando o app avisou que estava pronto');
  const man = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  ok(man.display === 'standalone' && man.icons.some((i) => i.purpose === 'maskable') && man.icons.some((i) => i.sizes === '512x512'), 'manifesto instalável (standalone, 512, maskable)');
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  ok(sw, 'service worker ativo');
  const app = page.frames().find((f) => f.url().startsWith('http://localhost:8765/') && !f.url().includes('/pwa/'));
  ok(!!app, 'app dentro do iframe');
  await app.waitForSelector('.page');
  const inShell = await app.evaluate(() => window.Prumo.pwa.state.inShell);
  ok(inShell, 'app reconhece que está no app instalado');
  await app.evaluate(() => { location.hash = '#/cfg/notificacoes'; }); await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/pwa_notif_antes.png' });
  await app.click('[data-act="cfg.pushOn"]');
  await page.waitForSelector('#push.open'); await page.waitForTimeout(350);
  await page.screenshot({ path: 'shots/pwa_permissao.png' });
  G.pushCalls.length = 0;
  await page.click('#push-yes');
  await app.waitForSelector('.toast:has-text("ativadas")', { timeout: 15000 });
  await page.waitForTimeout(1500);
  G.resetMemo(); G.context.Auth.as('voce@exemplo.com');
  const subs = G.context.Db.table('push_inscricoes').list();
  ok(subs.length === 1 && subs[0].endpoint.includes('teste-pwa') && /Android|Outro|Windows|Mac|Linux/.test(subs[0].dispositivo || 'Outro'), 'inscrição chegou ao servidor no nome do usuário (' + subs[0].dispositivo + ')');
  ok(G.pushCalls.length >= 1, 'notificação de teste disparada ao ativar');
  await page.screenshot({ path: 'shots/pwa_notif_depois.png' });
  // o service worker busca o conteúdo pelo pid (mesmo cálculo do sw.js)
  const pulled = await page.evaluate(async () => {
    const ep = 'https://fcm.googleapis.com/fcm/send/teste-pwa';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('push:' + ep));
    const pid = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
    return (await (await fetch('http://localhost:8765/exec?push=' + pid)).json()).itens;
  });
  ok(pulled.length === 1 && pulled[0].titulo === 'Notificações ativadas', 'pid calculado no aparelho bate com o do servidor e traz a notificação');
  // clique na notificação leva à tela certa
  await page.evaluate(() => navigator.serviceWorker.controller ? 0 : 0);
  await app.evaluate(() => window.parent === window.top);
  await page.evaluate(() => { window.postMessage = window.postMessage; });
  await page.evaluate(() => { const ev = new MessageEvent('message', { data: { type: 'navigate', route: '#/tar' } }); navigator.serviceWorker.dispatchEvent(ev); });
  await page.waitForTimeout(700);
  ok((await app.evaluate(() => location.hash)) === '#/tar', 'abrir a notificação navega o app para o link dela');
  // desativar
  await app.evaluate(() => { location.hash = '#/cfg/notificacoes'; }); await page.waitForTimeout(500);
  await app.click('[data-act="cfg.pushOff"]'); await page.waitForTimeout(1500);
  G.resetMemo(); G.context.Auth.as('voce@exemplo.com');
  ok(G.context.Db.table('push_inscricoes').list({ where: { ativo: true } }).length === 0, 'desativar remove a inscrição');
  // falha de carregamento mostra tela de configuração do link
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => { try { localStorage.setItem('prumo.shell.exec', ''); } catch (e) {} window.PRUMO_TEST = 1; });
  await p2.route('**/pwa/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'self.PRUMO={EXEC_URL:""}' }));
  await p2.goto('http://localhost:8765/pwa/?x=1'); await p2.waitForSelector('#fail:not([hidden])');
  await p2.screenshot({ path: 'shots/pwa_sem_link.png' });
  ok(await p2.isVisible('#url'), 'sem link configurado: pede o endereço do app');
  console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros de JS');
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
