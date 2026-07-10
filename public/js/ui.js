// Funciones puras de interfaz: tarjetas, estadisticas, avisos y modales simples.
import { translations, translateState } from "./i18n.js";

// La clase del badge depende del texto normalizado del estado vial.
function getStateClass(state = "") {
  const value = state.toLowerCase();

  if (value.includes("cerrada")) return "badge-danger";
  if (value.includes("parcial")) return "badge-warn";
  return "badge-ok";
}

// Escapa valores usados dentro de atributos HTML generados dinamicamente.
function escapeAttribute(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Mantiene fechas legibles para Ecuador/Espanol y Estados Unidos/Ingles.
function formatIncidentDate(value, lang = "es") {
  if (!value) return "";

  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-EC", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

// Pinta las cuatro metricas principales del panel de estadisticas.
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

// Renderiza la lista visible y conecta el boton "Ver en mapa" con el controlador.
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
      const updatedAt = formatIncidentDate(item.updatedAt, lang);
      const voiceLabel = lang === "en"
        ? `Road ${item.via}. Status: ${stateText}. Observation: ${observation}.`
        : `Vía ${item.via}. Estado: ${stateText}. Observación: ${observation}.`;
      const updatedLine = updatedAt
        ? `<p class="small-text"><strong>${t.lastUpdated}:</strong> ${updatedAt}</p>`
        : "";
      const provinces = Array.isArray(item.provincias) && item.provincias.length
        ? item.provincias.join(", ")
        : item.provincia || "";
      const cantons = Array.isArray(item.cantones) ? item.cantones.join(", ") : "";

      return `
        <article class="incident-card" data-voice-label="${escapeAttribute(voiceLabel)}">
          <div class="incident-top">
            <div>
              <h3>${item.via}</h3>
              <div class="small-text">${t.provinces || t.province}: ${provinces}</div>
              <div class="small-text">${t.cantons || "Cantones"}: ${cantons || "N/A"}</div>
            </div>
            <span class="badge-state ${getStateClass(item.estado)}">${stateText}</span>
          </div>

          <p><strong>${t.observation}:</strong> ${observation}</p>
          <p><strong>${t.alternateRoute}:</strong> ${item.viaAlterna}</p>
          <p class="small-text"><strong>${t.source}:</strong> ${item.source}</p>
          ${updatedLine}

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

// Renderiza reportes ciudadanos en una lista separada de ECU 911.
export function renderUserIncidents(reports, handlers, lang = "es") {
  const t = translations[lang] || translations.es;
  const container = document.getElementById("incidentsList");

  if (!reports.length) {
    container.innerHTML = `<div class="empty-state">${t.noUserReports}</div>`;
    return;
  }

  container.innerHTML = reports
    .map((item) => {
      const road = item.viaDetectada || {};
      const createdAt = formatIncidentDate(item.creadoEn, lang);
      const roadName = road.nombreVia || t.noRoadNearby;
      const reporterName = item.reportante?.nombre || t.noReport;
      const voiceLabel = lang === "en"
        ? `Citizen report. ${item.tipoTexto}. Road: ${roadName}. Description: ${item.descripcion}.`
        : `Reporte ciudadano. ${item.tipoTexto}. Vía: ${roadName}. Descripción: ${item.descripcion}.`;
      const createdLine = createdAt
        ? `<p class="small-text"><strong>${t.reportCreatedAt}:</strong> ${createdAt}</p>`
        : "";

      return `
        <article class="incident-card user-report-card" data-voice-label="${escapeAttribute(voiceLabel)}">
          <div class="incident-top">
            <div>
              <h3>${item.tipoTexto || t.userReport}</h3>
              <div class="small-text">${t.road}: ${roadName}</div>
            </div>
            <span class="badge-state badge-citizen">${t.userReportBadge}</span>
          </div>

          <p><strong>${t.observation}:</strong> ${item.descripcion || t.noObservation}</p>
          <p><strong>${t.reporter}:</strong> ${reporterName}</p>
          <p><strong>${t.location}:</strong> ${item.provincia || ""} / ${item.canton || ""} / ${item.parroquia || ""}</p>
          <p class="small-text"><strong>${t.source}:</strong> ${t.userReports}</p>
          <p class="small-text report-warning"><i class="bi bi-exclamation-triangle-fill"></i> ${t.unverifiedReport}</p>
          ${createdLine}

          <div class="incident-actions">
            <button class="btn-primary" data-action="focus-user-report" data-id="${item.id}">
              ${t.viewMap}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll('button[data-action="focus-user-report"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const report = reports.find((x) => x.id === id);
      if (!report) return;

      handlers.onFocus?.(report);
    });
  });
}
// Toast flotante reutilizado por GPS, rutas, carga y errores de permisos.
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
// Modal breve para explicar cuando se dibujo una ruta aproximada.
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
