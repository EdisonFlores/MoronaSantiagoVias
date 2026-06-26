//public/js/app.js
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
import { initWeather, bindWeatherToMap } from "./weather.js";
import { translations } from "./i18n.js";

let allRoads = [];
let tripWatchId = null;
let isTripTracking = false;
let lastTripErrorAt = 0;

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

function projectToMeters(point, referenceLat) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((referenceLat * Math.PI) / 180);

  return {
    x: point.lng * metersPerDegreeLng,
    y: point.lat * metersPerDegreeLat
  };
}

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
  }
];

let tutorialIndex = 0;
let currentTutorialTarget = null;

function getTutorialElement(step) {
  return (
    document.querySelector(step.selector) ||
    (step.fallbackSelector ? document.querySelector(step.fallbackSelector) : null)
  );
}

function getTutorialFocusElement(step) {
  return (
    (step.focusSelector ? document.querySelector(step.focusSelector) : null) ||
    getTutorialElement(step)
  );
}

function getTutorialHighlightElement(step) {
  return (
    (step.highlightSelector ? document.querySelector(step.highlightSelector) : null) ||
    getTutorialFocusElement(step)
  );
}

function waitForTutorialFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function waitForTutorialDelay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clampTutorialValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getTutorialViewportMode() {
  if (window.innerWidth <= 576) return "phone";
  if (window.innerWidth <= 992) return "tablet";
  return "desktop";
}

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

function closeTutorial() {
  const overlay = document.getElementById("tutorialOverlay");

  overlay?.classList.remove("show");
  overlay?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tutorial-active");
  setMobileHeaderActionsState(false);
  currentTutorialTarget = null;
}

function openTutorial() {
  const overlay = document.getElementById("tutorialOverlay");

  if (!overlay) return;

  tutorialIndex = 0;
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("tutorial-active");
  renderTutorialStep();
}

function initTutorial() {
  const openBtn = document.getElementById("btnTutorial");
  const closeBtn = document.getElementById("tutorialClose");
  const prevBtn = document.getElementById("tutorialPrev");
  const nextBtn = document.getElementById("tutorialNext");
  const overlay = document.getElementById("tutorialOverlay");

  openBtn?.addEventListener("click", openTutorial);
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

async function initApp() {
  initTheme();
  initMobileMenu();
  initMobileSidebar();
  initTutorial();
  initTripTracking();

  initLanguage(() => {
    applyFilters();
    updateTripButton();
    const tutorialOverlay = document.getElementById("tutorialOverlay");
    if (tutorialOverlay?.classList.contains("show")) {
      renderTutorialStep();
    }

    const map = getMapInstance();
    if (map) {
      bindWeatherToMap(map, getCurrentLanguage);
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
