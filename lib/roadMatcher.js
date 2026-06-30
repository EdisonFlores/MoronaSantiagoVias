import { viasTramos } from "./viasTramosData.js";

// Normaliza nombres para comparar ECU 911 contra los tramos definidos localmente.
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normaliza referencias viales para comparar E-40, E 40 o E40 como iguales.
function normalizeRef(text = "") {
  return normalizeText(text).replace(/[-\s]/g, "");
}

// Puntua coincidencias por nombre, codigo E-* y alias conocidos.
function scoreMatch(content, tramo) {
  let score = 0;

  const via = normalizeText(tramo.via);
  if (content.includes(via)) score += 10;

  if (tramo.ref && normalizeRef(content).includes(normalizeRef(tramo.ref))) score += 4;

  for (const alias of tramo.aliases || []) {
    const aliasNorm = normalizeText(alias);
    if (aliasNorm && content.includes(aliasNorm)) score += 3;
  }

  return score;
}

// Devuelve el tramo base con mayor similitud para poder ubicarlo en el mapa.
export function matchRoadSegment(item) {
  const content = normalizeText(`
    ${item.via || ""}
    ${item.ref || ""}
    ${item.observaciones || ""}
    ${item.viaAlterna || ""}
  `);

  let best = null;
  let bestScore = 0;

  for (const tramo of viasTramos) {
    const score = scoreMatch(content, tramo);
    if (score > bestScore) {
      best = tramo;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}
