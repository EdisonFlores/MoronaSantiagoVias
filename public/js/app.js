// app.js
import { fetchIncidents, fetchOsrmRoute } from "./services.js";
import {
  initMap,
  getMapInstance,
  drawRouteGeometry,
  focusIncidentOnMap,
  resetMapView,
  renderIncidentMarkers
} from "./map.js";
import { renderIncidents, renderStats } from "./ui.js";
import { initTheme } from "./theme.js";
import { initLanguage, getCurrentLanguage } from "./translate.js";
import { initWeather, bindWeatherToMap } from "./weather.js";

let allRoads = [];

function buildStats(roads) {
  return {
    total: roads.length,
    habilitada: roads.filter((x) => x.estado === "Habilitada").length,
    parcial: roads.filter((x) => x.estado === "Parcialmente habilitada").length,
    cerrada: roads.filter((x) => x.estado === "Cerrada").length
  };
}

function scrollToMapOnSmallScreens() {
  if (window.innerWidth <= 992) {
    const mapEl = document.getElementById("map");
    if (mapEl) {
      mapEl.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }
}

function initMobileMenu() {
  const btnMenu = document.getElementById("btnMenu");
  const headerActions = document.getElementById("headerActions");

  if (!btnMenu || !headerActions) return;

  btnMenu.addEventListener("click", () => {
    const isOpen = headerActions.classList.toggle("is-open");
    btnMenu.setAttribute("aria-expanded", String(isOpen));
  });
}
function showLoadingState() {
  const lang = getCurrentLanguage();

  const statsBox = document.getElementById("statsBox");
  const incidentsList = document.getElementById("incidentsList");

  if (statsBox) {
    statsBox.innerHTML = `
      <div class="loading-box" style="grid-column: 1 / -1;">
        <span class="loading-spinner"></span>
        <span>${lang === "en" ? "Loading statistics..." : "Cargando datos..."}</span>
      </div>
    `;
  }

  if (incidentsList) {
    incidentsList.innerHTML = `
      <div class="loading-box loading-roads">
        <span class="loading-spinner"></span>
        <span>${lang === "en" ? "Loading roads..." : "Cargando vías..."}</span>
      </div>
    `;
  }
}

function showLoadError() {
  const lang = getCurrentLanguage();
  const incidentsList = document.getElementById("incidentsList");
  const statsBox = document.getElementById("statsBox");

  if (statsBox) {
    statsBox.innerHTML = `
      <div class="empty-state">
        ${lang === "en" ? "Statistics could not be loaded." : "No se pudieron cargar los datos."}
      </div>
    `;
  }

  if (incidentsList) {
    incidentsList.innerHTML = `
      <div class="empty-state">
        ${lang === "en" ? "Roads could not be loaded." : "No se pudieron cargar las vías."}
      </div>
    `;
  }
}
function applyFilters() {
  const state = document.getElementById("filterState").value;
  const lang = getCurrentLanguage();

  let filtered = [...allRoads];

  if (state) {
    filtered = filtered.filter((item) => item.estado === state);
  }

  renderStats(buildStats(filtered), lang);
  renderIncidentMarkers(filtered);

  renderIncidents(filtered, {
    onFocus: (road) => {
      if (road.matchedRoadSegment) {
        focusIncidentOnMap(road.matchedRoadSegment, road);
        scrollToMapOnSmallScreens();
      }
    },
    onDraw: async (road) => {
      try {
        const segment = road.matchedRoadSegment;
        if (!segment?.start || !segment?.end) {
          alert(lang === "en"
            ? "There are no coordinates for this segment."
            : "No hay coordenadas para este tramo.");
          return;
        }

        const routeCoords = await fetchOsrmRoute(segment);
        drawRouteGeometry(routeCoords, road);
        scrollToMapOnSmallScreens();
      } catch (error) {
        console.error(error);
        alert(lang === "en"
          ? "The route could not be drawn."
          : "No se pudo dibujar la ruta.");
      }
    }
  }, lang);
}

async function initApp() {
  initTheme();
  initMobileMenu();

  initLanguage(() => {
    applyFilters();
    const map = getMapInstance();
    if (map) {
      bindWeatherToMap(map, getCurrentLanguage);
    }
  });

  initWeather();
  const map = initMap();
  bindWeatherToMap(map, getCurrentLanguage);

  document.getElementById("filterState")?.addEventListener("change", applyFilters);
  document.getElementById("btnResetMap")?.addEventListener("click", resetMapView);

  showLoadingState();

  try {
    const data = await fetchIncidents();
    allRoads = data.incidents || [];
    applyFilters();
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}
initApp();