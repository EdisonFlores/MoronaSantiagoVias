// Parser de boletines manuales: convierte lineas con estado vial en incidentes.
// Normaliza texto de boletines para comparar sin acentos ni signos raros.
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Detecta el estado aunque el texto venga con emojis, mayusculas o acentos.
function cleanState(raw = "") {
  const value = normalizeText(raw);

  if (value.includes("parcial")) return "Parcialmente habilitada";
  if (value.includes("cerrad")) return "Cerrada";
  if (value.includes("habilitad")) return "Habilitada";

  return "Habilitada";
}

// Algunas vias incluyen referencias entre corchetes, por ejemplo [E-40].
function extractRef(via = "") {
  const match = via.match(/\[(.*?)\]/);
  return match ? match[1].trim() : "";
}

// Recorre el boletin y devuelve incidentes listos para cruzar con la red vial.
export function parseBulletinText(bulletinText = "") {
  const lines = bulletinText
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const usefulLines = lines.filter((line) => /^[✅⚠️🚫]/u.test(line));

  return usefulLines.map((line, index) => {
    const cleaned = line
      .replace(/^[✅⚠️🚫]\s*/u, "")
      .replace(/\*/g, "")
      .trim();

    const firstColon = cleaned.indexOf(":");
    const head = firstColon >= 0 ? cleaned.slice(0, firstColon).trim() : cleaned;
    const body = firstColon >= 0 ? cleaned.slice(firstColon + 1).trim() : "";

    const stateMatch = cleaned.match(/(PARCIALMENTE HABILITADA|HABILITADA|CERRADA)/i);
    const estado = cleanState(stateMatch?.[1] || "");

    const viaPart = cleaned
      .replace(/(PARCIALMENTE HABILITADA|HABILITADA|CERRADA)/i, "")
      .replace(/:+/g, " ")
      .trim();

    const via = viaPart
      .replace(/\[(.*?)\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      id: `bulletin-${index + 1}`,
      provincia: "Morona Santiago",
      via,
      ref: extractRef(cleaned),
      estado,
      observaciones: body || "Sin observaciones",
      viaAlterna: "N/A"
    };
  });
}
