// api/incidents.js
import { viasTramos } from "../lib/viasTramosData.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

const CACHE_WINDOW_MS = 10 * 60 * 1000;

let cachedResponse = null;
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

async function buildNetworkStatus() {
  const ecu911Items = await scrapeEcu911MoronaSantiago();
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
  if (isCacheFresh()) {
    return {
      ...cachedResponse,
      cache: {
        status: "hit",
        windowStart: cachedWindowStart,
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
          dataSource: "ECU 911",
          incidents: roads
        };
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
      dataSource: "Error ECU 911",
      ecu911Error: error.message,
      error: error.message
    });
  }
}
