//i18n.js
export const translations = {
  es: {
    // APP / HEADER
    appTitle: "Ecuavial",
    appSubtitle: "Monitoreo vial inteligente de Morona Santiago",
    openMenu: "Abrir menú",
    climate: "Clima",
    languageToggle: "Idioma / Language",
    theme: "Tema",

    // HERO
    heroBadge: "Estado vial en tiempo real",
    heroTitle: "Consulta incidencias, rutas y condiciones de las vías",
    heroText: "Explora la red vial de Morona Santiago en un mapa interactivo con información organizada y visual.",

    // PANELS / FILTERS
    filtersTitle: "Filtros",
    control: "Control",
    stateLabel: "Estado",
    statsTitle: "Estadísticas",
    summary: "Resumen",
    roadsTitle: "Red vial",
    incidentsPill: "Incidentes",
    resetMap: "Limpiar mapa",

    // FILTER OPTIONS
    optionAll: "Todos",
    optionOpen: "Habilitada",
    optionPartial: "Parcialmente habilitada",
    optionClosed: "Cerrada",

    // STATS
    total: "Total",
    open: "Habilitadas",
    partial: "Parciales",
    closed: "Cerradas",

    // INCIDENTS / UI
    province: "Provincia",
    observation: "Observación",
    alternateRoute: "Vía alterna",
    source: "Fuente",
    viewMap: "Ver en mapa",
    drawRoute: "Dibujar ruta",
    road: "Vía",
    noRoads: "No hay vías para mostrar.",
    noLoadRoads: "No se pudieron cargar las vías.",
    noLoadStats: "No se pudieron cargar los datos.",
    noCoordinates: "No hay coordenadas para este tramo.",
    noRoute: "No se pudo dibujar la ruta.",
    noNews: "Sin novedades reportadas en ECU 911.",
    noReport: "Sin reporte",
    noObservation: "Sin observaciones.",

    // MAP
    mapStart: "Inicio",
    mapEnd: "Fin",
    mapCardTitle: "Mapa vial interactivo",
    mapCardSubtitle: "Visualización geográfica de incidencias y tramos",
    online: "En línea",

    // LOADING
    loadingStats: "Cargando datos...",
    loadingRoads: "Cargando vías...",

    // WEATHER
    weatherTitle: "Clima",
    weatherLocation: "Ubicación",
    weatherTemp: "Temperatura",
    weatherWind: "Viento",
    weatherMax: "Máxima",
    weatherMin: "Mínima",
    weatherLoading: "Cargando...",
    weatherError: "Error clima",
    weatherPointTitle: "Clima del punto actual del mapa",

    // MODAL / GENERIC
    close: "Cerrar",

    // FOOTER
    footerDescription: "Plataforma de monitoreo vial de Morona Santiago",
    officialSource: "Fuente oficial:",
    footerLinksLabel: "Redes y contacto",
    touristms: "TouristMS",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp"
  },

  en: {
    // APP / HEADER
    appTitle: "Ecuavial",
    appSubtitle: "Smart road monitoring for Morona Santiago",
    openMenu: "Open menu",
    climate: "Weather",
    languageToggle: "Language / Idioma",
    theme: "Theme",

    // HERO
    heroBadge: "Real-time road status",
    heroTitle: "Check incidents, routes, and road conditions",
    heroText: "Explore the road network of Morona Santiago on an interactive map with organized visual information.",

    // PANELS / FILTERS
    filtersTitle: "Filters",
    control: "Control",
    stateLabel: "Status",
    statsTitle: "Statistics",
    summary: "Summary",
    roadsTitle: "Road network",
    incidentsPill: "Incidents",
    resetMap: "Clear map",

    // FILTER OPTIONS
    optionAll: "All",
    optionOpen: "Open",
    optionPartial: "Partially open",
    optionClosed: "Closed",

    // STATS
    total: "Total",
    open: "Open",
    partial: "Partial",
    closed: "Closed",

    // INCIDENTS / UI
    province: "Province",
    observation: "Observation",
    alternateRoute: "Alternate route",
    source: "Source",
    viewMap: "View on map",
    drawRoute: "Draw route",
    road: "Road",
    noRoads: "No roads to display.",
    noLoadRoads: "Roads could not be loaded.",
    noLoadStats: "Statistics could not be loaded.",
    noCoordinates: "There are no coordinates for this segment.",
    noRoute: "The route could not be drawn.",
    noNews: "No incidents reported by ECU 911.",
    noReport: "No report",
    noObservation: "No observations.",

    // MAP
    mapStart: "Start",
    mapEnd: "End",
    mapCardTitle: "Interactive road map",
    mapCardSubtitle: "Geographic visualization of incidents and road segments",
    online: "Online",

    // LOADING
    loadingStats: "Loading statistics...",
    loadingRoads: "Loading roads...",

    // WEATHER
    weatherTitle: "Weather",
    weatherLocation: "Location",
    weatherTemp: "Temperature",
    weatherWind: "Wind",
    weatherMax: "High",
    weatherMin: "Low",
    weatherLoading: "Loading...",
    weatherError: "Weather error",
    weatherPointTitle: "Weather at the current map center",

    // MODAL / GENERIC
    close: "Close",

    // FOOTER
    footerDescription: "Road monitoring platform for Morona Santiago",
    officialSource: "Official source:",
    footerLinksLabel: "Social links and contact",
    touristms: "TouristMS",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp"
  }
};

export function translateState(state = "", lang = "es") {
  const value = String(state).toLowerCase();

  if (lang === "en") {
    if (value.includes("cerrada") || value.includes("closed")) return "Closed";
    if (value.includes("parcial") || value.includes("partially")) return "Partially open";
    if (value.includes("sin reporte") || value.includes("no report")) return "No report";
    return "Open";
  }

  if (value.includes("cerrada") || value.includes("closed")) return "Cerrada";
  if (value.includes("parcial") || value.includes("partially")) return "Parcialmente habilitada";
  if (value.includes("sin reporte") || value.includes("no report")) return "Sin reporte";
  return "Habilitada";
}