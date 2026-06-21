// lib/scrapeEcu911.js
import { request } from "node:https";

const ecu911ViasUrl =
  "https://ecu911.gob.ec/Services/WSVias/ViasWeb.php?estado=A" +
  "&and:<>:EstadoActual-id=593" +
  "&order=Provincia-descripcion" +
  "&limit=200" +
  "&start=0";

function cleanText(text = "") {
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text = "") {
  return cleanText(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeState(raw = "") {
  const t = normalizeText(raw);

  if (t.includes("parcialmente habilitada")) return "Parcialmente habilitada";
  if (t.includes("parcial")) return "Parcialmente habilitada";
  if (t.includes("cerrada") || t.includes("cerrado")) return "Cerrada";
  if (t.includes("habilitada") || t.includes("habilitado")) return "Habilitada";

  return cleanText(raw) || "Sin reporte";
}

function extractRef(via = "") {
  const m = String(via).match(/\bE[\s-]?(\d{1,4})\b/i);
  return m ? `E-${m[1]}` : "";
}

function getField(item, path, fallback = "") {
  return path
    .split(".")
    .reduce((value, key) => value?.[key], item) ?? fallback;
}

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

function fetchEcu911Json() {
  return new Promise((resolve, reject) => {
    const req = request(
      ecu911ViasUrl,
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

export async function scrapeEcu911MoronaSantiago() {
  const payload = await fetchEcu911Json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  const incidents = rows
    .map(mapEcu911Road)
    .filter((item) => normalizeText(item.provincia) === "morona santiago");

  console.log(`ECU 911 JSON devolvio ${incidents.length} vias de Morona Santiago.`);

  return incidents;
}
