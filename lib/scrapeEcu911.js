// lib/scrapeEcu911.js
import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

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
  if (t.includes("cerrada")) return "Cerrada";
  if (t.includes("habilitada")) return "Habilitada";

  return cleanText(raw) || "Sin reporte";
}

function extractRef(via = "") {
  const m = String(via).match(/\bE[\s-]?(\d{1,4})\b/i);
  return m ? `E-${m[1]}` : "";
}

function getLocalChromePath() {
  return (
    process.env.CHROME_EXECUTABLE_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  );
}

async function launchBrowser() {
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

  if (isVercel) {
    return playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });
  }

  return playwright.launch({
    executablePath: getLocalChromePath(),
    headless: true
  });
}

export async function scrapeEcu911MoronaSantiago() {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    await page.goto("https://www.ecu911.gob.ec/consulta-de-vias/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(6000);

    const tables = page.locator("table");
    const tableCount = await tables.count();

    console.log("Tablas encontradas:", tableCount);

    if (tableCount === 0) return [];

    let targetTable = null;

    for (let i = 0; i < tableCount; i++) {
      const table = tables.nth(i);
      const tableText = cleanText(await table.innerText());
      const t = normalizeText(tableText);

      if (
        t.includes("provincia") &&
        t.includes("via") &&
        t.includes("estado") &&
        t.includes("observaciones")
      ) {
        targetTable = table;
        break;
      }
    }

    if (!targetTable) {
      console.log("No se encontró la tabla objetivo.");
      return [];
    }

    const rows = targetTable.locator("tr");
    const rowCount = await rows.count();

    console.log("Filas encontradas en tabla:", rowCount);

    const rawRows = [];

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator("th, td");
      const cellCount = await cells.count();

      const values = [];

      for (let j = 0; j < cellCount; j++) {
        const text = cleanText(await cells.nth(j).innerText());
        values.push(text);
      }

      if (values.length >= 5) rawRows.push(values);
    }

    console.log("Filas crudas:", rawRows);

    if (rawRows.length <= 1) return [];

    const dataRows = rawRows.slice(1);

    const incidents = dataRows
      .map((cells) => {
        const provincia = cleanText(cells[0] || "");
        const via = cleanText(cells[1] || "");
        const estadoRaw = cleanText(cells[2] || "");
        const observaciones = cleanText(cells[3] || "");
        const viaAlterna = cleanText(cells[4] || "");

        return {
          provincia,
          via,
          ref: extractRef(via),
          estado: normalizeState(estadoRaw),
          observaciones: observaciones || "Sin observaciones.",
          viaAlterna: viaAlterna || "N/A",
          source: "ECU 911"
        };
      })
      .filter((item) => normalizeText(item.provincia) === "morona santiago");

    console.log("Morona Santiago:", incidents);

    return incidents;
  } finally {
    await browser.close();
  }
}