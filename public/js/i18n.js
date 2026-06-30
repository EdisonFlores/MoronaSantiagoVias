// Diccionario central de textos. Cada clave se reutiliza desde data-i18n y JS.
export const translations = {
  es: {
    // APP / HEADER
    appTitle: "Ecuavial",
    appSubtitle: "Monitoreo vial inteligente de Morona Santiago",
    openMenu: "Abrir menú",
    climate: "Clima",
    languageToggle: "Idioma / Language",
    theme: "Tema",
    tutorialButton: "Tutorial",
    downloadApk: "Descargar APK",
    downloadAndroid: "Descargar para Android",
    voiceAssistant: "Asistente de Voz",
    voicePause: "Pausar voz",
    voiceResume: "Continuar voz",

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
    lastUpdated: "Actualizado por ECU 911",
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
    startTrip: "Iniciar recorrido",
    stopTrip: "Detener recorrido",
    yourLocation: "Tu ubicación",
    nearestRoad: "Tramo cercano",
    distanceToRoad: "Distancia al tramo",
    locationAccuracy: "Precisión GPS",
    noRoadNearby: "Sin tramo cercano",
    noRoadState: "Fuera de tramo reportado",

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
    tutorialStep: "Paso",
    tutorialPrev: "Atrás",
    tutorialNext: "Siguiente",
    tutorialFinish: "Finalizar",
    tutorialIntroTitle: "Explora el sistema",
    tutorialIntroText: "Este panel resume el monitoreo vial y te da acceso rápido a filtros, estadísticas e incidentes.",
    tutorialFilterTitle: "Filtra por estado",
    tutorialFilterText: "Usa este selector para ver todas las vías, solo las habilitadas, parciales o cerradas.",
    tutorialStatsTitle: "Revisa el resumen",
    tutorialStatsText: "Aquí puedes ver cuántos reportes hay por estado según la información cargada.",
    tutorialRoadsTitle: "Consulta incidentes",
    tutorialRoadsText: "Cada card muestra la vía, provincia, estado, observación, fuente y hora de actualización.",
    tutorialMapButtonTitle: "Ubica una vía",
    tutorialMapButtonText: "Pulsa Ver en mapa para centrar el tramo, abrir el marcador y dibujar la ruta aproximada.",
    tutorialMapTitle: "Navega el mapa",
    tutorialMapText: "En el mapa puedes acercarte, alejarte y revisar visualmente los tramos o marcadores reportados.",
    tutorialTripTitle: "Inicia un recorrido",
    tutorialTripText: "Este botón activa el GPS del dispositivo, muestra tu avance con un marcador de auto y te ayuda a identificar el tramo cercano y su estado.",
    tutorialResetTitle: "Limpia la vista",
    tutorialResetText: "Este botón vuelve el mapa a la vista inicial y elimina rutas o marcadores enfocados.",
    tutorialToolsTitle: "Herramientas rápidas",
    tutorialToolsText: "Desde la barra superior puedes consultar el clima, cambiar idioma y alternar el tema.",
    tutorialDownloadTitle: "Descarga la app",
    tutorialDownloadText: "En el footer puedes descargar la APK para instalar la versión Android de Ecuavial.",
    tutorialVoiceTitle: "Activa el asistente de voz",
    tutorialVoiceText: "Este botón lee en voz alta un resumen y luego permite escuchar elementos al pasar el cursor o enfocar controles.",
    voiceUnsupported: "Tu navegador no soporta lectura por voz.",
    voiceIntro: "Bienvenido a Ecuavial. Este es un resumen accesible del estado vial de Morona Santiago.",
    voiceStats: "Resumen de reportes",
    voiceNoRoads: "No hay incidentes para leer con el filtro actual.",
    shuarWarningTitle: "Traducción Shuar en revisión",
    shuarWarningText: "La traducción Shuar no es cien por ciento fiable y puede contener errores. Se recomienda validarla con hablantes o traductores de la comunidad.",
    shuarWarningAccept: "Entendido",

    // FOOTER
    footerDescription: "Plataforma de monitoreo vial de Morona Santiago",
    officialSource: "Fuente oficial:",
    footerLinksLabel: "Redes y contacto",
    touristms: "MoronaBus",
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
    tutorialButton: "Tutorial",
    downloadApk: "Download APK",
    downloadAndroid: "Download for Android",
    voiceAssistant: "Voice Assistant",
    voicePause: "Pause voice",
    voiceResume: "Resume voice",

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
    lastUpdated: "Updated by ECU 911",
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
    startTrip: "Start trip",
    stopTrip: "Stop trip",
    yourLocation: "Your location",
    nearestRoad: "Nearby segment",
    distanceToRoad: "Distance to segment",
    locationAccuracy: "GPS accuracy",
    noRoadNearby: "No nearby segment",
    noRoadState: "Outside reported segment",

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
    tutorialStep: "Step",
    tutorialPrev: "Back",
    tutorialNext: "Next",
    tutorialFinish: "Finish",
    tutorialIntroTitle: "Explore the system",
    tutorialIntroText: "This panel summarizes road monitoring and gives you quick access to filters, statistics, and incidents.",
    tutorialFilterTitle: "Filter by status",
    tutorialFilterText: "Use this selector to view all roads, only open roads, partial roads, or closed roads.",
    tutorialStatsTitle: "Check the summary",
    tutorialStatsText: "Here you can see how many reports exist by status according to the loaded information.",
    tutorialRoadsTitle: "Review incidents",
    tutorialRoadsText: "Each card shows the road, province, status, observation, source, and update time.",
    tutorialMapButtonTitle: "Locate a road",
    tutorialMapButtonText: "Press View on map to center the segment, open the marker, and draw the approximate route.",
    tutorialMapTitle: "Navigate the map",
    tutorialMapText: "On the map you can zoom in, zoom out, and visually inspect reported segments or markers.",
    tutorialTripTitle: "Start a trip",
    tutorialTripText: "This button enables device GPS, shows your progress with a car marker, and helps identify the nearby segment and its status.",
    tutorialResetTitle: "Clear the view",
    tutorialResetText: "This button returns the map to the initial view and removes focused routes or markers.",
    tutorialToolsTitle: "Quick tools",
    tutorialToolsText: "From the top bar you can check weather, switch language, and toggle theme.",
    tutorialDownloadTitle: "Download the app",
    tutorialDownloadText: "In the footer you can download the APK to install the Android version of Ecuavial.",
    tutorialVoiceTitle: "Enable the voice assistant",
    tutorialVoiceText: "This button reads aloud a summary and then lets users hear elements when hovering or focusing controls.",
    voiceUnsupported: "Your browser does not support voice reading.",
    voiceIntro: "Welcome to Ecuavial. This is an accessible summary of Morona Santiago road status.",
    voiceStats: "Report summary",
    voiceNoRoads: "There are no incidents to read with the current filter.",
    shuarWarningTitle: "Shuar translation under review",
    shuarWarningText: "The Shuar translation is not one hundred percent reliable and may contain errors. It should be validated with speakers or translators from the community.",
    shuarWarningAccept: "Understood",

    // FOOTER
    footerDescription: "Road monitoring platform for Morona Santiago",
    officialSource: "Official source:",
    footerLinksLabel: "Social links and contact",
    touristms: "MoronaBus",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp"
  }
};

translations.sh = {
  ...translations.es,
  appTitle: "Ecuavial",
  appSubtitle: "Morona Santiago jintia nekamuri",
  openMenu: "Menu urakma",
  climate: "Nayaimpin",
  languageToggle: "Idioma / Language / Shuar",
  theme: "Penkermamu",
  tutorialButton: "Nekapmamu",
  downloadAndroid: "Androidnum jukimpramu",
  voiceAssistant: "Chicham yaimkiamu",
  voicePause: "Chicham ankankamu",
  voiceResume: "Chicham nekapeamu",

  heroBadge: "Jintia nekamuri yamaram",
  heroTitle: "Jintia awajun, jintia najankamu nekata",
  heroText: "Morona Santiago jintia unuimiata mapa najanamunam.",

  filtersTitle: "Akanmamu",
  control: "Iniamu",
  stateLabel: "Nekamu",
  statsTitle: "Nekapmamu",
  summary: "Yamai etserma",
  roadsTitle: "Jintia",
  incidentsPill: "Awajun",
  resetMap: "Mapa iwiakmamu",

  optionAll: "Mash",
  optionOpen: "Urakmamu",
  optionPartial: "Aintsak urakmamu",
  optionClosed: "Epentmamu",

  total: "Mash",
  open: "Urakmamu",
  partial: "Aintsak",
  closed: "Epentmamu",

  province: "Provincia",
  observation: "Iismamu",
  alternateRoute: "Jintia chikich",
  source: "Nuyá jukimpramu",
  lastUpdated: "ECU 911 yamaram najanamamu",
  viewMap: "Mapanam iista",
  drawRoute: "Jintia najanata",
  road: "Jintia",
  noRoads: "Jintia iistin atsawai.",
  noLoadRoads: "Jintia nekamuri jukimaitsui.",
  noLoadStats: "Nekapmamu jukimaitsui.",
  noCoordinates: "Ju jintia coordenada atsawai.",
  noRoute: "Jintia najanamaitsui.",
  noNews: "ECU 911num yamaram etserma atsawai.",
  noReport: "Etserma atsawai",
  noObservation: "Iismamu atsawai.",

  mapStart: "Nankama",
  mapEnd: "Amua",
  mapCardTitle: "Jintia mapa",
  mapCardSubtitle: "Awajun nuya jintia mapa iismamu",
  online: "En linea",
  startTrip: "Jintia nankamata",
  stopTrip: "Jintia ankankamu",
  yourLocation: "Ame pujamurin",
  nearestRoad: "Jintia jeachat",
  distanceToRoad: "Jintia jeachat tsawantai",
  locationAccuracy: "GPS nekasrik",
  noRoadNearby: "Jintia jeachat atsawai",
  noRoadState: "Etserma jintia pujamunam atsawai",

  loadingStats: "Nekamuri jukimui...",
  loadingRoads: "Jintia jukimui...",

  weatherTitle: "Nayaimpin",
  weatherLocation: "Pujamuri",
  weatherTemp: "Tsueri",
  weatherWind: "Tampu",
  weatherMax: "Nunka tsueri",
  weatherMin: "Nunka yumiri",
  weatherLoading: "Jukimui...",
  weatherError: "Nayaimpin arantukma",
  weatherPointTitle: "Mapanam pujamunam nayaimpin",

  close: "Epentma",
  tutorialStep: "Nankama",
  tutorialPrev: "Tura",
  tutorialNext: "Nua",
  tutorialFinish: "Amua",
  tutorialIntroTitle: "Sistema nekata",
  tutorialIntroText: "Ju panel jintia nekamuri, akanmamu, nekapmamu nuya awajun iistiniawai.",
  tutorialFilterTitle: "Nekamujai akanma",
  tutorialFilterText: "Ju selectorjai jintia mash, urakmamu, aintsak urakmamu nuya epentmamu iista.",
  tutorialStatsTitle: "Nekapmamu iista",
  tutorialStatsText: "Juinkia nekamuri estadojai mash nekapmamu iistin atsumamu.",
  tutorialRoadsTitle: "Awajun iista",
  tutorialRoadsText: "Cardnum jintia, provincia, estado, iismamu, fuente nuya yamaram tsawan iistinawai.",
  tutorialMapButtonTitle: "Jintia eakma",
  tutorialMapButtonText: "Mapanam iista takakui jintia centro najanawai nuya marcador urakui.",
  tutorialMapTitle: "Mapa nampekta",
  tutorialMapText: "Mapanam jeachat iista, arantukma iista nuya marcador nekata.",
  tutorialTripTitle: "Jintia nankamata",
  tutorialTripText: "Ju botón GPS urakui, auto marcadorjai ame weamuri iistiniawai.",
  tutorialResetTitle: "Iismamu iwiakma",
  tutorialResetText: "Ju botón mapa nankamta iismamunam waketui nuya marcador epentui.",
  tutorialToolsTitle: "Yaimkiamu",
  tutorialToolsText: "Yakata barra nayaimpin, idioma nuya tema yapajiata.",
  tutorialDownloadTitle: "App jukimprata",
  tutorialDownloadText: "Footernum APK jukimpratin Androidnum Ecuavial apujtustinian.",
  tutorialVoiceTitle: "Chicham yaimkiamu urakma",
  tutorialVoiceText: "Ju botón resumen chichamjai aujmatsui nuya elemento pasamunam chicham etserui.",
  voiceUnsupported: "Ame navegador chicham aujmatsamu takakchayi.",
  voiceIntro: "Ecuavialnum penker tarimiat. Ju Morona Santiago jintia nekamuri resumen.",
  voiceStats: "Etserma nekapmamu",
  voiceNoRoads: "Filtro yamainkia awajun aujmatsatin atsawai.",

  shuarWarningTitle: "Traducción Shuar en revisión",
  shuarWarningText: "La traducción Shuar no es cien por ciento fiable y puede contener errores. Se recomienda validarla con hablantes o traductores de la comunidad.",
  shuarWarningAccept: "Entendido",

  footerDescription: "Morona Santiago jintia nekamuri plataforma",
  officialSource: "Fuente oficial:",
  footerLinksLabel: "Redes nuya contacto",
  touristms: "MoronaBus",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp"
};

// Traduce estados provenientes de ECU 911 sin alterar el valor original del dato.
export function translateState(state = "", lang = "es") {
  const value = String(state).toLowerCase();

  if (lang === "sh") {
    if (value.includes("cerrada") || value.includes("closed")) return translations.sh.optionClosed;
    if (value.includes("parcial") || value.includes("partially")) return translations.sh.optionPartial;
    if (value.includes("sin reporte") || value.includes("no report")) return translations.sh.noReport;
    return translations.sh.optionOpen;
  }

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
