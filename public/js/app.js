// app.js
import { fetchIncidents, fetchOsrmRoute } from "./services.js";
import { initMap, getMapInstance, drawRouteGeometry, focusIncidentOnMap, resetMapView } from "./map.js";
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

function applyFilters() {
  const state = document.getElementById("filterState").value;
  const lang = getCurrentLanguage();

  let filtered = [...allRoads];

  if (state) {
    filtered = filtered.filter((item) => item.estado === state);
  }

  renderStats(buildStats(filtered), lang);

  renderIncidents(filtered, {
    onFocus: (road) => {
      if (road.matchedRoadSegment) {
        focusIncidentOnMap(road.matchedRoadSegment);
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

  try {
    const data = await fetchIncidents();
    allRoads = data.incidents || [];
    applyFilters();
  } catch (error) {
    console.error(error);
    document.getElementById("incidentsList").innerHTML =
      `<div class="empty-state">${
        getCurrentLanguage() === "en"
          ? "Roads could not be loaded."
          : "No se pudieron cargar las vías."
      }</div>`;
  }
}

initApp();