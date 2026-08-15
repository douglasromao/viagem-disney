/* Service worker — offline completo (ADR 0008).
 *
 * O app é um arquivo único e autocontido, então o cache é trivial: guarda o
 * HTML, o manifest e os ícones, e serve do cache quando não houver rede.
 *
 * Estratégia: network-first para o HTML (para pegar atualização assim que
 * houver rede) com fallback para o cache; cache-first para o resto, que não
 * muda. As chamadas de sincronização NUNCA passam por aqui — elas precisam
 * falhar de verdade quando não há rede, senão a fila offline (F3) não sabe que
 * está offline.
 */

const VERSAO = "disneytrip-v16";
const ESSENCIAL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icone-192.png",
  "./icone-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSAO)
      /* addAll falha inteiro se um item falhar; ícone ausente não pode
         impedir o app de ficar offline. */
      .then(c => Promise.allSettled(ESSENCIAL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  /* Só cuida do que é do próprio app. Sync e qualquer outra origem passam
     direto para a rede — e falham de verdade quando não houver. */
  if(url.origin !== self.location.origin) return;

  const ehPagina = req.mode === "navigate" || url.pathname.endsWith(".html");

  if(ehPagina){
    e.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone();
      caches.open(VERSAO).then(c => c.put(req, copia));
      return res;
    }))
  );
});
