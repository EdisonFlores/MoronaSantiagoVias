// api/incidents.js
import { readFile } from "node:fs/promises";
import { viasTramos } from "../lib/viasTramosData.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

const ecu911CacheUrl = new URL("../data/ecu911-morona-santiago.json", import.meta.url);
const apifyRecordKey = process.env.APIFY_CACHE_KEY || "latest";

async function loadCachedEcu911Items() {
  const raw = await readFile(ecu911CacheUrl, "utf8");
  const cache = JSON.parse(raw);

  return {
    items: Array.isArray(cache.items) ? cache.items : [],
    updatedAt: cache.updatedAt || null
  };
}

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

async function getEcu911Items() {
  try {
    const items = await scrapeEcu911MoronaSantiago();

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

async function buildNetworkStatus() {
  const { items: ecu911Items, sourceWarning } = await getEcu911Items();

  console.log("Datos ECU 911:", ecu911Items);

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

    return {
      id: tramo.id,
      provincia: "Morona Santiago",
      via: tramo.via,
      ref: tramo.ref || "",
      estado: match ? match.estado : "Habilitada",
      observaciones: match
        ? match.observaciones
        : "Sin novedades reportadas.",
      viaAlterna: match?.viaAlterna || "N/A",
      updatedAt: match?.modified || null,
      source: match ? "ECU 911" : "Red vial base",
      hasRoadMatch: true,
      matchedRoadSegment: {
        id: tramo.id,
        via: tramo.via,
        ref: tramo.ref || "",
        origen: tramo.origen,
        destino: tramo.destino,
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
