import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

const outputUrl = new URL("../data/ecu911-morona-santiago.json", import.meta.url);
const outputPath = fileURLToPath(outputUrl);
const sourceUrl =
  "https://ecu911.gob.ec/Services/WSVias/ViasWeb.php?estado=A" +
  "&order=Provincia-descripcion" +
  "&limit=500" +
  "&start=0";

async function readCurrentCache() {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return null;
  }
}

async function scrapeWithRetries(maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Intento ${attempt} de ${maxAttempts} para consultar ECU 911.`);
      const items = await scrapeEcu911MoronaSantiago();
      if (items.length) return items;
      lastError = new Error("ECU 911 no devolvio reportes para Morona Santiago.");
    } catch (error) {
      lastError = error;
      console.error(`Intento ${attempt} fallo: ${error.message}`);
    }
  }

  throw lastError;
}

const currentCache = await readCurrentCache();
let items = [];

try {
  items = await scrapeWithRetries();
} catch (error) {
  if (currentCache?.items?.length) {
    console.error(`No se pudo actualizar ECU 911; se conserva cache previo: ${error.message}`);
    process.exit(0);
  }

  throw error;
}

if (
  currentCache?.sourceUrl === sourceUrl &&
  JSON.stringify(currentCache?.items) === JSON.stringify(items)
) {
  console.log("Cache ECU 911 sin cambios.");
  process.exit(0);
}

const payload = {
  updatedAt: new Date().toISOString(),
  sourceUrl,
  items
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Cache ECU 911 actualizado con ${items.length} reportes.`);
