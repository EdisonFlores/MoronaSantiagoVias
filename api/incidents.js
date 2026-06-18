// api/incidents.js
import { viasTramos } from "../lib/viasTramosData.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";
import { fetchEcu911RoadIncidents } from "../lib/parseEcu911.js";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

const CACHE_WINDOW_MS = 10 * 60 * 1000;

const fallbackEcu911Items = [
  {
    provincia: "MORONA SANTIAGO",
    via: "LIMON - GUALACEO",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "PRECAUCIÓN, DESLIZAMIENTO DE TIERRA E INESTABILIDAD DE TALUD EN EL SECTOR CHACRAS.",
    viaAlterna: "MENDEZ - GUARUMALES-CUENCA",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "TIWINTZA - SAN JOSÉ DE MORONA",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones: "DESLIZAMIENTO SECTOR SHAIME",
    viaAlterna: "N/A",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "MACAS - RIOBAMBA",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "DESLIZAMIENTO SECTOR CASCADA MACABEA //DESLIZAMIENTO DE TIERRA KM 95 SECTOR 9 DE OCTUBRE // PRECAUCION DESLIZAMIENTO DE ROCAS KM 47 SECTOR LAGUNAS DE ATILLO",
    viaAlterna: "MACAS - PUYO",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "BELLA UNION - LIMON",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "PRECAUCIÓN DESLIZAMIENTO DE TIERRA EN EL SECTOR CORAZON DE YANANAS",
    viaAlterna: "N/A",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "LIMON - SAN JUAN BOSCO",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "CON PRECAUCIÓN POR DESLIZAMIENTO DE TIERRA EN EL SECTOR PAXI",
    viaAlterna: "N/A",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "Y DE PATUCA - TIWINTZA",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "CAIDA DE ARBOLES EN LA VIA SECTOR PUENTE DEL RIO UPANO ENTRADA A PATUCA",
    viaAlterna: "N/A",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "MENDEZ - GUARUMALES-CUENCA",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "PARCIALMENTE HABILITADA EN EL SECTOR SACRE Y KM 61. CONDUCIR CON PRECAUCION EN EL KM 44,105,107. CIERRE DEL PASO LATERAL VÍA MENDEZ-GUARUMALES, A 200 METROS DEL HOSPITAL, POR SOCAVÓN.",
    viaAlterna: "PLAN DE MILAGRO- CUENCA (POR LA LOMA DE LA VIRGEN)",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "GUALAQUIZA - CHIGUINDA - SIGSIG - CUENCA",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones:
      "CON PRECAUCIÓN DESLIZAMIENTO DE TIERRA EN EL SECTOR GALLO CANTANA (CHIGUINDA)",
    viaAlterna: "GUALAQUIZA-EL PORTON-RIO NEGRO-VIA ESTATAL E-594",
    source: "ECU 911 respaldo"
  },
  {
    provincia: "MORONA SANTIAGO",
    via: "SAN JUAN BOSCO - GUALAQUIZA",
    ref: "",
    estado: "Parcialmente habilitada",
    observaciones: "DESLIZAMIENTO DE TIERRA SECTOR EL PAXI Y EL SACRAMENTO",
    viaAlterna: "N/A",
    source: "ECU 911 respaldo"
  }
];

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
    if (scrapedItems.length) {
      console.log("Datos ECU 911 obtenidos por Playwright:", scrapedItems.length);
      return scrapedItems;
    }

    console.warn("Playwright ECU 911 no encontro datos. Se usara respaldo.");
    return fallbackEcu911Items;
  } catch (error) {
    console.error("No se pudo obtener ECU 911. Se usara respaldo:", error);
    return fallbackEcu911Items;
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
