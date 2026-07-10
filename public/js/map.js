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
let administrativeLayer = null;
let administrativeRenderVersion = 0;
let roadAdministrativeHighlightLayer = null;
let roadAdministrativeHighlightVersion = 0;
let roadAdministrativeLegend = null;
const administrativeGeoJsonCache = {};

const ADMINISTRATIVE_GEOJSON_URLS = {
  ecuador: "https://raw.githubusercontent.com/pabl-o-ce/Ecuador-geoJSON/master/geojson/ecuador.geojson",
  provinces: "https://raw.githubusercontent.com/pabl-o-ce/Ecuador-geoJSON/master/geojson/provinces.geojson",
  cantons: "https://raw.githubusercontent.com/pabl-o-ce/Ecuador-geoJSON/master/geojson/cantons.geojson"
};

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

// Normaliza nombres administrativos para comparar aunque tengan tildes o espacios distintos.
function normalizeAdministrativeName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Lee una propiedad GeoJSON probando varios nombres comunes segun la fuente.
function readGeoJsonProperty(feature, keys = []) {
  const properties = feature?.properties || {};
  const lowerKeyMap = Object.fromEntries(
    Object.keys(properties).map((key) => [key.toLowerCase(), key])
  );

  for (const key of keys) {
    const directValue = properties[key];
    if (directValue !== undefined && directValue !== null && directValue !== "") {
      return directValue;
    }

    const realKey = lowerKeyMap[String(key).toLowerCase()];
    const looseValue = realKey ? properties[realKey] : undefined;
    if (looseValue !== undefined && looseValue !== null && looseValue !== "") {
      return looseValue;
    }
  }

  return "";
}

// Obtiene el nombre de provincia en distintos esquemas de atributos GeoJSON.
function getGeoJsonProvinceName(feature) {
  return readGeoJsonProperty(feature, [
    "DPA_DESPRO",
    "DPA_PROVIN",
    "PROVINCIA",
    "provincia",
    "province",
    "NAME_1",
    "NOMBRE",
    "name"
  ]);
}

// Obtiene el nombre del canton para mostrarlo en tooltips.
function getGeoJsonCantonName(feature) {
  return readGeoJsonProperty(feature, [
    "DPA_DESCAN",
    "CANTON",
    "canton",
    "NAME_2",
    "NOMBRE",
    "name"
  ]);
}

// Descarga y cachea GeoJSON administrativos para no repetir lecturas remotas.
async function fetchAdministrativeGeoJson(type) {
  if (administrativeGeoJsonCache[type]) {
    return administrativeGeoJsonCache[type];
  }

  const response = await fetch(ADMINISTRATIVE_GEOJSON_URLS[type]);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${type}.geojson`);
  }

  const data = await response.json();
  administrativeGeoJsonCache[type] = data;
  return data;
}

// Convierte la geometria vial [lat, lng] al orden GeoJSON [lng, lat].
function getRoadGeoJsonPoints(road) {
  const segment = road?.matchedRoadSegment || road || {};
  const rawPoints = Array.isArray(segment.points) && segment.points.length >= 2
    ? segment.points
    : [segment.start, segment.end];

  return rawPoints
    .map((point) => Array.isArray(point) ? [Number(point[1]), Number(point[0])] : null)
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function pointIsOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-10) return false;

  return point[0] >= Math.min(start[0], end[0]) - 1e-10 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-10 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-10 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-10;
}

function pointIsInsideRing(point, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (pointIsOnSegment(point, ring[j], ring[i])) return true;
    const intersects = ((ring[i][1] > point[1]) !== (ring[j][1] > point[1])) &&
      point[0] < ((ring[j][0] - ring[i][0]) * (point[1] - ring[i][1])) /
        (ring[j][1] - ring[i][1]) + ring[i][0];
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointIsInsidePolygon(point, polygon) {
  if (!polygon?.length || !pointIsInsideRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointIsInsideRing(point, hole));
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(value) < 1e-10 ? 0 : value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && pointIsOnSegment(c, a, b)) ||
    (o2 === 0 && pointIsOnSegment(d, a, b)) ||
    (o3 === 0 && pointIsOnSegment(a, c, d)) ||
    (o4 === 0 && pointIsOnSegment(b, c, d));
}

function lineCrossesPolygon(points, polygon) {
  if (points.some((point) => pointIsInsidePolygon(point, polygon))) return true;

  return points.slice(0, -1).some((start, index) => {
    const end = points[index + 1];
    return polygon.some((ring) => ring.slice(0, -1).some((edgeStart, edgeIndex) =>
      segmentsIntersect(start, end, edgeStart, ring[edgeIndex + 1])
    ));
  });
}

function roadCrossesFeature(points, feature) {
  const geometry = feature?.geometry;
  if (!geometry || points.length < 2) return false;

  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates : [];

  return polygons.some((polygon) => lineCrossesPolygon(points, polygon));
}

function uniqueAdministrativeNames(names) {
  const unique = new Map();
  names.filter(Boolean).forEach((name) => {
    const label = String(name).trim();
    unique.set(normalizeAdministrativeName(label), label);
  });
  return [...unique.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

// Enriquece cada via con todos los territorios que cruza, no solo con su punto inicial.
export async function enrichRoadsWithAdministrativeAreas(roads = []) {
  const [provincesGeoJson, cantonsGeoJson] = await Promise.all([
    fetchAdministrativeGeoJson("provinces"),
    fetchAdministrativeGeoJson("cantons")
  ]);

  return roads.map((road) => {
    const points = getRoadGeoJsonPoints(road);
    const provincias = uniqueAdministrativeNames(
      (provincesGeoJson.features || [])
        .filter((feature) => roadCrossesFeature(points, feature))
        .map(getGeoJsonProvinceName)
    );
    const cantones = uniqueAdministrativeNames(
      (cantonsGeoJson.features || [])
        .filter((feature) => roadCrossesFeature(points, feature))
        .map(getGeoJsonCantonName)
    );

    const fallbackProvince = String(road.provincia || "").trim();
    const finalProvinces = provincias.length ? provincias : (fallbackProvince ? [fallbackProvince] : []);

    return {
      ...road,
      provincia: finalProvinces[0] || fallbackProvince,
      provincias: finalProvinces,
      cantones
    };
  });
}

// Resalta las divisiones administrativas atravesadas por la via seleccionada.
export async function renderRoadAdministrativeHighlights(road) {
  if (!map) return;

  const renderVersion = ++roadAdministrativeHighlightVersion;
  clearRoadAdministrativeHighlights({ invalidatePending: false });

  const points = getRoadGeoJsonPoints(road);
  if (points.length < 2) return;

  try {
    const [provincesGeoJson, cantonsGeoJson] = await Promise.all([
      fetchAdministrativeGeoJson("provinces"),
      fetchAdministrativeGeoJson("cantons")
    ]);

    if (renderVersion !== roadAdministrativeHighlightVersion) return;

    const provinceNames = new Set((road?.provincias || [road?.provincia])
      .map(normalizeAdministrativeName)
      .filter(Boolean));
    const cantonNames = new Set((road?.cantones || [])
      .map(normalizeAdministrativeName)
      .filter(Boolean));
    const provinceFeatures = (provincesGeoJson.features || [])
      .filter((feature) => roadCrossesFeature(points, feature) ||
        provinceNames.has(normalizeAdministrativeName(getGeoJsonProvinceName(feature))));
    const cantonFeatures = (cantonsGeoJson.features || [])
      .filter((feature) => roadCrossesFeature(points, feature) ||
        cantonNames.has(normalizeAdministrativeName(getGeoJsonCantonName(feature))));

    const provinceLayer = L.geoJSON({ type: "FeatureCollection", features: provinceFeatures }, {
      style: {
        className: "road-province-highlight",
        color: "#8b5cf6",
        weight: 3,
        opacity: 0.82,
        fillColor: "#c4b5fd",
        fillOpacity: 0.12,
        lineCap: "round",
        lineJoin: "round"
      },
      onEachFeature: (feature, layer) => {
        const name = getGeoJsonProvinceName(feature);
        if (name) layer.bindTooltip(`${escapeHtml((translations[getCurrentLanguage()] || translations.es).province)}: ${escapeHtml(name)}`, { sticky: true });
      }
    });

    const cantonLayer = L.geoJSON({ type: "FeatureCollection", features: cantonFeatures }, {
      style: {
        className: "road-canton-highlight",
        color: "#0891b2",
        weight: 2.1,
        opacity: 0.78,
        fillColor: "#67e8f9",
        fillOpacity: 0.1,
        dashArray: "6, 6",
        lineCap: "round",
        lineJoin: "round"
      },
      onEachFeature: (feature, layer) => {
        const name = getGeoJsonCantonName(feature);
        if (name) layer.bindTooltip(`${escapeHtml((translations[getCurrentLanguage()] || translations.es).cantons || "Cantón")}: ${escapeHtml(name)}`, { sticky: true });
      }
    });

    roadAdministrativeHighlightLayer = L.layerGroup([provinceLayer, cantonLayer]).addTo(map);
    provinceLayer.bringToFront();
    cantonLayer.bringToFront();

    const t = translations[getCurrentLanguage()] || translations.es;
    roadAdministrativeLegend = L.control({ position: "bottomright" });
    roadAdministrativeLegend.onAdd = () => {
      const legend = L.DomUtil.create("div", "road-administrative-legend");
      legend.innerHTML = `
        <strong>${escapeHtml(road?.via || t.road)}</strong>
        <span><i class="road-admin-swatch province"></i>${escapeHtml(t.provinces || t.province)}</span>
        <span><i class="road-admin-swatch canton"></i>${escapeHtml(t.cantons || "Cantones")}</span>
      `;
      L.DomEvent.disableClickPropagation(legend);
      return legend;
    };
    roadAdministrativeLegend.addTo(map);
  } catch (error) {
    if (renderVersion !== roadAdministrativeHighlightVersion) return;
    console.warn("No se pudieron resaltar provincias y cantones de la via:", error);
  }
}

export function clearRoadAdministrativeHighlights(options = {}) {
  if (options.invalidatePending !== false) roadAdministrativeHighlightVersion += 1;
  if (!map) return;
  if (roadAdministrativeHighlightLayer) {
    map.removeLayer(roadAdministrativeHighlightLayer);
    roadAdministrativeHighlightLayer = null;
  }
  if (roadAdministrativeLegend) {
    map.removeControl(roadAdministrativeLegend);
    roadAdministrativeLegend = null;
  }
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

// Devuelve la geometria aproximada del tramo usando points o, como respaldo, start/end.
function getSegmentCoords(segment) {
  const points = Array.isArray(segment?.points)
    ? segment.points.map(getSafeCoord).filter(Boolean)
    : [];

  if (points.length >= 2) return points;

  const start = getSafeCoord(segment?.start);
  const end = getSafeCoord(segment?.end);

  return start && end ? [start, end] : [];
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

// Ajusta la camara del mapa para mostrar los tramos de las vias entregadas.
export function fitMapToRoadSegments(roads = []) {
  if (!map) return;

  const coords = roads
    .flatMap((road) => getSegmentCoords(road?.matchedRoadSegment))
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  if (!coords.length) return;

  if (coords.length === 1) {
    map.setView(coords[0], Math.max(map.getZoom(), 10), { animate: true });
    return;
  }

  map.fitBounds(L.latLngBounds(coords), {
    padding: [48, 48],
    maxZoom: 10
  });
}

// Muestra limites administrativos sin opacar el mapa base.
export async function renderAdministrativeBoundaries(provinceName = "", options = {}) {
  if (!map) return;

  const renderVersion = ++administrativeRenderVersion;

  if (administrativeLayer) {
    map.removeLayer(administrativeLayer);
    administrativeLayer = null;
  }

  const selectedProvince = normalizeAdministrativeName(provinceName);

  try {
    const [countryGeoJson, provincesGeoJson, cantonsGeoJson] = await Promise.all([
      fetchAdministrativeGeoJson("ecuador"),
      fetchAdministrativeGeoJson("provinces"),
      fetchAdministrativeGeoJson("cantons")
    ]);

    const layers = [];
    let selectedProvinceBoundaryLayer = null;

    layers.push(L.geoJSON(countryGeoJson, {
      interactive: false,
      style: {
        color: "#38bdf8",
        weight: 1.5,
        opacity: 0.42,
        fillColor: "#38bdf8",
        fillOpacity: 0.015
      }
    }));

    if (!selectedProvince) {
      layers.push(L.geoJSON(provincesGeoJson, {
        interactive: false,
        style: {
          color: "#e2e8f0",
          weight: 1,
          opacity: 0.34,
          fillOpacity: 0
        }
      }));
    } else {
      const provinceFilter = (feature) => normalizeAdministrativeName(getGeoJsonProvinceName(feature)) === selectedProvince;
      selectedProvinceBoundaryLayer = L.geoJSON(provincesGeoJson, {
        filter: provinceFilter,
        style: {
          color: "#2563eb",
          weight: 3,
          opacity: 0.9,
          fillColor: "#38bdf8",
          fillOpacity: 0.08
        },
        onEachFeature: (feature, layer) => {
          const provinceLabel = getGeoJsonProvinceName(feature);
          if (provinceLabel) layer.bindTooltip(escapeHtml(provinceLabel), { sticky: true });
        }
      });

      layers.push(selectedProvinceBoundaryLayer);

      layers.push(L.geoJSON(cantonsGeoJson, {
        filter: provinceFilter,
        style: {
          color: "#f8fafc",
          weight: 1.2,
          opacity: 0.72,
          fillOpacity: 0,
          dashArray: "5, 7"
        },
        onEachFeature: (feature, layer) => {
          const cantonLabel = getGeoJsonCantonName(feature);
          if (cantonLabel) layer.bindTooltip(escapeHtml(cantonLabel), { sticky: true });
        }
      }));
    }

    if (renderVersion !== administrativeRenderVersion) return;

    if (options.fitToProvince && selectedProvinceBoundaryLayer?.getBounds().isValid()) {
      map.fitBounds(selectedProvinceBoundaryLayer.getBounds(), {
        padding: [52, 52],
        maxZoom: 9
      });
    }

    administrativeLayer = L.layerGroup(layers).addTo(map);
  } catch (error) {
    if (renderVersion !== administrativeRenderVersion) return;
    console.warn("No se pudieron cargar limites administrativos:", error);
  }
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
  clearRoadAdministrativeHighlights();
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
  roadLine.bringToFront();

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
  if (!map) return;

  const routeCoords = getSegmentCoords(segment);

  if (routeCoords.length < 2) return;

  clearRoadGeometry();

  const color = getLineColorByState(road?.estado);
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  const start = routeCoords[0];
  const end = routeCoords[routeCoords.length - 1];

  roadLine = L.polyline(routeCoords, {
    weight: 5,
    color,
    opacity: 0.85,
    dashArray: "10, 10"
  }).addTo(map);
  roadLine.bringToFront();

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

  const start = getSegmentCoords(incident?.matchedRoadSegment)[0];
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

  const start = getSegmentCoords(segment)[0];
  if (!start) return;

  clearIncidentFocus();
  renderRoadAdministrativeHighlights(incident || { matchedRoadSegment: segment });

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
