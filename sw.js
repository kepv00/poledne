// Service worker: offline provoz na place.
// - aplikace, data.json a miniatury se ukládají při instalaci,
// - velké obrázky a PDF se ukládají při prvním zobrazení,
// - aplikace a data.json jdou nejdřív ze sítě (aby se projevily nové verze), offline z cache.

const VERSION = 'poledne-v8';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/util.js',
  'js/parts.js',
  'js/shots.js',
  'js/views.js',
  'js/print.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/diagram.js',
  'js/script.js',
  'js/photos.js',
  'js/sound.js',
  'rekvizity.pdf',
  'data.json',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try {
      const data = await (await fetch('data.json', { cache: 'no-cache' })).json();
      const thumbs = data.shots.map(s => s.thumb).filter(Boolean);
      await cache.addAll(thumbs);
    } catch { /* miniatury se doplní za běhu */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (/\/img\/|\.(pdf|docx|xlsx)$/.test(url.pathname)) event.respondWith(cacheFirst(req));
    else event.respondWith(networkFirst(req));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});
