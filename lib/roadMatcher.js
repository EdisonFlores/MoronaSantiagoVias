import { viasTramos } from "./viasTramosData.js";

// Normaliza nombres para comparar ECU 911 contra los tramos definidos localmente.
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normaliza referencias viales para comparar E-40, E 40 o E40 como iguales.
function normalizeRef(text = "") {
  return normalizeText(text).replace(/[-\s]/g, "");
}

// Puntua coincidencias usando el nombre principal reportado por ECU 911.
function scoreMatch(item, tramo) {
  let score = 0;
  const primaryContent = normalizeText(`${item.via || ""} ${item.ref || ""}`);
  const via = normalizeText(tramo.via);

  if (primaryContent === via) score += 100;
  else if (primaryContent.includes(via) || via.includes(primaryContent)) score += 50;

  if (tramo.ref && normalizeRef(primaryContent).includes(normalizeRef(tramo.ref))) score += 4;

  for (const alias of tramo.aliases || []) {
    const aliasNorm = normalizeText(alias);
    if (aliasNorm && primaryContent.includes(aliasNorm)) score += 8;
  }

  return score;
}

// Devuelve el tramo base con mayor similitud para poder ubicarlo en el mapa.
export function matchRoadSegment(item) {
  let best = null;
  let bestScore = 0;

  for (const tramo of viasTramos) {
    const score = scoreMatch(item, tramo);
    if (score > bestScore) {
      best = tramo;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}
