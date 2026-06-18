// api/incidents.js
import { viasTramos } from "../lib/viasTramosData.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

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

export default async function handler(req, res) {
  try {
    const roads = await buildNetworkStatus();

    res.status(200).json({
      ok: true,
      total: roads.length,
      incidents: roads
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