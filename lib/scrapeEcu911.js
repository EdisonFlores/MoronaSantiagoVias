import { chromium } from "playwright";

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeState(raw = "") {
  const t = cleanText(raw).toLowerCase();

  if (t.includes("parcial")) return "Parcialmente habilitada";
  if (t.includes("cerrad")) return "Cerrada";
  if (t.includes("habilitad")) return "Habilitada";

  return cleanText(raw) || "Sin estado";
}

function extractRef(via = "") {
  const m = via.match(/\b(E[-\s]?\d+)\b/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
}

function splitRowByTabsOrColumns(line = "") {
  let parts = line
    .split(/\t+/)
    .map(cleanText)
    .filter(Boolean);

  if (parts.length >= 5) {
    return {
      provincia: parts[0],
      via: parts[1],
      estado: parts[2],
      observaciones: parts[3],
      viaAlterna: parts.slice(4).join(" ")
    };
  }

  parts = line
    .split(/\s{2,}/)
    .map(cleanText)
    .filter(Boolean);

  if (parts.length >= 5) {
    return {
      provincia: parts[0],
      via: parts[1],
      estado: parts[2],
      observaciones: parts[3],
      viaAlterna: parts.slice(4).join(" ")
    };
  }

  return null;
}

function parseRenderedText(fullText = "") {
  const lines = fullText
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) =>
    line.includes("Provincia") &&
    line.includes("Vía") &&
    line.includes("Estado") &&
    line.includes("Observaciones")
  );

  if (headerIndex === -1) {
    return [];
  }

  const dataLines = lines.slice(headerIndex + 1);
  const incidents = [];

  for (const line of dataLines) {
    const upper = line.toUpperCase();

    // cuando ya llega al footer o contenido ajeno, se detiene
    if (
      upper.includes("CONTACTO CIUDADANO DIGITAL") ||
      upper.includes("PORTAL TRÁMITES CIUDADANOS") ||
      upper.includes("SISTEMA NACIONAL DE INFORMACIÓN") ||
      upper.includes("PIE DE PAGINA")
    ) {
      break;
    }

    if (!upper.includes("MORONA SANTIAGO")) continue;

    const parsed = splitRowByTabsOrColumns(line);
    if (!parsed) continue;

    if (parsed.provincia.toUpperCase() !== "MORONA SANTIAGO") continue;

    incidents.push(parsed);
  }

  return incidents.map((item, index) => ({
    id: `ecu911-real-${index + 1}`,
    provincia: cleanText(item.provincia),
    via: cleanText(item.via),
    ref: extractRef(item.via),
    estado: normalizeState(item.estado),
    observaciones: cleanText(item.observaciones),
    viaAlterna: cleanText(item.viaAlterna || "N/A"),
    source: "ECU 911"
  }));
}

export async function scrapeEcu911MoronaSantiago() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://www.ecu911.gob.ec/consulta-de-vias/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForLoadState("networkidle", { timeout: 60000 });

    // Espera a que aparezca el encabezado visible de la tabla
    await page.waitForFunction(() => {
      return document.body.innerText.includes("Provincia") &&
             document.body.innerText.includes("Vía") &&
             document.body.innerText.includes("Estado") &&
             document.body.innerText.includes("Observaciones");
    }, { timeout: 60000 });

    const renderedText = await page.evaluate(() => document.body.innerText || "");
    const incidents = parseRenderedText(renderedText);

    if (!incidents.length) {
      throw new Error("No se encontraron filas reales de MORONA SANTIAGO en ECU 911.");
    }

    return incidents;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}