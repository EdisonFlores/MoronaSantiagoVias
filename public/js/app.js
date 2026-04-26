//public/js/app.js
import { fetchIncidents, fetchOsrmRoute } from "./services.js";
import {
  initMap,
  getMapInstance,
  drawRouteGeometry,
  drawFallbackPolyline,
  focusIncidentOnMap,
  resetMapView,
  renderIncidentMarkers
} from "./map.js";
import { renderIncidents,showToast,showRouteNotice , renderStats } from "./ui.js";
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

function isMobileLayout() {
  return window.innerWidth <= 992;
}

function scrollToMapOnSmallScreens() {
  if (isMobileLayout()) {
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

function setMobileSidebarState(isOpen) {
  const sidebar = document.getElementById("mobileSidebar");
  const backdrop = document.getElementById("mobileSidebarBackdrop");
  const openBtn = document.getElementById("btnOpenIncidents");

  if (!sidebar || !backdrop || !openBtn) return;

  if (!isMobileLayout()) {
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("show");
    document.body.classList.remove("drawer-open");
    openBtn.setAttribute("aria-expanded", "false");
    return;
  }

  sidebar.classList.toggle("is-open", isOpen);
  backdrop.classList.toggle("show", isOpen);
  document.body.classList.toggle("drawer-open", isOpen);
  openBtn.setAttribute("aria-expanded", String(isOpen));
}

function closeMobileSidebar() {
  setMobileSidebarState(false);
}

function initMobileSidebar() {
  const openBtn = document.getElementById("btnOpenIncidents");
  const backdrop = document.getElementById("mobileSidebarBackdrop");

  openBtn?.addEventListener("click", () => {
    const sidebar = document.getElementById("mobileSidebar");
    const isOpen = sidebar?.classList.contains("is-open");
    setMobileSidebarState(!isOpen);
  });

  backdrop?.addEventListener("click", closeMobileSidebar);

  window.addEventListener("resize", () => {
    if (!isMobileLayout()) {
      closeMobileSidebar();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileSidebar();
    }
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
    onFocus: async (road) => {
      try {
        const segment = road.matchedRoadSegment;

        if (!segment) return;

        focusIncidentOnMap(segment, road);

        if (!segment?.start || !segment?.end) {
          closeMobileSidebar();
          showToast(
  lang === "en"
    ? "Approximate route shown. OSRM unavailable or slow."
    : "Ruta aproximada mostrada. OSRM no disponible o lento.",
  "warning"
);
showRouteNotice(
  lang === "en"
    ? "OSRM did not respond or took too long. An approximate route was drawn."
    : "OSRM no respondió o demoró demasiado. Se dibujó una ruta aproximada.",
  "warning"
);
          scrollToMapOnSmallScreens();
          return;
        }

       try {
  const routeResult = await fetchOsrmRoute(segment, {
    timeoutMs: 12000
  });

  drawRouteGeometry(routeResult.coordinates, road);
} catch (routeError) {
  console.warn("OSRM falló. Se usará polilínea aproximada:", routeError);

  drawFallbackPolyline(segment, road);

  showToast(
  lang === "en"
    ? "Approximate route shown. OSRM unavailable or slow."
    : "Ruta aproximada mostrada. OSRM no disponible o lento.",
  "warning"
);
showRouteNotice(
  lang === "en"
    ? "OSRM did not respond or took too long. An approximate route was drawn."
    : "OSRM no respondió o demoró demasiado. Se dibujó una ruta aproximada.",
  "warning"
);
}

closeMobileSidebar();
scrollToMapOnSmallScreens();
      } catch (error) {
        console.error(error);
        closeMobileSidebar();
        alert(
          lang === "en"
            ? "The route could not be drawn."
            : "No se pudo dibujar la ruta."
        );
      }
    }
  }, lang);
}

async function initApp() {
  initTheme();
  initMobileMenu();
  initMobileSidebar();

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