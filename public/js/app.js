// Orquesta la experiencia principal: carga datos, filtros, mapa, tutorial,
// recorrido GPS, asistente de voz y sincronizacion de idioma/tema.
import { createUserIncident, fetchIncidents, fetchOsrmRoute, fetchUserIncidents } from "./services.js";
import {
  initMap,
  getMapInstance,
  drawRouteGeometry,
  drawFallbackPolyline,
  focusIncidentOnMap,
  clearIncidentFocus,
  clearRoadGeometry,
  clearRoadAdministrativeHighlights,
  renderAdministrativeBoundaries,
  resetMapView,
  renderIncidentMarkers,
  renderUserReportMarkers,
  focusUserReportOnMap,
  setReportDraftLocation,
  clearReportDraftLocation,
  cancelReportLocationPicker,
  clearUserReportMarkers,
  clearTravelTracking,
  updateTravelPosition,
  enrichRoadsWithAdministrativeAreas
} from "./map.js";
import { renderIncidents, renderUserIncidents, showToast, showRouteNotice, renderStats } from "./ui.js";
import { initTheme } from "./theme.js";
import { initLanguage, getCurrentLanguage } from "./translate.js";
import { initWeather, bindWeatherToMap, updateWeatherFromMapCenter } from "./weather.js?v=20260703-weather-5";
import { translations, translateState } from "./i18n.js";

let allRoads = [];
let visibleRoads = [];
let userReports = [];
let userReportsLoadedAt = 0;
let userReportsNextCursor = null;
let userReportsError = "";
let isLoadingUserReports = false;
let activeIncidentSource = "official";
let reportDraftLocation = null;
let reportMiniMap = null;
let reportMiniMarker = null;
let tripWatchId = null;
let isTripTracking = false;
let lastTripErrorAt = 0;
let isVoiceHintsEnabled = false;
let voiceHintTimer = null;
let lastVoiceHint = "";
let mapFilterVersion = 0;
let lastAppliedProvince = "";

const USER_REPORTS_PAGE_LIMIT = 50;
const USER_REPORTS_CACHE_MS = 60 * 1000;
const USER_REPORTS_VISIBLE_MS = 14 * 24 * 60 * 60 * 1000;

// Resume la red vial visible para alimentar las tarjetas de estadisticas.
function buildStats(roads) {
  return {
    total: roads.length,
    habilitada: roads.filter((x) => x.estado === "Habilitada").length,
    parcial: roads.filter((x) => x.estado === "Parcialmente habilitada").length,
    cerrada: roads.filter((x) => x.estado === "Cerrada").length
  };
}

// Obtiene provincias unicas para construir el filtro nacional.
function getAvailableProvinces(roads = []) {
  return [...new Set(
    roads
      .flatMap((road) => Array.isArray(road.provincias) && road.provincias.length
        ? road.provincias
        : [road.provincia])
      .map((province) => String(province || "").trim())
      .filter(Boolean)
      .filter((province) => province.toLowerCase() !== "ecuador")
  )].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

// Llena el selector de provincias con los datos reales cargados desde el backend.
function populateProvinceFilter(roads = []) {
  const select = document.getElementById("filterProvince");
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!select) return;

  const currentValue = select.value;
  const provinces = getAvailableProvinces(roads);

  select.innerHTML = `
    <option value="">${t.optionAllProvinces}</option>
    ${provinces
      .map((province) => `<option value="${province}">${province}</option>`)
      .join("")}
  `;

  if (provinces.includes(currentValue)) {
    select.value = currentValue;
  }
}

// Detecta el punto de corte donde la interfaz cambia a drawer y mapa apilado.
function isMobileLayout() {
  return window.innerWidth <= 992;
}

// Lleva al usuario al mapa despues de acciones relevantes en telefono/tablet.
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

// Activa el menu colapsable de acciones en cabecera para pantallas pequenas.
function initMobileMenu() {
  const btnMenu = document.getElementById("btnMenu");
  const headerActions = document.getElementById("headerActions");

  if (!btnMenu || !headerActions) return;

  btnMenu.addEventListener("click", () => {
    const isOpen = headerActions.classList.toggle("is-open");
    btnMenu.setAttribute("aria-expanded", String(isOpen));
  });
}

// Abre o cierra el grupo de acciones de cabecera solo en layout movil.
function setMobileHeaderActionsState(isOpen) {
  const btnMenu = document.getElementById("btnMenu");
  const headerActions = document.getElementById("headerActions");

  if (!btnMenu || !headerActions) return;

  if (!isMobileLayout()) {
    headerActions.classList.remove("is-open");
    btnMenu.setAttribute("aria-expanded", "false");
    return;
  }

  headerActions.classList.toggle("is-open", isOpen);
  btnMenu.setAttribute("aria-expanded", String(isOpen));
}

// Controla el drawer lateral de incidentes y su backdrop en movil/tablet.
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

// Cierra el drawer lateral reutilizando la funcion central de estado.
function closeMobileSidebar() {
  setMobileSidebarState(false);
}

// Acepta coordenadas como arreglo [lat, lng] u objeto { lat, lng }.
function getSafeCoord(point) {
  if (!point) return null;

  if (Array.isArray(point) && point.length >= 2) {
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  if (typeof point === "object" && point.lat !== undefined && point.lng !== undefined) {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  return null;
}

// Obtiene la geometria del tramo para calculos de cercania en modo recorrido.
function getSegmentPoints(segment) {
  const points = Array.isArray(segment?.points)
    ? segment.points.map(getSafeCoord).filter(Boolean)
    : [];

  if (points.length >= 2) return points;

  const start = getSafeCoord(segment?.start);
  const end = getSafeCoord(segment?.end);

  return start && end ? [start, end] : [];
}

// Convierte lat/lng a metros aproximados usando una latitud de referencia.
function projectToMeters(point, referenceLat) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((referenceLat * Math.PI) / 180);

  return {
    x: point.lng * metersPerDegreeLng,
    y: point.lat * metersPerDegreeLat
  };
}

// Aproxima distancias en metros proyectando lat/lng sobre un plano local.
function getPointSegmentDistanceMeters(point, start, end) {
  const referenceLat = (point.lat + start.lat + end.lat) / 3;
  const p = projectToMeters(point, referenceLat);
  const a = projectToMeters(start, referenceLat);
  const b = projectToMeters(end, referenceLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  const closest = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

// Busca el tramo base mas cercano a la ubicacion del usuario durante el recorrido.
function findNearestRoadFromLocation(location) {
  const point = {
    lat: Number(location.lat),
    lng: Number(location.lng)
  };

  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;

  const nearest = allRoads.reduce((best, road) => {
    const segment = road?.matchedRoadSegment;
    const points = getSegmentPoints(segment);

    if (points.length < 2) return best;

    const distanceMeters = points.slice(0, -1).reduce((minDistance, currentPoint, index) => {
      const nextPoint = points[index + 1];
      const distance = getPointSegmentDistanceMeters(point, currentPoint, nextPoint);

      return Math.min(minDistance, distance);
    }, Infinity);

    if (!best || distanceMeters < best.distanceMeters) {
      return { road, distanceMeters };
    }

    return best;
  }, null);

  return nearest && nearest.distanceMeters <= 1500 ? nearest : null;
}

// Mantiene el boton "Iniciar recorrido" sincronizado con el estado del GPS.
function updateTripButton() {
  const btn = document.getElementById("btnStartTrip");
  const label = btn?.querySelector("span");
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!btn || !label) return;

  btn.classList.toggle("is-active", isTripTracking);
  btn.setAttribute("aria-pressed", String(isTripTracking));
  label.textContent = isTripTracking ? t.stopTrip : t.startTrip;
}

// Detiene el seguimiento GPS y opcionalmente limpia el marcador del mapa.
function stopTripTracking({ clearMap = true, notify = false } = {}) {
  const lang = getCurrentLanguage();

  if (tripWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(tripWatchId);
  }

  tripWatchId = null;
  isTripTracking = false;
  updateTripButton();

  if (clearMap) {
    clearTravelTracking();
  }

  if (activeIncidentSource === "official") {
    clearUserReportMarkers();
  }

  if (notify) {
    showToast(
      lang === "en" ? "Trip tracking stopped." : "Recorrido detenido.",
      "success"
    );
  }
}

// Decide el texto del boton de voz segun si esta leyendo, pausado o inactivo.
function getVoiceButtonLabel() {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (isVoiceHintsEnabled) return t.voiceDisable || t.voicePause;
  return t.voiceAssistant;
}

// Normaliza texto libre antes de enviarlo al backend.
function normalizeFormText(value) {
  return String(value || "").trim();
}

// Mantiene visibles solo reportes ciudadanos recientes para no mostrar alertas caducadas.
function isActiveUserReport(report) {
  if (!report?.creadoEn) return false;

  const createdAt = new Date(report.creadoEn);
  if (Number.isNaN(createdAt.getTime())) return false;

  return Date.now() - createdAt.getTime() <= USER_REPORTS_VISIBLE_MS;
}

function getActiveUserReports() {
  return userReports.filter(isActiveUserReport);
}

// Cambia visualmente entre reportes ECU 911 y reportes ciudadanos.
function setIncidentSource(source) {
  activeIncidentSource = source === "users" ? "users" : "official";

  document.querySelectorAll("[data-source-view]").forEach((button) => {
    const isActive = button.dataset.sourceView === activeIncidentSource;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  applyFilters();

  if (activeIncidentSource === "users") {
    loadUserReports();
  }
}

// Mantiene el estado textual del punto seleccionado en el formulario.
function updateReportLocationStatus() {
  const status = document.getElementById("reportLocationStatus");
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!status) return;

  if (!reportDraftLocation) {
    status.classList.remove("is-ready");
    status.textContent = t.reportLocationPending;
    return;
  }

  status.classList.add("is-ready");
  status.textContent = `${t.reportLocationSelected}: ${reportDraftLocation.lat.toFixed(5)}, ${reportDraftLocation.lng.toFixed(5)}`;
}

// Guarda una coordenada temporal para el reporte ciudadano.
function setReportLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  reportDraftLocation = { lat, lng };
  setReportDraftLocation(reportDraftLocation);
  updateReportMiniMapMarker(reportDraftLocation);
  updateReportLocationStatus();
}

// Prepara un mapa pequeño dentro del formulario para escoger el punto del reporte.
function initReportMiniMap() {
  const mapEl = document.getElementById("reportMiniMap");

  if (!mapEl || !window.L) return;

  if (!reportMiniMap) {
    reportMiniMap = L.map(mapEl, {
      attributionControl: false
    }).setView([-2.30814, -78.11135], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(reportMiniMap);

    reportMiniMap.on("click", (event) => {
      setReportLocation({
        lat: event.latlng.lat,
        lng: event.latlng.lng
      });
    });
  }

  window.setTimeout(() => {
    reportMiniMap.invalidateSize();
    if (reportDraftLocation) {
      updateReportMiniMapMarker(reportDraftLocation);
    }
  }, 120);
}

// Sincroniza el marcador del mapa interno con la ubicacion seleccionada.
function updateReportMiniMapMarker(location) {
  if (!reportMiniMap || !location) return;

  const latLng = [location.lat, location.lng];

  if (!reportMiniMarker) {
    reportMiniMarker = L.marker(latLng).addTo(reportMiniMap);
  } else {
    reportMiniMarker.setLatLng(latLng);
  }

  reportMiniMap.setView(latLng, Math.max(reportMiniMap.getZoom(), 13));
}

// Refleja en el boton el estado actual del asistente de voz.
function updateVoiceButton() {
  const btn = document.getElementById("btnVoiceAssistant");
  const label = btn?.querySelector("span");

  if (!btn || !label) return;

  btn.classList.toggle("is-active", isVoiceHintsEnabled);
  btn.classList.toggle("is-listening", isVoiceHintsEnabled);
  btn.setAttribute("aria-pressed", String(isVoiceHintsEnabled));
  label.textContent = getVoiceButtonLabel();
}

// Selecciona una voz instalada compatible con el idioma activo.
function getPreferredVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const locale = lang === "en" ? "en" : "es";

  return voices.find((voice) => voice.lang?.toLowerCase().startsWith(locale)) || voices[0] || null;
}

// Construye el resumen hablado con filtros, estadisticas y primeras vias visibles.
function buildVoiceSummary() {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const stats = buildStats(visibleRoads);
  const selectedState = document.getElementById("filterState")?.value;
  const filterText = selectedState
    ? lang === "en"
      ? `Current filter: ${translateState(selectedState, lang)}.`
      : `Filtro actual: ${translateState(selectedState, lang)}.`
    : lang === "en"
      ? "Current filter: all road statuses."
      : "Filtro actual: todos los estados viales.";
  const intro = [
    t.voiceIntro,
    filterText,
    `${t.voiceStats}: ${stats.total} ${t.total}, ${stats.habilitada} ${t.open}, ${stats.parcial} ${t.partial}, ${stats.cerrada} ${t.closed}.`
  ];

  if (!visibleRoads.length) {
    return [...intro, t.voiceNoRoads].join(" ");
  }

  const roadLines = visibleRoads.slice(0, 8).map((road, index) => {
    const state = translateState(road.estado, lang);
    const observation = road.observaciones || t.noNews;
    const alternate = road.viaAlterna || "N/A";

    return lang === "en"
      ? `Incident ${index + 1}. Road ${road.via}. Status: ${state}. Observation: ${observation}. Alternate route: ${alternate}.`
      : `Incidente ${index + 1}. Vía ${road.via}. Estado: ${state}. Observación: ${observation}. Vía alterna: ${alternate}.`;
  });

  if (visibleRoads.length > roadLines.length) {
    roadLines.push(
      lang === "en"
        ? `There are ${visibleRoads.length - roadLines.length} additional incidents in the current list.`
        : `Hay ${visibleRoads.length - roadLines.length} incidentes adicionales en la lista actual.`
    );
  }

  return [...intro, ...roadLines].join(" ");
}

// Cancela cualquier lectura y devuelve el asistente de voz al estado inicial.
function stopVoiceAssistant() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  isVoiceHintsEnabled = false;
  lastVoiceHint = "";
  updateVoiceButton();
}

// Encapsula Web Speech para reutilizar idioma, voz y velocidad en lecturas/hints.
function speakText(text, options = {}) {
  const lang = getCurrentLanguage();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getPreferredVoice(lang);

  utterance.lang = lang === "en" ? "en-US" : "es-EC";
  utterance.rate = options.rate || 0.95;
  utterance.pitch = 1;
  if (voice) utterance.voice = voice;
  if (options.onend) utterance.onend = options.onend;
  if (options.onerror) utterance.onerror = options.onerror;

  window.speechSynthesis.speak(utterance);
  return utterance;
}

// Activa el modo guia: no lee resumen automatico, solo elementos enfocados/tocados.
function startVoiceAssistant() {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
    showToast(t.voiceUnsupported, "error");
    return;
  }

  window.speechSynthesis.cancel();

  isVoiceHintsEnabled = true;
  lastVoiceHint = "";
  updateVoiceButton();
  showToast(t.voiceGuideEnabled || t.voiceAssistant, "success", 2600);
}

// Convierte elementos interactivos en frases cortas para lectura al pasar/focalizar.
function getVoiceHintForElement(element) {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const target = element.closest(
    "[data-voice-label], button, a, select, input, .incident-card, .stat-card, .map-card, #map"
  );

  if (!target || target.closest(".tutorial-overlay")) return "";

  if (target.dataset.voiceLabel) return target.dataset.voiceLabel.trim();

  if (target.matches("#btnVoiceAssistant")) return t.voiceAssistant;
  if (target.matches("#btnDownloadAndroid")) return t.downloadAndroid;
  if (target.matches("[data-tutorial-open]")) return t.tutorialButton;
  if (target.matches("#filterState")) return `${t.stateLabel}. ${target.options[target.selectedIndex]?.text || ""}`;
  if (target.matches("#filterProvince")) return `${t.provinceLabel}. ${target.options[target.selectedIndex]?.text || ""}`;
  if (target.matches("#btnStartTrip")) return target.textContent.trim();
  if (target.matches("#btnReportIncident")) return t.reportIncident;
  if (target.matches("#btnUseCurrentReportLocation")) return t.reportUseCurrentLocation;
  if (target.matches("#btnPickReportLocation")) return t.reportPickOnMap;
  if (target.matches("#reportSubmit")) return t.reportSubmit;
  if (target.matches("#btnResetMap")) return t.resetMap;
  if (target.matches("#btnOpenIncidents")) return target.textContent.trim();
  if (target.matches("#weatherBadge")) return `${t.weatherTitle}. ${target.textContent.trim()}`;
  if (target.matches("#btnLang")) return t.languageToggle;
  if (target.matches("#btnTheme")) return t.theme;
  if (target.matches("#map")) return `${t.mapCardTitle}. ${t.tutorialMapText}`;

  const text = target.textContent?.replace(/\s+/g, " ").trim();

  return text || target.getAttribute("aria-label") || target.getAttribute("title") || "";
}

// Lee una pista corta para elementos cuando el modo de ayuda por voz esta activo.
function speakVoiceHint(text) {
  if (!isVoiceHintsEnabled) return;
  if (!text || text === lastVoiceHint) return;
  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;

  lastVoiceHint = text;
  window.speechSynthesis.cancel();
  speakText(text, { rate: 1 });
}

// Espera un instante antes de leer para no disparar voz con movimientos rapidos.
function queueVoiceHint(event) {
  window.clearTimeout(voiceHintTimer);

  const text = getVoiceHintForElement(event.target);
  if (!text) return;

  const delay = event.type === "focusin" || event.type === "touchstart" ? 80 : 280;
  voiceHintTimer = window.setTimeout(() => {
    speakVoiceHint(text);
  }, delay);
}

// Cancela una pista pendiente cuando el cursor sale del elemento.
function clearVoiceHintQueue() {
  window.clearTimeout(voiceHintTimer);
}

// Alterna el modo guia del asistente de voz.
function toggleVoiceAssistant() {
  if (!isVoiceHintsEnabled) {
    startVoiceAssistant();
    return;
  }

  stopVoiceAssistant();
}

// Registra eventos de voz, mouse y foco para lectura general y pistas.
function initVoiceAssistant() {
  const btn = document.getElementById("btnVoiceAssistant");

  updateVoiceButton();
  btn?.addEventListener("click", toggleVoiceAssistant);
  document.addEventListener("mouseover", queueVoiceHint);
  document.addEventListener("focusin", queueVoiceHint);
  document.addEventListener("touchstart", queueVoiceHint, { passive: true });
  document.addEventListener("mouseout", clearVoiceHintQueue);

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener?.("voiceschanged", updateVoiceButton);
  }
}

// Abre y cierra el modal informativo que resume el alcance de la plataforma.
function initInfoModal() {
  const modal = document.getElementById("infoModal");
  const openBtn = document.getElementById("btnInfoModal");
  const closeBtn = document.getElementById("infoModalClose");

  if (!modal || !openBtn || !closeBtn) return;

  const openInfoModal = () => {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    closeBtn.focus({ preventScroll: true });
  };

  const closeInfoModal = () => {
    if (modal.contains(document.activeElement)) {
      document.activeElement.blur();
      openBtn.focus({ preventScroll: true });
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  };

  openBtn.addEventListener("click", openInfoModal);
  closeBtn.addEventListener("click", closeInfoModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeInfoModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("show")) {
      closeInfoModal();
    }
  });
}

// watchPosition entrega coordenadas continuas; aqui se actualiza mapa y tramo cercano.
function handleTripPosition(position) {
  const coords = position.coords;
  const location = {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: coords.accuracy,
    heading: coords.heading,
    speed: coords.speed
  };
  const nearestRoad = findNearestRoadFromLocation(location);

  updateTravelPosition(location, nearestRoad, { follow: true });
}

// Maneja errores de geolocalizacion y detiene el recorrido si falta permiso.
function handleTripError(error) {
  const lang = getCurrentLanguage();
  const denied = error?.code === error?.PERMISSION_DENIED;
  const now = Date.now();

  if (!denied && now - lastTripErrorAt < 6000) return;

  lastTripErrorAt = now;
  const message = denied
    ? lang === "en"
      ? "Location permission was denied."
      : "Se denegó el permiso de ubicación."
    : lang === "en"
      ? "Your location could not be updated."
      : "No se pudo actualizar tu ubicación.";

  showToast(message, "error");

  if (denied) {
    stopTripTracking({ clearMap: true });
  }
}

// Activa el seguimiento GPS solo bajo accion explicita del usuario.
function startTripTracking() {
  const lang = getCurrentLanguage();

  if (!("geolocation" in navigator)) {
    showToast(
      lang === "en"
        ? "This browser does not support location tracking."
        : "Este navegador no soporta seguimiento de ubicación.",
      "error"
    );
    return;
  }

  isTripTracking = true;
  lastTripErrorAt = 0;
  updateTripButton();
  scrollToMapOnSmallScreens();
  loadUserReports({ silent: true });

  tripWatchId = navigator.geolocation.watchPosition(handleTripPosition, handleTripError, {
    enableHighAccuracy: true,
    maximumAge: 3000,
    timeout: 15000
  });

  showToast(
    lang === "en"
      ? "Trip started. Allow location access to follow your route."
      : "Recorrido iniciado. Permite el acceso a la ubicación para seguir tu ruta.",
    "success"
  );
}

// Conecta el boton de recorrido con iniciar/detener seguimiento GPS.
function initTripTracking() {
  const btn = document.getElementById("btnStartTrip");

  updateTripButton();

  btn?.addEventListener("click", () => {
    if (isTripTracking) {
      stopTripTracking({ clearMap: true, notify: true });
      return;
    }

    startTripTracking();
  });
}

// Abre el modal de reporte y prepara el estado inicial del formulario.
function openReportModal() {
  const modal = document.getElementById("reportIncidentModal");
  const closeBtn = document.getElementById("reportModalClose");

  if (!modal) return;

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  updateReportLocationStatus();
  initReportMiniMap();
  scrollToMapOnSmallScreens();
  closeBtn?.focus({ preventScroll: true });
}

// Cierra el modal y limpia selecciones temporales del mapa.
function closeReportModal({ clearForm = false } = {}) {
  const modal = document.getElementById("reportIncidentModal");
  const form = document.getElementById("userIncidentForm");
  const openBtn = document.getElementById("btnReportIncident");

  if (modal?.contains(document.activeElement)) {
    document.activeElement.blur();
    openBtn?.focus({ preventScroll: true });
  }

  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden", "true");
  cancelReportLocationPicker();
  clearReportDraftLocation();
  reportDraftLocation = null;
  updateReportLocationStatus();

  if (clearForm) {
    form?.reset();
    const province = document.getElementById("reportProvince");
    if (province) province.value = "MORONA SANTIAGO";
    if (reportMiniMarker && reportMiniMap) {
      reportMiniMap.removeLayer(reportMiniMarker);
      reportMiniMarker = null;
    }
  }
}

// Obtiene la ubicacion actual para rellenar el punto del reporte ciudadano.
function useCurrentLocationForReport() {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!("geolocation" in navigator)) {
    showToast(t.locationUnsupported, "error");
    return;
  }

  showToast(t.reportGettingLocation, "success", 1800);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setReportLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      showToast(t.reportLocationReady, "success");
    },
    (error) => {
      const denied = error?.code === error?.PERMISSION_DENIED;
      showToast(denied ? t.reportGpsDenied : t.reportGpsError, "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000
    }
  );
}

// Activa un clic unico sobre el mapa para elegir el punto del incidente.
function pickReportLocationOnMap() {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const miniMap = document.getElementById("reportMiniMap");

  showToast(t.reportPickHint, "success", 3500);
  miniMap?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
  reportMiniMap?.invalidateSize();
}

// Lee el formulario, valida la ubicacion y crea el documento en Firestore.
async function submitUserIncident(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitBtn = document.getElementById("reportSubmit");
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!reportDraftLocation) {
    showToast(t.reportLocationRequired, "error");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    tipo: normalizeFormText(formData.get("tipo")),
    descripcion: normalizeFormText(formData.get("descripcion")),
    provincia: normalizeFormText(formData.get("provincia")),
    canton: normalizeFormText(formData.get("canton")),
    parroquia: normalizeFormText(formData.get("parroquia")),
    ubicacion: reportDraftLocation,
    reportante: {
      nombre: normalizeFormText(formData.get("nombre"))
    },
    responsabilidadAceptada: Boolean(document.getElementById("reportResponsibility")?.checked)
  };

  submitBtn?.setAttribute("disabled", "true");
  if (submitBtn) submitBtn.textContent = t.reportSending;

  try {
    const result = await createUserIncident(payload);

    if (result.incident) {
      userReports = [result.incident, ...userReports.filter((item) => item.id !== result.incident.id)];
      userReportsLoadedAt = Date.now();
    } else {
      await loadUserReports({ silent: true, force: true });
    }

    closeReportModal({ clearForm: true });
    setIncidentSource("users");
    showToast(t.reportCreatedSuccess, "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || t.reportCreateError, "error");
  } finally {
    submitBtn?.removeAttribute("disabled");
    if (submitBtn) submitBtn.textContent = t.reportSubmit;
  }
}

// Conecta todos los controles del formulario ciudadano.
function initUserIncidentReporting() {
  const modal = document.getElementById("reportIncidentModal");

  document.getElementById("btnReportIncident")?.addEventListener("click", openReportModal);
  document.getElementById("reportModalClose")?.addEventListener("click", () => closeReportModal());
  document.getElementById("reportCancel")?.addEventListener("click", () => closeReportModal());
  document.getElementById("btnUseCurrentReportLocation")?.addEventListener("click", useCurrentLocationForReport);
  document.getElementById("btnPickReportLocation")?.addEventListener("click", pickReportLocationOnMap);
  document.getElementById("userIncidentForm")?.addEventListener("submit", submitUserIncident);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeReportModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("show")) {
      closeReportModal();
    }
  });
}

// Carga reportes ciudadanos y actualiza la vista si el usuario esta en esa fuente.
async function loadUserReports(options = {}) {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const now = Date.now();
  const hasFreshCache = userReports.length > 0 && now - userReportsLoadedAt < USER_REPORTS_CACHE_MS;

  if (!options.force && !options.append && hasFreshCache) {
    if (activeIncidentSource === "users" || isTripTracking) {
      applyFilters();
    }
    return;
  }

  if (isLoadingUserReports) return;

  try {
    isLoadingUserReports = true;
    userReportsError = "";

    const data = await fetchUserIncidents({
      limit: USER_REPORTS_PAGE_LIMIT,
      cursor: options.append ? userReportsNextCursor : null
    });
    const incomingReports = data.incidents || [];

    userReports = options.append
      ? [...userReports, ...incomingReports.filter((incoming) => !userReports.some((item) => item.id === incoming.id))]
      : incomingReports;
    userReportsNextCursor = data.nextCursor || null;
    userReportsLoadedAt = Date.now();

    if (activeIncidentSource === "users" || isTripTracking) {
      applyFilters();
    }
  } catch (error) {
    console.error(error);
    userReportsError = error.message || t.noLoadUserReports;

    if (activeIncidentSource === "users" || isTripTracking) {
      applyFilters();
    }

    if (!options.silent) {
      showToast(userReportsError, "error");
    }
  } finally {
    isLoadingUserReports = false;
  }
}

// Inicializa el cambio entre informacion oficial y reportes ciudadanos.
function initIncidentSourceSwitch() {
  document.querySelectorAll("[data-source-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.sourceView === activeIncidentSource));
    button.addEventListener("click", () => setIncidentSource(button.dataset.sourceView));
  });
}

// Pasos del tutorial. Cada selector apunta al elemento real que se resalta en pantalla.
const tutorialSteps = [
  {
    selector: ".hero-panel",
    focusSelector: ".hero-panel",
    highlightSelector: ".hero-panel",
    title: "tutorialIntroTitle",
    text: "tutorialIntroText",
    mobilePanel: true
  },
  {
    selector: "#filterState",
    focusSelector: "#filterState",
    highlightSelector: "#filterState",
    title: "tutorialFilterTitle",
    text: "tutorialFilterText",
    mobilePanel: true
  },
  {
    selector: "#filterProvince",
    focusSelector: "#filterProvince",
    highlightSelector: "#filterProvince",
    title: "tutorialProvinceTitle",
    text: "tutorialProvinceText",
    mobilePanel: true
  },
  {
    selector: "#statsPanel",
    focusSelector: "#statsPanel",
    highlightSelector: "#statsPanel",
    title: "tutorialStatsTitle",
    text: "tutorialStatsText",
    mobilePanel: true
  },
  {
    selector: "#roadsPanel",
    focusSelector: "#roadsPanel",
    highlightSelector: "#roadsPanel",
    title: "tutorialRoadsTitle",
    text: "tutorialRoadsText",
    mobilePanel: true
  },
  {
    selector: ".source-switch",
    focusSelector: ".source-switch",
    highlightSelector: ".source-switch",
    exactHighlight: true,
    title: "tutorialSourceTitle",
    text: "tutorialSourceText",
    mobilePanel: true
  },
  {
    selector: "#btnReportIncident",
    focusSelector: "#btnReportIncident",
    highlightSelector: "#btnReportIncident",
    exactHighlight: true,
    title: "tutorialReportTitle",
    text: "tutorialReportText",
    mobilePanel: true
  },
  {
    selector: '.incident-card button[data-action="focus"]',
    focusSelector: ".incident-card",
    highlightSelector: ".incident-card",
    fallbackSelector: "#incidentsList",
    title: "tutorialMapButtonTitle",
    text: "tutorialMapButtonText",
    mobilePanel: true
  },
  {
    selector: "#map",
    focusSelector: "#map",
    highlightSelector: "#map",
    exactHighlight: true,
    title: "tutorialMapTitle",
    text: "tutorialMapText",
    mobilePanel: false
  },
  {
    selector: "#btnStartTrip",
    focusSelector: "#btnStartTrip",
    highlightSelector: "#btnStartTrip",
    title: "tutorialTripTitle",
    text: "tutorialTripText",
    mobilePanel: false
  },
  {
    selector: "#btnResetMap",
    focusSelector: "#roadsPanel .panel-head",
    highlightSelector: "#roadsPanel .panel-head",
    title: "tutorialResetTitle",
    text: "tutorialResetText",
    mobilePanel: true
  },
  {
    selector: "#headerActions",
    focusSelector: "#headerActions",
    highlightSelector: "#headerActions",
    title: "tutorialToolsTitle",
    text: "tutorialToolsText",
    mobilePanel: false,
    mobileHeader: true
  },
  {
    selector: "#btnDownloadAndroid",
    focusSelector: "#btnDownloadAndroid",
    highlightSelector: "#btnDownloadAndroid",
    exactHighlight: true,
    title: "tutorialDownloadTitle",
    text: "tutorialDownloadText",
    mobilePanel: false
  },
  {
    selector: "#btnVoiceAssistant",
    focusSelector: "#btnVoiceAssistant",
    highlightSelector: "#btnVoiceAssistant",
    exactHighlight: true,
    title: "tutorialVoiceTitle",
    text: "tutorialVoiceText",
    mobilePanel: false
  }
];

let tutorialIndex = 0;
let currentTutorialTarget = null;

// Busca el objetivo principal del paso o usa su fallback si no existe.
function getTutorialElement(step) {
  return (
    document.querySelector(step.selector) ||
    (step.fallbackSelector ? document.querySelector(step.fallbackSelector) : null)
  );
}

// Obtiene el elemento que debe recibir scroll antes de resaltar el paso.
function getTutorialFocusElement(step) {
  return (
    (step.focusSelector ? document.querySelector(step.focusSelector) : null) ||
    getTutorialElement(step)
  );
}

// Obtiene el elemento exacto que se debe encuadrar con el spotlight.
function getTutorialHighlightElement(step) {
  return (
    (step.highlightSelector ? document.querySelector(step.highlightSelector) : null) ||
    getTutorialFocusElement(step)
  );
}

// Espera dos frames para que el navegador termine de pintar cambios de layout.
function waitForTutorialFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

// Pausa breve usada cuando drawer/header necesitan tiempo de transicion.
function waitForTutorialDelay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

// Limita un valor numerico dentro de un rango seguro de pantalla.
function clampTutorialValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Clasifica el viewport para aplicar reglas distintas en telefono/tablet/escritorio.
function getTutorialViewportMode() {
  if (window.innerWidth <= 576) return "phone";
  if (window.innerWidth <= 992) return "tablet";
  return "desktop";
}

// En movil/tablet se desplazan paneles y pagina antes de calcular el foco visual.
function scrollTutorialTarget(target, step) {
  const scroller = target.closest(".sidebar-scroll");
  const mode = getTutorialViewportMode();
  const reservedBottom = mode === "phone" ? 260 : mode === "tablet" ? 230 : 0;

  if (scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const visibleHeight = Math.max(180, scrollerRect.height - reservedBottom);
    const nextTop = scroller.scrollTop + targetRect.top - scrollerRect.top - (visibleHeight - targetRect.height) / 2;
    scroller.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "auto"
    });
    return;
  }

  target.scrollIntoView({
    behavior: "auto",
    block: mode === "desktop" ? "center" : "start",
    inline: "nearest"
  });

  if (mode !== "desktop") {
    window.scrollBy({
      top: -84,
      behavior: "auto"
    });
  }
}

// Ajusta el rectangulo resaltado para evitar focos estrechos en pantallas pequenas.
function getSpotlightRect(target, mode, step = {}) {
  const rect = target.getBoundingClientRect();

  if (step.exactHighlight) return rect;

  if (mode !== "phone") return rect;

  const panel = target.closest(".panel, .incident-card, .map-card, .header-actions");
  if (!panel) return rect;

  const panelRect = panel.getBoundingClientRect();
  const targetArea = target.matches(".panel-head, #filterState, #headerActions")
    ? rect
    : panelRect;

  return targetArea.width >= 90 ? targetArea : panelRect;
}

// Posiciona la tarjeta del tutorial: lateral en escritorio, anclada abajo en movil.
function placeTutorialCard(target, card, spotlight, step = {}) {
  const mode = getTutorialViewportMode();
  const rect = getSpotlightRect(target, mode, step);
  const padding = mode === "phone" ? 8 : 10;
  const isDocked = mode !== "desktop";
  const cardWidth = mode === "desktop"
    ? Math.min(380, window.innerWidth - 32)
    : Math.min(520, window.innerWidth - 32);
  const cardHeight = card.offsetHeight || 220;
  const dockedCardTop = Math.max(12, window.innerHeight - cardHeight - 16);
  const safeBottom = isDocked
    ? Math.max(96, dockedCardTop - 12)
    : window.innerHeight - 8;
  const spotTop = Math.max(8, rect.top - padding);
  const spotLeft = Math.max(8, rect.left - padding);
  const spotRight = Math.min(window.innerWidth - 8, rect.right + padding);
  const spotBottom = Math.min(safeBottom, rect.bottom + padding);
  const spotWidth = Math.max(48, spotRight - spotLeft);
  const spotHeight = Math.max(48, spotBottom - spotTop);

  spotlight.style.top = `${spotTop}px`;
  spotlight.style.left = `${spotLeft}px`;
  spotlight.style.width = `${spotWidth}px`;
  spotlight.style.height = `${spotHeight}px`;

  card.classList.toggle("is-docked", isDocked);

  if (isDocked) {
    card.style.top = "";
    card.style.left = mode === "phone"
      ? "12px"
      : `${Math.max(16, (window.innerWidth - cardWidth) / 2)}px`;
    return;
  }

  const spaceRight = window.innerWidth - rect.right;
  const spaceLeft = rect.left;
  const left = spaceRight >= cardWidth + 40
    ? rect.right + 20
    : spaceLeft >= cardWidth + 40
      ? rect.left - cardWidth - 20
      : clampTutorialValue(window.innerWidth - cardWidth - 24, 16, window.innerWidth - cardWidth - 16);
  const top = clampTutorialValue(rect.top, 16, window.innerHeight - cardHeight - 16);

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

// Renderiza el paso activo y recalcula foco, textos y posicion de la tarjeta.
async function renderTutorialStep() {
  const overlay = document.getElementById("tutorialOverlay");
  const card = overlay?.querySelector(".tutorial-card");
  const spotlight = document.getElementById("tutorialSpotlight");
  const title = document.getElementById("tutorialTitle");
  const text = document.getElementById("tutorialText");
  const count = document.getElementById("tutorialStepCount");
  const prevBtn = document.getElementById("tutorialPrev");
  const nextBtn = document.getElementById("tutorialNext");

  if (!overlay || !card || !spotlight || !title || !text || !count || !prevBtn || !nextBtn) return;

  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;
  const step = tutorialSteps[tutorialIndex];
  const target = getTutorialElement(step);

  if (!target) return;

  currentTutorialTarget = target;

  title.textContent = t[step.title];
  text.textContent = t[step.text];
  count.textContent = `${t.tutorialStep} ${tutorialIndex + 1} / ${tutorialSteps.length}`;
  prevBtn.textContent = t.tutorialPrev;
  nextBtn.textContent = tutorialIndex === tutorialSteps.length - 1 ? t.tutorialFinish : t.tutorialNext;
  prevBtn.disabled = tutorialIndex === 0;

  if (isMobileLayout() && step.mobilePanel) {
    setMobileHeaderActionsState(false);
    setMobileSidebarState(true);
  } else if (isMobileLayout()) {
    closeMobileSidebar();
    setMobileHeaderActionsState(Boolean(step.mobileHeader));
  }

  if (isMobileLayout()) {
    await waitForTutorialDelay(320);
  }

  await waitForTutorialFrame();
  const updatedTarget = getTutorialElement(step) || target;
  const updatedFocusTarget = getTutorialFocusElement(step) || updatedTarget;
  const updatedHighlightTarget = getTutorialHighlightElement(step) || updatedFocusTarget;
  scrollTutorialTarget(updatedFocusTarget, step);
  await waitForTutorialFrame();
  placeTutorialCard(updatedHighlightTarget, card, spotlight, step);
}

// Oculta tutorial y restaura estados temporales de la interfaz movil.
function closeTutorial() {
  const overlay = document.getElementById("tutorialOverlay");
  const openBtn = document.querySelector("[data-tutorial-open]");

  if (overlay?.contains(document.activeElement)) {
    document.activeElement.blur();
    openBtn?.focus({ preventScroll: true });
  }

  overlay?.classList.remove("show");
  overlay?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tutorial-active");
  setMobileHeaderActionsState(false);
  currentTutorialTarget = null;
}

// Abre el tutorial desde el primer paso y calcula el foco inicial.
function openTutorial() {
  const overlay = document.getElementById("tutorialOverlay");

  if (!overlay) return;

  tutorialIndex = 0;
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("tutorial-active");
  renderTutorialStep();
}

// Conecta botones, teclado y resize del tutorial dinamico.
function initTutorial() {
  const openBtns = document.querySelectorAll("[data-tutorial-open]");
  const closeBtn = document.getElementById("tutorialClose");
  const prevBtn = document.getElementById("tutorialPrev");
  const nextBtn = document.getElementById("tutorialNext");
  const overlay = document.getElementById("tutorialOverlay");

  openBtns.forEach((openBtn) => {
    openBtn.addEventListener("click", openTutorial);
  });
  closeBtn?.addEventListener("click", closeTutorial);

  prevBtn?.addEventListener("click", () => {
    tutorialIndex = Math.max(0, tutorialIndex - 1);
    renderTutorialStep();
  });

  nextBtn?.addEventListener("click", () => {
    if (tutorialIndex >= tutorialSteps.length - 1) {
      closeTutorial();
      return;
    }

    tutorialIndex += 1;
    renderTutorialStep();
  });

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeTutorial();
  });

  window.addEventListener("resize", () => {
    if (overlay?.classList.contains("show")) renderTutorialStep();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay?.classList.contains("show")) {
      closeTutorial();
    }
  });
}

// Intenta dibujar la ruta real con OSRM; si falla, usa una linea aproximada.
async function focusRoadOnMap(road) {
  const lang = getCurrentLanguage();
  const routeFilterVersion = mapFilterVersion;

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

      if (routeFilterVersion !== mapFilterVersion) return;
      drawRouteGeometry(routeResult.coordinates, road);
    } catch (routeError) {
      console.warn("OSRM falló. Se usará polilínea aproximada:", routeError);

      if (routeFilterVersion !== mapFilterVersion) return;
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

// Registra el drawer lateral de incidentes para abrir/cerrar desde movil.
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

// Muestra esqueletos simples mientras se descargan incidentes y estadisticas.
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

// Muestra estados vacios cuando falla la carga inicial de datos.
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

// Recalcula lista, estadisticas y marcadores cada vez que cambia el filtro/idioma.
function applyFilters() {
  mapFilterVersion += 1;
  clearIncidentFocus();
  clearRoadGeometry();
  clearRoadAdministrativeHighlights();

  const state = document.getElementById("filterState").value;
  const province = document.getElementById("filterProvince")?.value || "";
  const lang = getCurrentLanguage();
  const activeUserReports = getActiveUserReports();

  if (activeIncidentSource === "users") {
    visibleRoads = [];
    renderStats({
      total: activeUserReports.length,
      habilitada: 0,
      parcial: 0,
      cerrada: 0
    }, lang);
    renderIncidentMarkers([]);
    renderUserReportMarkers(activeUserReports, {
      onSelect: focusUserReportOnMap
    });

    if (userReportsError && !activeUserReports.length) {
      const incidentsList = document.getElementById("incidentsList");
      if (incidentsList) {
        incidentsList.innerHTML = `
          <div class="empty-state">
            ${userReportsError || (translations[lang] || translations.es).noLoadUserReports}
          </div>
        `;
      }
      return;
    }

    renderUserIncidents(activeUserReports, {
      onFocus: (report) => {
        focusUserReportOnMap(report);
        closeMobileSidebar();
        scrollToMapOnSmallScreens();
      }
    }, lang);
    return;
  }

  let filtered = [...allRoads];

  if (state) {
    filtered = filtered.filter((item) => item.estado === state);
  }

  if (province) {
    filtered = filtered.filter((item) => {
      const provinces = Array.isArray(item.provincias) && item.provincias.length
        ? item.provincias
        : [item.provincia];
      return provinces.includes(province);
    });
  }

  visibleRoads = filtered;

  if (province !== lastAppliedProvince) {
    renderAdministrativeBoundaries(province, { fitToProvince: Boolean(province) });

    if (!province) {
      resetMapView();
    }

    lastAppliedProvince = province;
  }

  renderStats(buildStats(filtered), lang);
  if (isTripTracking) {
    renderUserReportMarkers(activeUserReports, {
      onSelect: focusUserReportOnMap
    });
  } else {
    clearUserReportMarkers();
  }
  renderIncidentMarkers(filtered.filter((item) => item.hasOfficialIncident), {
    onSelect: focusRoadOnMap
  });

  renderIncidents(filtered, {
    onFocus: async (road) => {
      const routeFilterVersion = mapFilterVersion;

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

  if (routeFilterVersion !== mapFilterVersion) return;
  drawRouteGeometry(routeResult.coordinates, road);
} catch (routeError) {
  console.warn("OSRM falló. Se usará polilínea aproximada:", routeError);

  if (routeFilterVersion !== mapFilterVersion) return;
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

// Punto de entrada de la aplicacion: inicializa UI, mapa, clima y datos remotos.
async function initApp() {
  initTheme();
  initMobileMenu();
  initMobileSidebar();
  initIncidentSourceSwitch();
  initUserIncidentReporting();
  initTutorial();
  initTripTracking();
  initVoiceAssistant();
  initInfoModal();

  initLanguage(() => {
    stopVoiceAssistant();
    populateProvinceFilter(allRoads);
    applyFilters();
    updateReportLocationStatus();
    updateTripButton();
    updateVoiceButton();
    const tutorialOverlay = document.getElementById("tutorialOverlay");
    if (tutorialOverlay?.classList.contains("show")) {
      renderTutorialStep();
    }

    const map = getMapInstance();
    if (map) {
      bindWeatherToMap(map, getCurrentLanguage);
      updateWeatherFromMapCenter(map, getCurrentLanguage());
    }
  });

  initWeather();
  const map = initMap();
  bindWeatherToMap(map, getCurrentLanguage);
  renderAdministrativeBoundaries();

  document.getElementById("filterState")?.addEventListener("change", applyFilters);
  document.getElementById("filterProvince")?.addEventListener("change", applyFilters);
  document.getElementById("btnResetMap")?.addEventListener("click", () => {
    stopTripTracking({ clearMap: false });
    resetMapView();
  });

  showLoadingState();

  try {
    const data = await fetchIncidents();
    const loadedRoads = data.incidents || [];
    allRoads = loadedRoads;
    populateProvinceFilter(allRoads);
    applyFilters();
    loadUserReports();

    // Espera a que el navegador pinte la lista antes de descargar y procesar cantones.
    const enrichAdministrativeAreas = () => {
      enrichRoadsWithAdministrativeAreas(loadedRoads)
        .then((enrichedRoads) => {
          allRoads = enrichedRoads;
          populateProvinceFilter(allRoads);
          applyFilters();
        })
        .catch((administrativeError) => {
          console.warn("No se pudieron calcular provincias y cantones de las vias:", administrativeError);
        });
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(enrichAdministrativeAreas, { timeout: 1200 });
    } else {
      window.setTimeout(enrichAdministrativeAreas, 250);
    }
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}
// Registra el Service Worker para habilitar cache/PWA cuando el navegador lo permite.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("Service Worker registrado"))
      .catch(error => console.error("Error registrando Service Worker:", error));
  });
}
registerServiceWorker();
initApp();
