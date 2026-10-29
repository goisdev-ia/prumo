/* Prumo · service worker: guarda a casca do app para abrir rápido/offline e mostra as notificações push. */
importScripts('config.js');
const CACHE = 'prumo-shell-v1';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-72.png', 'icons/favicon.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('prumo-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});

async function execUrl() {
  try { const r = await caches.open('prumo-config').then((c) => c.match('exec-url')); if (r) { const u = await r.text(); if (u) return u; } } catch (e) { /* usa o config.js */ }
  return (self.PRUMO && self.PRUMO.EXEC_URL) || '';
}
async function pidOf(endpoint) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('push:' + endpoint));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}
const ICON = 'icons/icon-192.png', BADGE = 'icons/badge-72.png';

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let itens = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const url = await execUrl();
      if (sub && url) {
        const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'push=' + (await pidOf(sub.endpoint)) + '&t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
        itens = (await res.json()).itens || [];
      }
    } catch (err) { itens = null; }
    if (itens === null) return self.registration.showNotification('Prumo', { body: 'Você tem novidades no Prumo.', icon: ICON, badge: BADGE, tag: 'prumo-geral', data: { link: '#/' } });
    for (const n of itens) {
      await self.registration.showNotification(n.titulo || 'Prumo', { body: n.corpo || '', icon: ICON, badge: BADGE, tag: 'prumo-' + n.id, data: { link: n.link || '#/' }, vibrate: [60, 40, 60], timestamp: Date.now() });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '#/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => new URL(c.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (client) { await client.focus(); client.postMessage({ type: 'navigate', route: link }); return; }
    await self.clients.openWindow('./' + (link.startsWith('#') ? link : '#' + link));
  })());
});
