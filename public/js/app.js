// Orquesta la experiencia principal: carga datos, filtros, mapa, tutorial,
// recorrido GPS, asistente de voz y sincronizacion de idioma/tema.
import { fetchIncidents, fetchOsrmRoute } from "./services.js";
import {
  initMap,
  getMapInstance,
  drawRouteGeometry,
  drawFallbackPolyline,
  focusIncidentOnMap,
  resetMapView,
  renderIncidentMarkers,
  clearTravelTracking,
  updateTravelPosition
} from "./map.js";
import { renderIncidents,showToast,showRouteNotice , renderStats } from "./ui.js";
import { initTheme } from "./theme.js";
import { initLanguage, getCurrentLanguage } from "./translate.js";
import { initWeather, bindWeatherToMap, updateWeatherFromMapCenter } from "./weather.js";
import { translations, translateState } from "./i18n.js";

let allRoads = [];
let visibleRoads = [];
let tripWatchId = null;
let isTripTracking = false;
let lastTripErrorAt = 0;
let isVoiceReading = false;
let isVoicePaused = false;
let isVoiceHintsEnabled = false;
let voiceHintTimer = null;
let lastVoiceHint = "";

// Resume la red vial visible para alimentar las tarjetas de estadisticas.
function buildStats(roads) {
  return {
    total: roads.length,
    habilitada: roads.filter((x) => x.estado === "Habilitada").length,
    parcial: roads.filter((x) => x.estado === "Parcialmente habilitada").length,
    cerrada: roads.filter((x) => x.estado === "Cerrada").length
  };
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
    const start = getSafeCoord(segment?.start);
    const end = getSafeCoord(segment?.end);

    if (!start || !end) return best;

    const distanceMeters = getPointSegmentDistanceMeters(point, start, end);

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

  if (isVoicePaused) return t.voiceResume;
  if (isVoiceReading) return t.voicePause;
  return t.voiceAssistant;
}

// Refleja en el boton el estado actual del asistente de voz.
function updateVoiceButton() {
  const btn = document.getElementById("btnVoiceAssistant");
  const label = btn?.querySelector("span");

  if (!btn || !label) return;

  btn.classList.toggle("is-active", isVoiceReading);
  btn.classList.toggle("is-listening", isVoiceHintsEnabled && !isVoiceReading);
  btn.setAttribute("aria-pressed", String(isVoiceReading && !isVoicePaused));
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

  isVoiceReading = false;
  isVoicePaused = false;
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

// Inicia la lectura general del estado vial y habilita pistas por foco/hover.
function startVoiceAssistant() {
  const lang = getCurrentLanguage();
  const t = translations[lang] || translations.es;

  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
    showToast(t.voiceUnsupported, "error");
    return;
  }

  window.speechSynthesis.cancel();

  isVoiceReading = true;
  isVoicePaused = false;
  isVoiceHintsEnabled = true;
  updateVoiceButton();
  speakText(buildVoiceSummary(), {
    onend: () => {
      isVoiceReading = false;
      isVoicePaused = false;
      updateVoiceButton();
    },
    onerror: () => {
      isVoiceReading = false;
      isVoicePaused = false;
      updateVoiceButton();
    }
  });
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
  if (target.matches("#btnStartTrip")) return target.textContent.trim();
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
  if (!isVoiceHintsEnabled || isVoiceReading || isVoicePaused) return;
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

  voiceHintTimer = window.setTimeout(() => {
    speakVoiceHint(text);
  }, event.type === "focusin" ? 80 : 280);
}

// Cancela una pista pendiente cuando el cursor sale del elemento.
function clearVoiceHintQueue() {
  window.clearTimeout(voiceHintTimer);
}

// Alterna iniciar, pausar y reanudar la lectura del asistente de voz.
function toggleVoiceAssistant() {
  if (!isVoiceReading) {
    startVoiceAssistant();
    return;
  }

  if (isVoicePaused) {
    window.speechSynthesis.resume();
    isVoicePaused = false;
    updateVoiceButton();
    return;
  }

  window.speechSynthesis.pause();
  isVoicePaused = true;
  updateVoiceButton();
}

// Registra eventos de voz, mouse y foco para lectura general y pistas.
function initVoiceAssistant() {
  const btn = document.getElementById("btnVoiceAssistant");

  updateVoiceButton();
  btn?.addEventListener("click", toggleVoiceAssistant);
  document.addEventListener("mouseover", queueVoiceHint);
  document.addEventListener("focusin", queueVoiceHint);
  document.addEventListener("mouseout", clearVoiceHintQueue);

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener?.("voiceschanged", updateVoiceButton);
  }
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
  const state = document.getElementById("filterState").value;
  const lang = getCurrentLanguage();

  let filtered = [...allRoads];

  if (state) {
    filtered = filtered.filter((item) => item.estado === state);
  }

  visibleRoads = filtered;
  renderStats(buildStats(filtered), lang);
  renderIncidentMarkers(filtered, {
    onSelect: focusRoadOnMap
  });

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

// Punto de entrada de la aplicacion: inicializa UI, mapa, clima y datos remotos.
async function initApp() {
  initTheme();
  initMobileMenu();
  initMobileSidebar();
  initTutorial();
  initTripTracking();
  initVoiceAssistant();

  initLanguage(() => {
    stopVoiceAssistant();
    applyFilters();
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

  document.getElementById("filterState")?.addEventListener("change", applyFilters);
  document.getElementById("btnResetMap")?.addEventListener("click", () => {
    stopTripTracking({ clearMap: false });
    resetMapView();
  });

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
