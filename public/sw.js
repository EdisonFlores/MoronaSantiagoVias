const CACHE_VERSION = "ecuavial-online-v1";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.map(key => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request).catch(() => {
      if (request.mode === "navigate") {
        return new Response(
          `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sin conexión</title>
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                font-family: Arial, sans-serif;
                background: #06111f;
                color: white;
                text-align: center;
                padding: 24px;
              }

              h1 {
                font-size: 24px;
                margin-bottom: 12px;
              }

              p {
                max-width: 420px;
                line-height: 1.5;
                color: #cbd5e1;
              }
            </style>
          </head>
          <body>
            <main>
              <h1>Sin conexión a internet</h1>
              <p>
                EcuaVial necesita internet para consultar incidentes,
                rutas, clima y mapas actualizados.
              </p>
            </main>
          </body>
          </html>
          `,
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=UTF-8"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          ok: false,
          message: "Sin conexión a internet. Esta aplicación requiere conexión para funcionar."
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    })
  );
});
