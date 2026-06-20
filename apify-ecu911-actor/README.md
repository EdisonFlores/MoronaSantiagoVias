# ECU 911 Morona Santiago cache Actor

Este Actor consulta la tabla de vias de ECU 911, filtra Morona Santiago y guarda el ultimo resultado en un Key-value store de Apify.

Valores recomendados:

- `storeName`: `ecu911-morona-santiago-cache`
- `recordKey`: `latest`
- `useApifyProxy`: `false` al inicio; activar si ECU 911 bloquea la ejecucion normal de Apify.

En Vercel configura:

- `APIFY_TOKEN`: token de Apify
- `APIFY_STORE_ID`: ID del Key-value store creado por el Actor
- `APIFY_CACHE_KEY`: `latest`
