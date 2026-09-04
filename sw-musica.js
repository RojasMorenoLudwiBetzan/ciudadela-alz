/* Service Worker — SOLO cachea los MP3 de la música de fondo, para que al
   cambiar de página la canción reanude casi sin corte. No toca HTML/CSS/JS. */
const CACHE = 'alz-musica-v1';
const esMusica = (u) => /\.mp3(\?|$)/i.test(u) && u.indexOf('musicas') !== -1;
const limpia = (u) => u.split('#')[0].split('?')[0];
const enVuelo = new Set();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !esMusica(e.request.url)) return;
  e.respondWith(responder(e.request));
});

function precachear(cache, clave) {
  if (enVuelo.has(clave.url)) return;
  enVuelo.add(clave.url);
  fetch(clave.url)
    .then((net) => { if (net && net.ok) return cache.put(clave, net.clone()); })
    .catch(() => {})
    .then(() => enVuelo.delete(clave.url));
}

async function responder(req) {
  const cache = await caches.open(CACHE);
  const clave = new Request(limpia(req.url));
  const range = req.headers.get('range');

  const full = await cache.match(clave);

  // aún no cacheado → deja pasar la petición tal cual (Range nativo, rápido)
  // y baja el archivo completo en segundo plano para la próxima página
  if (!full) {
    precachear(cache, clave);
    try { return await fetch(req); } catch (_) { return new Response('', { status: 504 }); }
  }

  if (!range) return full.clone();

  // ya cacheado → responde el trozo pedido al instante, sin red
  const buf = await full.clone().arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  let start = m ? parseInt(m[1], 10) : 0;
  let end = (m && m[2]) ? parseInt(m[2], 10) : total - 1;
  if (isNaN(start) || start < 0 || start >= total) start = 0;
  if (isNaN(end) || end >= total || end < start) end = total - 1;

  const chunk = buf.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Content-Length': String(chunk.byteLength),
      'Accept-Ranges': 'bytes'
    }
  });
}
