//map.js
import { getCurrentLanguage } from "./translate.js";
import { translations } from "./i18n.js";

let map;
let roadLine = null;
let startMarker = null;
let endMarker = null;
let focusMarker = null;
let ecu911MarkersLayer = null;

function getLineColorByState(state = "") {
  const value = String(state).toLowerCase();

  if (value.includes("cerrada")) return "#dc2626";
  if (value.includes("parcial")) return "#eab308";
  if (value.includes("sin reporte")) return "#94a3b8";
  return "#16a34a";
}

function getIncidentBadgeClass(state = "") {
  const value = String(state).toLowerCase();

  if (value.includes("cerrada")) return "color:#dc2626;font-weight:700;";
  if (value.includes("parcial")) return "color:#ca8a04;font-weight:700;";
  if (value.includes("sin reporte")) return "color:#94a3b8;font-weight:700;";
  return "color:#16a34a;font-weight:700;";
}

function getSafeCoord(point) {
  if (!point) return null;

  if (Array.isArray(point) && point.length >= 2) {
    return [Number(point[0]), Number(point[1])];
  }

  if (
    typeof point === "object" &&
    point !== null &&
    point.lat !== undefined &&
    point.lng !== undefined
  ) {
    return [Number(point.lat), Number(point.lng)];
  }

  return null;
}

function buildIncidentPopup(incident) {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  const via = incident?.via || "Vía";
  const estado = incident?.estado || "Sin reporte";
  const observaciones = incident?.observaciones || "Sin observaciones.";
  const viaAlterna = incident?.viaAlterna || "N/A";
  const source = incident?.source || "ECU 911";
  const ref = incident?.ref ? ` (${incident.ref})` : "";

  return `
    <div style="min-width:220px; max-width:280px; line-height:1.45;">
      <div style="font-weight:800; margin-bottom:6px;">${via}${ref}</div>
      <div style="margin-bottom:4px;"><b>${t.stateLabel || "Estado"}:</b> <span style="${getIncidentBadgeClass(estado)}">${estado}</span></div>
      <div style="margin-bottom:4px;"><b>Observación:</b> ${observaciones}</div>
      <div style="margin-bottom:4px;"><b>Vía alterna:</b> ${viaAlterna}</div>
      <div><b>Fuente:</b> ${source}</div>
    </div>
  `;
}

export function initMap() {
  map = L.map("map").setView([-2.30814, -78.11135], 8);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  ecu911MarkersLayer = L.layerGroup().addTo(map);

  return map;
}

export function getMapInstance() {
  return map;
}

export function clearRoadGeometry() {
  if (!map) return;

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

export function clearIncidentFocus() {
  if (!map) return;

  if (focusMarker) {
    map.removeLayer(focusMarker);
    focusMarker = null;
  }
}

export function clearEcu911Markers() {
  ecu911MarkersLayer?.clearLayers();
}

export function clearAllMapElements() {
  clearRoadGeometry();
  clearIncidentFocus();
  clearEcu911Markers();
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

export function addIncidentMarker(incident) {
  if (!map || !ecu911MarkersLayer) return;

  const start = getSafeCoord(incident?.matchedRoadSegment?.start);
  if (!start) return;

  const marker = L.marker(start).bindPopup(buildIncidentPopup(incident));
  ecu911MarkersLayer.addLayer(marker);

  return marker;
}

export function renderIncidentMarkers(incidents = []) {
  if (!map || !ecu911MarkersLayer) return;

  clearEcu911Markers();

  incidents.forEach((incident) => {
    addIncidentMarker(incident);
  });
}

export function focusIncidentOnMap(segment, incident = null) {
  if (!map) return;

  const start = getSafeCoord(segment?.start);
  if (!start) return;

  clearIncidentFocus();

  focusMarker = L.marker(start).addTo(map);

  if (incident) {
    focusMarker.bindPopup(buildIncidentPopup(incident)).openPopup();
  } else {
    const lang = getCurrentLanguage();
    const t = translations[lang] || translations.es;
    focusMarker
      .bindPopup(
        `<b>${segment?.via || "Vía"}</b><br>${segment?.origen || t.mapStart} → ${segment?.destino || t.mapEnd}`
      )
      .openPopup();
  }

  map.setView(start, 10, { animate: true });
}

export function resetMapView() {
  clearAllMapElements();
  map.setView([-2.30814, -78.11135], 8);
}