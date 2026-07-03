// Centraliza la integracion con Leaflet: capas base, rutas, incidentes y recorrido GPS.
import { getCurrentLanguage } from "./translate.js";
import { translations } from "./i18n.js";

let map;
let roadLine = null;
let startMarker = null;
let endMarker = null;
let focusMarker = null;
let ecu911MarkersLayer = null;
let userReportsLayer = null;
let reportDraftMarker = null;
let reportPickHandler = null;
let userLocationMarker = null;
let userAccuracyCircle = null;
let userPathLine = null;
let userPathCoords = [];

// Usa el estado vial para mantener colores consistentes entre mapa y tarjetas.
function getLineColorByState(state = "") {
  const value = String(state).toLowerCase();

  if (value.includes("cerrada")) return "#dc2626";
  if (value.includes("parcial")) return "#eab308";
  if (value.includes("sin reporte")) return "#94a3b8";
  return "#16a34a";
}

// Devuelve estilos inline para el estado dentro de popups de Leaflet.
function getIncidentBadgeClass(state = "") {
  const value = String(state).toLowerCase();

  if (value.includes("cerrada")) return "color:#dc2626;font-weight:700;";
  if (value.includes("parcial")) return "color:#ca8a04;font-weight:700;";
  if (value.includes("sin reporte")) return "color:#94a3b8;font-weight:700;";
  return "color:#16a34a;font-weight:700;";
}

// Escapa texto antes de insertarlo en HTML generado para popups.
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Marcador personalizado del recorrido; rota con el rumbo cuando el GPS lo entrega.
function buildUserLocationIcon(heading = null) {
  const rotation = Number.isFinite(heading) ? heading : 0;

  return L.divIcon({
    className: "leaflet-user-car-marker",
    html: `<div class="user-car-icon" style="transform: rotate(${rotation}deg);"><i class="bi bi-car-front-fill"></i></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -18]
  });
}

// Icono diferenciado para incidentes reportados por usuarios.
function buildUserReportIcon() {
  return L.divIcon({
    className: "leaflet-user-report-marker",
    html: `<div class="user-report-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 34],
    popupAnchor: [0, -30]
  });
}

// Icono temporal usado mientras el usuario elige el punto del incidente.
function buildReportDraftIcon() {
  return L.divIcon({
    className: "leaflet-report-draft-marker",
    html: `<div class="report-draft-icon"><i class="bi bi-geo-alt-fill"></i></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 34],
    popupAnchor: [0, -30]
  });
}

// Formatea fechas de reportes para mostrarlas compactas en popups.
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

// Normaliza coordenadas que pueden venir como [lat,lng] o como objeto.
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

// Popup reutilizable para incidentes y marcadores enfocados.
function buildIncidentPopup(incident) {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  const via = incident?.via || "Vía";
  const estado = incident?.estado || "Sin reporte";
  const observaciones = incident?.observaciones || "Sin observaciones.";
  const viaAlterna = incident?.viaAlterna || "N/A";
  const source = incident?.source || "ECU 911";
  const ref = incident?.ref ? ` (${incident.ref})` : "";
  const updatedAt = formatIncidentDate(incident?.updatedAt, lang);
  const updatedLine = updatedAt
    ? `<div style="margin-top:4px;"><b>${t.lastUpdated || "Actualizado por ECU 911"}:</b> ${updatedAt}</div>`
    : "";

  return `
    <div style="min-width:220px; max-width:280px; line-height:1.45;">
      <div style="font-weight:800; margin-bottom:6px;">${via}${ref}</div>
      <div style="margin-bottom:4px;"><b>${t.stateLabel || "Estado"}:</b> <span style="${getIncidentBadgeClass(estado)}">${estado}</span></div>
      <div style="margin-bottom:4px;"><b>Observación:</b> ${observaciones}</div>
      <div style="margin-bottom:4px;"><b>Vía alterna:</b> ${viaAlterna}</div>
      <div><b>Fuente:</b> ${source}</div>
      ${updatedLine}
    </div>
  `;
}

// Popup para reportes ciudadanos con aviso de que no son reportes oficiales.
function buildUserReportPopup(report) {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const location = report?.ubicacion || {};
  const road = report?.viaDetectada || {};
  const reporterName = report?.reportante?.nombre || t.noReport;
  const createdAt = formatIncidentDate(report?.creadoEn, lang);
  const createdLine = createdAt
    ? `<div style="margin-top:4px;"><b>${escapeHtml(t.reportCreatedAt || "Reportado")}:</b> ${escapeHtml(createdAt)}</div>`
    : "";

  return `
    <div style="min-width:220px; max-width:280px; line-height:1.45;">
      <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(report?.tipoTexto || t.userReport || "Reporte ciudadano")}</div>
      <div style="margin-bottom:4px;"><b>${escapeHtml(t.road)}:</b> ${escapeHtml(road.nombreVia || t.noRoadNearby)}</div>
      <div style="margin-bottom:4px;"><b>${escapeHtml(t.location)}:</b> ${escapeHtml(report?.canton || "")} ${escapeHtml(report?.parroquia || "")}</div>
      <div style="margin-bottom:4px;"><b>${escapeHtml(t.reporter)}:</b> ${escapeHtml(reporterName)}</div>
      <div style="margin-bottom:4px;"><b>${escapeHtml(t.observation)}:</b> ${escapeHtml(report?.descripcion || t.noObservation)}</div>
      <div style="margin-bottom:4px;"><b>${escapeHtml(t.source)}:</b> ${escapeHtml(t.userReports)}</div>
      <div style="color:#ca8a04; font-weight:700;">${escapeHtml(t.unverifiedReport)}</div>
      ${createdLine}
      ${Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
        ? `<div style="margin-top:4px; font-size:12px;">${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}</div>`
        : ""}
    </div>
  `;
}

// Crea el mapa Leaflet base, agrega OpenStreetMap y prepara capa de incidentes.
export function initMap() {
  map = L.map("map").setView([-2.30814, -78.11135], 8);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  ecu911MarkersLayer = L.layerGroup().addTo(map);
  userReportsLayer = L.layerGroup().addTo(map);

  return map;
}

// Expone la instancia Leaflet para otros modulos que necesitan leer el mapa.
export function getMapInstance() {
  return map;
}

// Limpia solo la ruta dibujada, sin borrar marcadores ECU 911 ni ubicacion del usuario.
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

// Limpia el marcador temporal que se abre al enfocar un incidente.
export function clearIncidentFocus() {
  if (!map) return;

  if (focusMarker) {
    map.removeLayer(focusMarker);
    focusMarker = null;
  }
}

// Elimina todos los marcadores ECU 911 visibles.
export function clearEcu911Markers() {
  ecu911MarkersLayer?.clearLayers();
}

// Elimina los marcadores ciudadanos visibles.
export function clearUserReportMarkers() {
  userReportsLayer?.clearLayers();
}

// Limpia rutas, foco e incidentes sin tocar el seguimiento GPS.
export function clearAllMapElements() {
  clearRoadGeometry();
  clearIncidentFocus();
  clearEcu911Markers();
  clearUserReportMarkers();
}

// Borra el marcador de auto, circulo de precision y estela del recorrido.
export function clearTravelTracking() {
  if (!map) return;

  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }

  if (userAccuracyCircle) {
    map.removeLayer(userAccuracyCircle);
    userAccuracyCircle = null;
  }

  if (userPathLine) {
    map.removeLayer(userPathLine);
    userPathLine = null;
  }

  userPathCoords = [];
}

// Actualiza en vivo la ubicacion del usuario y dibuja el rastro recorrido.
export function updateTravelPosition(location, nearestRoad = null, options = {}) {
  if (!map || !location) return;

  const lat = Number(location.lat);
  const lng = Number(location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const latLng = [lat, lng];
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const accuracy = Number(location.accuracy);
  const heading = Number(location.heading);
  const hasAccuracy = Number.isFinite(accuracy);
  const distance = Number(nearestRoad?.distanceMeters);
  const distanceLabel = Number.isFinite(distance)
    ? distance < 1000
      ? `${Math.round(distance)} m`
      : `${(distance / 1000).toFixed(1)} km`
    : "";
  const roadName = nearestRoad?.road?.via || t.noRoadNearby;
  const roadState = nearestRoad?.road?.estado || t.noRoadState;
  const popup = `
    <div class="user-location-popup">
      <strong>${escapeHtml(t.yourLocation)}</strong>
      <span>${escapeHtml(t.nearestRoad)}: ${escapeHtml(roadName)}</span>
      <span>${escapeHtml(t.stateLabel)}: ${escapeHtml(roadState)}</span>
      ${distanceLabel ? `<span>${escapeHtml(t.distanceToRoad)}: ${distanceLabel}</span>` : ""}
      ${hasAccuracy ? `<span>${escapeHtml(t.locationAccuracy)}: ${Math.round(accuracy)} m</span>` : ""}
    </div>
  `;

  if (!userLocationMarker) {
    userLocationMarker = L.marker(latLng, {
      icon: buildUserLocationIcon(heading)
    }).addTo(map);
  } else {
    userLocationMarker.setLatLng(latLng);
    userLocationMarker.setIcon(buildUserLocationIcon(heading));
  }

  userLocationMarker.bindPopup(popup);

  if (hasAccuracy) {
    if (!userAccuracyCircle) {
      userAccuracyCircle = L.circle(latLng, {
        radius: accuracy,
        color: "#0ea5e9",
        fillColor: "#0ea5e9",
        fillOpacity: 0.12,
        weight: 1.5
      }).addTo(map);
    } else {
      userAccuracyCircle.setLatLng(latLng);
      userAccuracyCircle.setRadius(accuracy);
    }
  }

  const lastCoord = userPathCoords[userPathCoords.length - 1];
  const changedEnough = !lastCoord || Math.abs(lastCoord[0] - lat) > 0.00001 || Math.abs(lastCoord[1] - lng) > 0.00001;

  if (changedEnough) {
    userPathCoords.push(latLng);
  }

  if (userPathCoords.length >= 2) {
    if (!userPathLine) {
      userPathLine = L.polyline(userPathCoords, {
        color: "#0ea5e9",
        weight: 4,
        opacity: 0.9,
        dashArray: "8, 10"
      }).addTo(map);
    } else {
      userPathLine.setLatLngs(userPathCoords);
    }
  }

  if (options.follow) {
    map.setView(latLng, Math.max(map.getZoom(), 15), { animate: true });
  }
}

// Dibuja la geometria real devuelta por OSRM y ajusta el mapa a sus limites.
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
// Fallback visual cuando OSRM falla: conecta origen/destino con linea punteada.
export function drawFallbackPolyline(segment, road) {
  if (!map || !segment?.start || !segment?.end) return;

  const start = getSafeCoord(segment.start);
  const end = getSafeCoord(segment.end);

  if (!start || !end) return;

  clearRoadGeometry();

  const color = getLineColorByState(road?.estado);
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  const routeCoords = [start, end];

  roadLine = L.polyline(routeCoords, {
    weight: 5,
    color,
    opacity: 0.85,
    dashArray: "10, 10"
  }).addTo(map);

  startMarker = L.marker(start)
    .addTo(map)
    .bindPopup(`<b>${t.mapStart}:</b> ${segment?.origen || t.mapStart}`);

  endMarker = L.marker(end)
    .addTo(map)
    .bindPopup(`<b>${t.mapEnd}:</b> ${segment?.destino || t.mapEnd}`);

  roadLine.bindPopup(
    lang === "en"
      ? "Approximate route. OSRM was unavailable or took too long."
      : "Ruta aproximada. OSRM no respondió o demoró demasiado."
  );

  map.fitBounds(L.latLngBounds(routeCoords), { padding: [32, 32] });
}
// Agrega un marcador individual de incidente sobre el inicio del tramo asociado.
export function addIncidentMarker(incident, handlers = {}) {
  if (!map || !ecu911MarkersLayer) return;

  const start = getSafeCoord(incident?.matchedRoadSegment?.start);
  if (!start) return;

  const marker = L.marker(start);

  if (handlers.onSelect) {
    marker.on("click", () => handlers.onSelect(incident));
  } else {
    marker.bindPopup(buildIncidentPopup(incident));
  }

  ecu911MarkersLayer.addLayer(marker);

  return marker;
}

// Redibuja la capa completa de marcadores segun los incidentes visibles.
export function renderIncidentMarkers(incidents = [], handlers = {}) {
  if (!map || !ecu911MarkersLayer) return;

  clearEcu911Markers();

  incidents.forEach((incident) => {
    addIncidentMarker(incident, handlers);
  });
}

// Agrega un marcador ciudadano individual en su coordenada exacta.
export function addUserReportMarker(report, handlers = {}) {
  if (!map || !userReportsLayer) return;

  const lat = Number(report?.ubicacion?.lat);
  const lng = Number(report?.ubicacion?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const marker = L.marker([lat, lng], {
    icon: buildUserReportIcon()
  }).bindPopup(buildUserReportPopup(report));

  marker.on("click", () => handlers.onSelect?.(report));
  userReportsLayer.addLayer(marker);

  return marker;
}

// Redibuja todos los reportes ciudadanos visibles.
export function renderUserReportMarkers(reports = [], handlers = {}) {
  if (!map || !userReportsLayer) return;

  clearUserReportMarkers();
  reports.forEach((report) => addUserReportMarker(report, handlers));
}

// Centra el mapa sobre un reporte ciudadano y muestra su popup.
export function focusUserReportOnMap(report) {
  if (!map) return;

  const lat = Number(report?.ubicacion?.lat);
  const lng = Number(report?.ubicacion?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  clearIncidentFocus();
  focusMarker = L.marker([lat, lng], {
    icon: buildUserReportIcon()
  }).addTo(map);
  focusMarker.bindPopup(buildUserReportPopup(report)).openPopup();
  map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
}

// Marca visualmente el punto que se enviara en el formulario ciudadano.
export function setReportDraftLocation(location) {
  if (!map || !location) return;

  const lat = Number(location.lat);
  const lng = Number(location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const latLng = [lat, lng];

  if (!reportDraftMarker) {
    reportDraftMarker = L.marker(latLng, {
      icon: buildReportDraftIcon()
    }).addTo(map);
  } else {
    reportDraftMarker.setLatLng(latLng);
  }

  reportDraftMarker.bindPopup("Punto del reporte").openPopup();
}

// Quita el punto temporal del formulario.
export function clearReportDraftLocation() {
  if (!map || !reportDraftMarker) return;

  map.removeLayer(reportDraftMarker);
  reportDraftMarker = null;
}

// Permite tomar una coordenada desde el siguiente clic sobre el mapa.
export function enableReportLocationPicker(onPick) {
  if (!map) return () => {};

  cancelReportLocationPicker();
  map.getContainer().classList.add("is-picking-report-location");

  reportPickHandler = (event) => {
    const location = {
      lat: event.latlng.lat,
      lng: event.latlng.lng
    };

    setReportDraftLocation(location);
    onPick?.(location);
    cancelReportLocationPicker();
  };

  map.once("click", reportPickHandler);

  return cancelReportLocationPicker;
}

// Cancela el modo de seleccion en mapa si el usuario cierra el modal.
export function cancelReportLocationPicker() {
  if (!map) return;

  if (reportPickHandler) {
    map.off("click", reportPickHandler);
    reportPickHandler = null;
  }

  map.getContainer().classList.remove("is-picking-report-location");
}

// Centra el mapa en un tramo y abre informacion del incidente si esta disponible.
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

// Devuelve el mapa a la vista provincial inicial y limpia elementos temporales.
export function resetMapView() {
  clearAllMapElements();
  clearTravelTracking();
  map.setView([-2.30814, -78.11135], 8);
}
