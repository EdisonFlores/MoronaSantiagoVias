// Consulta el servicio JSON de ECU 911 y normaliza vias de Morona Santiago.
import { request } from "node:https";

// Endpoint general de vias activas.
const ecu911AllViasUrl =
  "https://ecu911.gob.ec/Services/WSVias/ViasWeb.php?estado=A" +
  "&order=Provincia-descripcion" +
  "&limit=500" +
  "&start=0";

// Endpoint con novedades, usado para sobrescribir datos generales cuando hay incidentes.
const ecu911NewsViasUrl =
  "https://ecu911.gob.ec/Services/WSVias/ViasWeb.php?estado=A" +
  "&and:<>:EstadoActual-id=593" +
  "&order=Provincia-descripcion" +
  "&limit=200" +
  "&start=0";

// Elimina espacios raros y deja textos listos para mostrar o comparar.
function cleanText(text = "") {
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normaliza texto para comparaciones sin acentos ni mayusculas.
function normalizeText(text = "") {
  return cleanText(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Convierte estados variados de ECU 911 al conjunto usado por la app.
function normalizeState(raw = "") {
  const t = normalizeText(raw);

  if (t.includes("parcialmente habilitada")) return "Parcialmente habilitada";
  if (t.includes("parcial")) return "Parcialmente habilitada";
  if (t.includes("cerrada") || t.includes("cerrado")) return "Cerrada";
  if (t.includes("habilitada") || t.includes("habilitado")) return "Habilitada";

  return cleanText(raw) || "Sin reporte";
}

// Extrae codigos tipo E-40 desde el nombre de la via si existen.
function extractRef(via = "") {
  const m = String(via).match(/\bE[\s-]?(\d{1,4})\b/i);
  return m ? `E-${m[1]}` : "";
}

// Genera una clave estable para fusionar vias repetidas de distintos endpoints.
function getRoadKey(item) {
  return normalizeText(item.via).replace(/[^a-z0-9]+/g, " ").trim();
}

// Lee campos anidados de respuestas ECU 911 sin romper si falta una propiedad.
function getField(item, path, fallback = "") {
  return path
    .split(".")
    .reduce((value, key) => value?.[key], item) ?? fallback;
}

// Convierte el objeto original de ECU 911 al contrato usado por la app.
function mapEcu911Road(item, idx) {
  const provincia = cleanText(getField(item, "Provincia.descripcion"));
  const via = cleanText(item.descripcion);
  const estadoRaw = cleanText(getField(item, "EstadoActual.nombre"));
  const observaciones = cleanText(item.observaciones);
  const viaAlterna = cleanText(
    item.via_alterna ||
      item.viaAlterna ||
      getField(item, "ViaAlterna.descripcion") ||
      getField(item, "ViaAlterna.nombre") ||
      "N/A"
  );

  return {
    id: item.id || `ecu911-${idx + 1}`,
    provincia,
    canton: cleanText(getField(item, "Canton.descripcion")),
    via,
    ref: extractRef(via),
    estado: normalizeState(estadoRaw),
    observaciones: observaciones || "Sin observaciones.",
    viaAlterna: viaAlterna || "N/A",
    modified: item.modified || null,
    source: "ECU 911"
  };
}

// Se usa https.request para controlar timeout, user-agent y certificados del origen.
function fetchEcu911Json(url) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        headers: {
          accept: "application/json",
          "user-agent": "MoronaSantiagoVias/1.0"
        },
        rejectUnauthorized: false,
        timeout: 30000
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`ECU 911 respondio ${res.statusCode || "sin estado"}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`ECU 911 no devolvio JSON valido: ${error.message}`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Timeout consultando ECU 911"));
    });
    req.on("error", reject);
    req.end();
  });
}

// Descarga, filtra y fusiona vias de Morona Santiago desde ECU 911.
export async function scrapeEcu911MoronaSantiago() {
  const [allPayload, newsPayload] = await Promise.all([
    fetchEcu911Json(ecu911AllViasUrl),
    fetchEcu911Json(ecu911NewsViasUrl)
  ]);

  const allRows = Array.isArray(allPayload?.data) ? allPayload.data : [];
  const newsRows = Array.isArray(newsPayload?.data) ? newsPayload.data : [];

  const allItems = allRows
    .map(mapEcu911Road)
    .filter((item) => normalizeText(item.provincia) === "morona santiago");

  const newsItems = newsRows
    .map(mapEcu911Road)
    .filter((item) => normalizeText(item.provincia) === "morona santiago");

  // El mapa evita duplicados y deja prevalecer el endpoint de novedades.
  const merged = new Map();

  for (const item of allItems) {
    merged.set(getRoadKey(item), item);
  }

  for (const item of newsItems) {
    merged.set(getRoadKey(item), item);
  }

  const incidents = [...merged.values()];

  console.log(
    `ECU 911 JSON devolvio ${incidents.length} vias de Morona Santiago ` +
      `(${newsItems.length} con novedades).`
  );

  return incidents;
}
