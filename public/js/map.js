import { getCurrentLanguage } from "./translate.js";
import { translations } from "./i18n.js";

let map;
let roadLine = null;
let startMarker = null;
let endMarker = null;

function getLineColorByState(state = "") {
  const value = state.toLowerCase();

  if (value.includes("cerrada")) return "#dc2626";
  if (value.includes("parcial")) return "#eab308";
  return "#16a34a";
}

export function initMap() {
  map = L.map("map").setView([-2.30814, -78.11135], 8);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  return map;
}

export function getMapInstance() {
  return map;
}

export function clearRoadGeometry() {
  if (roadLine) {
    map.removeLayer(roadLine);
    roadLine = null;
  }

  if (startMarker) {
    map.removeLayer(startMarker);
    startMarker = null;
  }

  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }
}

export function drawRouteGeometry(routeCoords, road) {
  if (!map || !Array.isArray(routeCoords) || routeCoords.length < 2) return;

  clearRoadGeometry();

  const color = getLineColorByState(road?.estado);
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  roadLine = L.polyline(routeCoords, {
    weight: 6,
    color,
    opacity: 0.95
  }).addTo(map);

  const first = routeCoords[0];
  const last = routeCoords[routeCoords.length - 1];

  startMarker = L.marker(first)
    .addTo(map)
    .bindPopup(`<b>${t.mapStart}:</b> ${road?.matchedRoadSegment?.origen || t.mapStart}`);

  endMarker = L.marker(last)
    .addTo(map)
    .bindPopup(`<b>${t.mapEnd}:</b> ${road?.matchedRoadSegment?.destino || t.mapEnd}`);

  map.fitBounds(L.latLngBounds(routeCoords), { padding: [32, 32] });
}

export function focusIncidentOnMap(segment) {
  if (!map || !segment?.start) return;
  map.setView(segment.start, 10);
}

export function resetMapView() {
  clearRoadGeometry();
  map.setView([-2.30814, -78.11135], 8);
}