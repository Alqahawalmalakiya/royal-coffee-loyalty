const CACHE = 'royal-loyalty-shell-v9';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/api.js', '/qr.js', '/whatsapp.js', '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/logo-mark.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/config.js') return; // never cache connection configuration persistently
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if (response.ok && !url.pathname.endsWith('.html')) {
      const clone = response.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
    }
    return response;
  })));
});
self.addEventListener('push', event => {
  let message = { title: 'ضيافة القهوة الملكية', body: 'لديك تحديث جديد على بطاقة الولاء.', url: '/' };
  try { if (event.data) message = { ...message, ...event.data.json() }; } catch (_) {}
  const url = typeof message.url === 'string' && message.url.startsWith('/') && !message.url.startsWith('//') ? message.url : '/';
  event.waitUntil(self.registration.showNotification(String(message.title).slice(0, 100), {
    body: String(message.body).slice(0, 300), icon: '/assets/icon-192.png', badge: '/assets/icon-192.png', tag: message.tag || undefined,
    data: { url }, dir: 'rtl', lang: 'ar'
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(clients => {
    const existing = clients.find(c => new URL(c.url).origin === self.location.origin);
    if (existing) { existing.navigate(path); return existing.focus(); }
    return self.clients.openWindow(path);
  }));
});
