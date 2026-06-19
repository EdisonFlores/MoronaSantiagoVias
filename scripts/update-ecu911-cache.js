import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeEcu911MoronaSantiago } from "../lib/scrapeEcu911.js";

const outputUrl = new URL("../data/ecu911-morona-santiago.json", import.meta.url);
const outputPath = fileURLToPath(outputUrl);

const items = await scrapeEcu911MoronaSantiago();

if (!items.length) {
  throw new Error("ECU 911 no devolvio reportes para Morona Santiago.");
}

try {
  const current = JSON.parse(await readFile(outputPath, "utf8"));
  if (JSON.stringify(current.items) === JSON.stringify(items)) {
    console.log("Cache ECU 911 sin cambios.");
    process.exit(0);
  }
} catch {
  // Si no existe cache previo o no se puede leer, se genera uno nuevo.
}

const payload = {
  updatedAt: new Date().toISOString(),
  sourceUrl: "https://www.ecu911.gob.ec/consulta-de-vias/",
  items
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Cache ECU 911 actualizado con ${items.length} reportes.`);
