import * as cheerio from "cheerio";

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCell(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeState(raw = "") {
  const value = normalizeText(raw);

  if (value.includes("parcial")) return "Parcialmente habilitada";
  if (value.includes("cerrad")) return "Cerrada";
  if (value.includes("habilitad")) return "Habilitada";

  return cleanCell(raw) || "Sin estado";
}

function extractRef(via = "") {
  const m = via.match(/\b(E[-\s]?\d+)\b/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
}

function buildIncident(provincia, via, estado, observaciones, viaAlterna, idx) {
  return {
    id: `ecu911-${idx + 1}`,
    provincia: cleanCell(provincia),
    via: cleanCell(via),
    ref: extractRef(via),
    estado: normalizeState(estado),
    observaciones: cleanCell(observaciones),
    viaAlterna: cleanCell(viaAlterna || "N/A"),
    source: "ECU 911"
  };
}

function parseRowsFromTables(html) {
  const $ = cheerio.load(html);
  const incidents = [];
  let idx = 0;

  $("table").each((_, table) => {
    $(table).find("tr").each((__, tr) => {
      const cells = $(tr)
        .find("th, td")
        .map((___, cell) => cleanCell($(cell).text()))
        .get()
        .filter(Boolean);

      if (cells.length < 4) return;

      const provincia = cells[0];
      const via = cells[1];
      const estado = cells[2];
      const observaciones = cells[3];
      const viaAlterna = cells[4] || "N/A";

      if (normalizeText(provincia) !== "morona santiago") return;

      incidents.push(
        buildIncident(provincia, via, estado, observaciones, viaAlterna, idx++)
      );
    });
  });

  return incidents;
}

function parseTabbedText(html) {
  const $ = cheerio.load(html);
  const text = $.text();

  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const incidents = [];
  let idx = 0;

  for (const line of lines) {
    // caso tipo:
    // MORONA SANTIAGO LIMON - GUALACEO PARCIALMENTE HABILITADA ...
    if (!normalizeText(line).includes("morona santiago")) continue;

    // intento con separaciones por tabs múltiples o 2+ espacios
    const parts = line.split(/\t+|\s{2,}/).map(cleanCell).filter(Boolean);
    if (parts.length < 4) continue;

    const provincia = parts[0];
    if (normalizeText(provincia) !== "morona santiago") continue;

    const via = parts[1] || "";
    const estado = parts[2] || "";
    const observaciones = parts[3] || "";
    const viaAlterna = parts[4] || "N/A";

    incidents.push(
      buildIncident(provincia, via, estado, observaciones, viaAlterna, idx++)
    );
  }

  return incidents;
}

export async function fetchEcu911RoadIncidents() {
  const url = "https://www.ecu911.gob.ec/consulta-de-vias/";
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Ecuavial/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`ECU 911 respondió con ${response.status}`);
  }

  const html = await response.text();

  // 1) intento principal: tabla HTML
  let incidents = parseRowsFromTables(html);
  if (incidents.length) return incidents;

  // 2) fallback: texto tabulado/espaciado
  incidents = parseTabbedText(html);
  if (incidents.length) return incidents;

  return [];
}