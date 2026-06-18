// api/incidents.js
import { viasTramos } from "../lib/viasTramosData.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";
import { fetchEcu911RoadIncidents } from "../lib/parseEcu911.js";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

const CACHE_WINDOW_MS = 10 * 60 * 1000;

let cachedResponse = null;
let cachedAt = 0;
let cachedWindowStart = 0;
let pendingRefresh = null;

function getCacheWindowStart(now = Date.now()) {
  return Math.floor(now / CACHE_WINDOW_MS) * CACHE_WINDOW_MS;
}

function getSecondsUntilNextWindow(now = Date.now()) {
  const nextWindowStart = getCacheWindowStart(now) + CACHE_WINDOW_MS;
  return Math.max(1, Math.ceil((nextWindowStart - now) / 1000));
}

function isCacheFresh() {
  return cachedResponse && cachedWindowStart === getCacheWindowStart();
}

async function loadEcu911Items() {
  try {
    const fastItems = await fetchEcu911RoadIncidents();

    if (fastItems.length) {
      console.log("Datos ECU 911 obtenidos por fetch:", fastItems.length);
      return fastItems;
    }

    console.log("Fetch ECU 911 no encontro datos. Se usara Playwright.");
  } catch (error) {
    console.warn("Fetch ECU 911 fallo. Se usara Playwright:", error.message);
  }

  try {
    const scrapedItems = await scrapeEcu911MoronaSantiago();
    console.log("Datos ECU 911 obtenidos por Playwright:", scrapedItems.length);
    return scrapedItems;
  } catch (error) {
    console.error("No se pudo obtener ECU 911. Se usara red vial base:", error);
    return [];
  }
}

async function buildNetworkStatus() {
  const ecu911Items = await loadEcu911Items();
  console.log("Datos ECU 911:", ecu911Items.length);

  const matchedItems = ecu911Items
    .map((item) => {
      const tramo = matchRoadSegment(item);
      return tramo ? { ...item, tramoId: tramo.id } : null;
    })
    .filter(Boolean);

  const matchedMap = new Map(
    matchedItems.map((item) => [item.tramoId, item])
  );

  return viasTramos.map((tramo) => {
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
}

async function getCachedNetworkStatus() {
  const windowStart = getCacheWindowStart();

  if (isCacheFresh()) {
    return {
      ...cachedResponse,
      cache: {
        status: "hit",
        cachedAt,
        windowStart,
        windowMs: CACHE_WINDOW_MS
      }
    };
  }

  if (!pendingRefresh) {
    pendingRefresh = buildNetworkStatus()
      .then((roads) => {
        cachedWindowStart = getCacheWindowStart();
        cachedResponse = {
          ok: true,
          total: roads.length,
          incidents: roads
        };
        cachedAt = Date.now();
        return cachedResponse;
      })
      .finally(() => {
        pendingRefresh = null;
      });
  }

  const response = await pendingRefresh;

  return {
    ...response,
    cache: {
      status: "miss",
      cachedAt,
      windowStart: cachedWindowStart,
      windowMs: CACHE_WINDOW_MS
    }
  };
}

export default async function handler(req, res) {
  try {
    const data = await getCachedNetworkStatus();
    const secondsUntilNextWindow = getSecondsUntilNextWindow();

    res.setHeader(
      "Cache-Control",
      `s-maxage=${secondsUntilNextWindow}, stale-while-revalidate=60`
    );

    res.status(200).json(data);
  } catch (error) {
    console.error("Error en /api/incidents:", error);

    res.status(500).json({
      ok: false,
      message: "No se pudo construir la red vial.",
      error: error.message
    });
  }
}
