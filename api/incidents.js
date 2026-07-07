// Construye la respuesta principal de la app combinando ECU 911 y tramos base.
import { readFile } from "node:fs/promises";
import { viasTramos } from "../lib/viasTramosData.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";
import { scrapeEcu911Ecuador } from "../lib/scrapeEcu911.js";

const ecu911CacheUrl = new URL("../data/ecu911-morona-santiago.json", import.meta.url);
const apifyRecordKey = process.env.APIFY_CACHE_KEY || "latest";

// Cache local generada por GitHub Actions o por el script de actualizacion.
async function loadCachedEcu911Items() {
  const raw = await readFile(ecu911CacheUrl, "utf8");
  const cache = JSON.parse(raw);

  return {
    items: Array.isArray(cache.items) ? cache.items : [],
    updatedAt: cache.updatedAt || null
  };
}

// En Vercel se usa Apify como cache externo porque el filesystem es de solo lectura.
async function loadApifyEcu911Items() {
  if (!process.env.APIFY_TOKEN || !process.env.APIFY_STORE_ID) {
    throw new Error("APIFY_TOKEN o APIFY_STORE_ID no configurado.");
  }

  const url =
    `https://api.apify.com/v2/key-value-stores/${process.env.APIFY_STORE_ID}` +
    `/records/${encodeURIComponent(apifyRecordKey)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.APIFY_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Apify respondio ${response.status}`);
  }

  const cache = await response.json();

  return {
    items: Array.isArray(cache.items) ? cache.items : [],
    updatedAt: cache.updatedAt || null
  };
}

// Prioridad de datos: ECU 911 en vivo, cache Apify, cache del repositorio.
async function getEcu911Items() {
  try {
    const items = await scrapeEcu911Ecuador();

    if (items.length) {
      return { items, sourceWarning: null };
    }
  } catch (error) {
    console.error("No se pudo consultar ECU 911 en vivo:", error);
  }

  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    try {
      const apifyCache = await loadApifyEcu911Items();

      if (apifyCache.items.length) {
        return {
          items: apifyCache.items,
          sourceWarning: apifyCache.updatedAt
            ? `Datos ECU 911 cacheados desde Apify: ${apifyCache.updatedAt}`
            : "Datos ECU 911 cacheados desde Apify."
        };
      }
    } catch (error) {
      console.error("No se pudo leer cache de Apify:", error);
    }

    const cache = await loadCachedEcu911Items();

    return {
      items: cache.items,
      sourceWarning: cache.updatedAt
        ? `No se pudo consultar ECU 911 en vivo; usando cache de GitHub Actions: ${cache.updatedAt}`
        : "No se pudo consultar ECU 911 en vivo; usando cache de GitHub Actions."
    };
  }

  const cache = await loadCachedEcu911Items();

  return {
    items: cache.items,
    sourceWarning: cache.updatedAt
      ? `No se pudo consultar ECU 911 en vivo; usando cache local: ${cache.updatedAt}`
      : "No se pudo consultar ECU 911 en vivo; usando cache local."
  };
}

// Une reportes ECU 911 con la red base para mostrar todos los tramos siempre.
async function buildNetworkStatus() {
  const { items: ecu911Items, sourceWarning } = await getEcu911Items();

  const matchedItems = ecu911Items
    .map((item) => {
      const tramo = matchRoadSegment(item);
      return tramo ? { ...item, tramoId: tramo.id } : null;
    })
    .filter(Boolean);

  const matchedMap = new Map(
    matchedItems.map((item) => [item.tramoId, item])
  );

  const roads = viasTramos.map((tramo) => {
    const match = matchedMap.get(tramo.id);
    const hasOfficialIncident = Boolean(
      match &&
        (match.hasEcu911News ||
          match.estado === "Parcialmente habilitada" ||
          match.estado === "Cerrada")
    );

    return {
      id: tramo.id,
      provincia: match?.provincia || tramo.provincia || (tramo.source === "ECU 911" ? "Ecuador" : "Morona Santiago"),
      via: tramo.via,
      ref: tramo.ref || "",
      estado: match ? match.estado : "Habilitada",
      observaciones: match
        ? match.observaciones
        : "Sin novedades reportadas.",
      viaAlterna: match?.viaAlterna || "N/A",
      updatedAt: match?.modified || null,
      source: match ? "ECU 911" : tramo.source || "Red vial base",
      hasOfficialIncident,
      hasRoadMatch: true,
      matchedRoadSegment: {
        id: tramo.id,
        via: tramo.via,
        ref: tramo.ref || "",
        origen: tramo.origen,
        destino: tramo.destino,
        points: tramo.points || null,
        start: tramo.start,
        end: tramo.end
      }
    };
  });

  return {
    roads,
    sourceWarning
  };
}

// Endpoint consumido por el frontend para listar estado, fuente y tramo asociado.
export default async function handler(req, res) {
  try {
    const { roads, sourceWarning } = await buildNetworkStatus();

    res.status(200).json({
      ok: true,
      total: roads.length,
      incidents: roads,
      sourceWarning
    });
  } catch (error) {
    console.error("Error en /api/incidents:", error);

    res.status(500).json({
      ok: false,
      message: "No se pudo construir la red vial.",
      error: error.message
    });
  }
}
