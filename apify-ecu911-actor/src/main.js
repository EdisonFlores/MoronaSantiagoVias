import { Actor } from "apify";
import { chromium } from "playwright";

const sourceUrl = "https://www.ecu911.gob.ec/consulta-de-vias/";

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
  const match = String(via).match(/\bE[\s-]?(\d{1,4})\b/i);
  return match ? `E-${match[1]}` : "";
}

async function getProxyLaunchOptions(input) {
  if (!input.useApifyProxy) return {};

  const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: input.proxyGroups || []
  });
  const proxyUrl = await proxyConfiguration.newUrl();
  const parsed = new URL(proxyUrl);

  return {
    proxy: {
      server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password)
    }
  };
}

async function scrapeEcu911MoronaSantiago(input) {
  const proxyOptions = await getProxyLaunchOptions(input);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...proxyOptions
  });

  try {
    const page = await browser.newPage();

    await page.goto(sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000
    });

    await page.waitForTimeout(6000);

    const tables = page.locator("table");
    const tableCount = await tables.count();
    Actor.log.info(`Tablas encontradas: ${tableCount}`);

    let targetTable = null;

    for (let i = 0; i < tableCount; i++) {
      const table = tables.nth(i);
      const tableText = cleanText(await table.innerText());
      const normalized = normalizeText(tableText);

      if (
        normalized.includes("provincia") &&
        normalized.includes("via") &&
        normalized.includes("estado") &&
        normalized.includes("observaciones")
      ) {
        targetTable = table;
        break;
      }
    }

    if (!targetTable) return [];

    const rows = targetTable.locator("tr");
    const rowCount = await rows.count();
    const rawRows = [];

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("th, td");
      const cellCount = await cells.count();
      const values = [];

      for (let j = 0; j < cellCount; j++) {
        values.push(cleanText(await cells.nth(j).innerText()));
      }

      if (values.length >= 5) rawRows.push(values);
    }

    return rawRows
      .slice(1)
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
  } finally {
    await browser.close();
  }
}

await Actor.init();

try {
  const input = (await Actor.getInput()) || {};
  const storeName = input.storeName || "ecu911-morona-santiago-cache";
  const recordKey = input.recordKey || "latest";
  const items = await scrapeEcu911MoronaSantiago(input);

  if (!items.length) {
    throw new Error("ECU 911 no devolvio reportes para Morona Santiago.");
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    sourceUrl,
    items
  };

  const store = await Actor.openKeyValueStore(storeName);
  await store.setValue(recordKey, payload);
  await Actor.setValue("OUTPUT", payload);
  await Actor.pushData(items);

  Actor.log.info(`Cache actualizado en store "${storeName}", record "${recordKey}" con ${items.length} reportes.`);
} finally {
  await Actor.exit();
}
