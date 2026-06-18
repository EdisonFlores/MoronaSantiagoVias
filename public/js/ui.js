// public/js/ui.js
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
            <button class="btn-primary" data-action="focus" data-id="${item.id}">
              ${t.viewMap}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll('button[data-action="focus"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const road = roads.find((x) => x.id === id);
      if (!road) return;

      handlers.onFocus?.(road);
    });
  });
}
export function showToast(message, type = "warning", duration = 4000) {
  let container = document.querySelector(".toast-container");

  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon =
    type === "error"
      ? "bi-exclamation-triangle"
      : type === "success"
      ? "bi-check-circle"
      : "bi-exclamation-circle";

  toast.innerHTML = `
    <i class="bi ${icon}"></i>
    <div>${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 250);
  }, duration);
}
export function showRouteNotice(message, type = "warning") {
  let modal = document.getElementById("routeNoticeModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "routeNoticeModal";
    modal.className = "route-notice-modal";
    modal.innerHTML = `
      <div class="route-notice-card">
        <button class="route-notice-close" type="button" aria-label="Cerrar">
          <i class="bi bi-x-lg"></i>
        </button>

        <div class="route-notice-icon">
          <i class="bi bi-signpost-split"></i>
        </div>

        <h3 id="routeNoticeTitle">Ruta aproximada</h3>
        <p id="routeNoticeText"></p>

        <button class="btn-primary route-notice-btn" type="button">
          Entendido
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".route-notice-close").addEventListener("click", () => {
      modal.classList.remove("show");
    });

    modal.querySelector(".route-notice-btn").addEventListener("click", () => {
      modal.classList.remove("show");
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.classList.remove("show");
      }
    });
  }

  const text = modal.querySelector("#routeNoticeText");
  const card = modal.querySelector(".route-notice-card");

  text.textContent = message;

  card.classList.remove("notice-warning", "notice-error", "notice-success");
  card.classList.add(`notice-${type}`);

  modal.classList.add("show");
}