//ui.js
import { translations, translateState } from "./i18n.js";

function getStateClass(state = "") {
  const value = state.toLowerCase();

  if (value.includes("cerrada")) return "badge-danger";
  if (value.includes("parcial")) return "badge-warn";
  return "badge-ok";
}

export function renderStats(stats, lang = "es") {
  const t = translations[lang] || translations.es;
  const box = document.getElementById("statsBox");

  box.innerHTML = `
    <div class="stat-card">
      <strong>${stats.total}</strong>
      <span>${t.total}</span>
    </div>
    <div class="stat-card">
      <strong>${stats.habilitada}</strong>
      <span>${t.open}</span>
    </div>
    <div class="stat-card">
      <strong>${stats.parcial}</strong>
      <span>${t.partial}</span>
    </div>
    <div class="stat-card">
      <strong>${stats.cerrada}</strong>
      <span>${t.closed}</span>
    </div>
  `;
}

export function renderIncidents(roads, handlers, lang = "es") {
  const t = translations[lang] || translations.es;
  const container = document.getElementById("incidentsList");

  if (!roads.length) {
    container.innerHTML = `<div class="empty-state">${t.noRoads}</div>`;
    return;
  }

  container.innerHTML = roads
    .map((item) => {
      const observation = item.observaciones || t.noNews;
      const stateText = translateState(item.estado, lang);

      return `
        <article class="incident-card">
          <div class="incident-top">
            <div>
              <h3>${item.via}</h3>
              <div class="small-text">${t.province}: ${item.provincia}</div>
            </div>
            <span class="badge-state ${getStateClass(item.estado)}">${stateText}</span>
          </div>

          <p><strong>${t.observation}:</strong> ${observation}</p>
          <p><strong>${t.alternateRoute}:</strong> ${item.viaAlterna}</p>
          <p class="small-text"><strong>${t.source}:</strong> ${item.source}</p>

          <div class="incident-actions">
            <button class="btn-secondary" data-action="focus" data-id="${item.id}">
              ${t.viewMap}
            </button>
            <button class="btn-primary" data-action="draw" data-id="${item.id}">
              ${t.drawRoute}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const road = roads.find((x) => x.id === id);
      if (!road) return;

      if (action === "focus") handlers.onFocus(road);
      if (action === "draw") handlers.onDraw(road);
    });
  });
}