import { viasTramos } from "./viasTramosData.js";

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(content, tramo) {
  let score = 0;

  const via = normalizeText(tramo.via);
  if (content.includes(via)) score += 10;

  if (tramo.ref && content.includes(normalizeText(tramo.ref))) score += 4;

  for (const alias of tramo.aliases || []) {
    const aliasNorm = normalizeText(alias);
    if (aliasNorm && content.includes(aliasNorm)) score += 3;
  }

  return score;
}

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