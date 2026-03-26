import { viasTramos } from "../lib/viasTramosData.js";
import { parseBulletinText } from "../lib/parseBulletin.js";
import { matchRoadSegment } from "../lib/roadMatcher.js";

const BULLETIN_TEXT = `
*ECU 911 MACAS*
*FECHA:* 26/03/2026 06:00
⚠️ *MACAS – RIOBAMBA [E-46]:   PARCIALMENTE HABILITADA:*  Precaución deslizamiento de rocas km 47 cerca de las lagunas de Atillo.  En el km 81 sector Alshi-Zuñac, deslizamientos de tierra activos.
✅ *MACAS – PUYO [E-45]:   HABILITADA.*
✅ *MACAS – TAISHA [E-45]: HABILITADA.*
⚠️ *MACAS – LOGROÑO [E45]: PARCIALMENTE HABILITADA:* Precaución, sector Paso Carreño (km 10), media vía en la curva cerca del puente sobre el río Tutanangoza.
⚠️ *LOGROÑO – BELLA UNIÓN [E45]: HABILITADA:* Precaución hundimientos en la vía.
⚠️ *BELLA UNIÓN – LIMÓN – PLAN DE MILAGRO [E45]: PARCIALMENTE HABILITADA:* Deslizamiento de tierra en el sector Corazón de Yananas.
⚠️ *PLAN DE MILAGRO – GUALACEO: PARCIALMENTE HABILITADA:* Precaución deslizamiento de tierra y lodo en el sector 7 Palmos.
⚠️ *PLAN DE MILAGRO – SAN JUAN BOSCO [E45]: PARCIALMENTE HABILITADA:* Precaución deslizamiento de tierra en el sector Paxi.
⚠️ *SAN JUAN BOSCO – KALAGLAS-GUALAQUIZA [E-45]:  PARCIALMENTE HABILITADA:* Deslizamiento de tierra sector el Paxi y el Sacramento.
⚠️ *MENDEZ – GUARUMALES – PAUTE [E40]: PARCIALMENTE HABILITADA:* Precaución deslizamientos en el sector de Amaluza (Jurisdicción Azuay), km 58 sector Osorancho, km 61 sector Santa Rosa, km 68 sector Chalacay, km 86+500 sector La Hermita, sector San Pablo, sector Chaullayacu, km 107 sector Quebrada Guayaquil.
⚠️  *Y DE PATUCA – TIWINTZA [E-40]: PARCIALMENTE HABILITADA:* Precaución caída de árboles en la vía sector puente del río Upano paso a Patuca.
⚠️ *TIWINTZA – SAN JOSÉ MORONA [E-40]: PARCIALMENTE HABILITADA:* Deslizamiento en el Km 86+400.
⚠️ *GUALAQUIZA – CHIGUINDA - SIGSIG [E594]: PARCIALMENTE HABILITADA:* Con precaución deslizamiento de tierra en el sector Gallo Cantana (Chiguinda).
`;

function buildNetworkStatus() {
  const bulletinItems = parseBulletinText(BULLETIN_TEXT);

  const matchedBulletins = bulletinItems
    .map((item) => {
      const tramo = matchRoadSegment(item);
      return tramo ? { ...item, tramoId: tramo.id } : null;
    })
    .filter(Boolean);

  return viasTramos.map((tramo) => {
    const bulletinMatch = matchedBulletins.find((b) => b.tramoId === tramo.id);

    return {
      id: tramo.id,
      provincia: "Morona Santiago",
      via: tramo.via,
      ref: tramo.ref || "",
      estado: bulletinMatch ? bulletinMatch.estado : "Habilitada",
      observaciones: bulletinMatch ? bulletinMatch.observaciones : "Sin novedades reportadas en ECU 911.",
      viaAlterna: bulletinMatch ? bulletinMatch.viaAlterna : "N/A",
      source: bulletinMatch ? "ECU 911" : "Red vial base",
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
    const roads = buildNetworkStatus();

    res.status(200).json({
      ok: true,
      total: roads.length,
      incidents: roads
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "No se pudo construir la red vial.",
      error: error.message
    });
  }
}