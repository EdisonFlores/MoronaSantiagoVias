export const translations = {
  es: {
    appTitle: "Ecuavial",
    filtersTitle: "Filtros",
    stateLabel: "Estado",
    statsTitle: "Estadísticas",
    roadsTitle: "Red vial",
    resetMap: "Limpiar mapa",
    optionAll: "Todos",
    optionOpen: "Habilitada",
    optionPartial: "Parcialmente habilitada",
    optionClosed: "Cerrada",
    total: "Total",
    open: "Habilitadas",
    partial: "Parciales",
    closed: "Cerradas",
    province: "Provincia",
    observation: "Observación",
    alternateRoute: "Vía alterna",
    source: "Fuente",
    viewMap: "Ver en mapa",
    drawRoute: "Dibujar ruta",
    noRoads: "No hay vías para mostrar.",
    noLoadRoads: "No se pudieron cargar las vías.",
    noCoordinates: "No hay coordenadas para este tramo.",
    noRoute: "No se pudo dibujar la ruta.",
    noNews: "Sin novedades reportadas en ECU 911.",
    mapStart: "Inicio",
    mapEnd: "Fin",
    weatherTitle: "Clima"
  },
  en: {
    appTitle: "Ecuavial",
    filtersTitle: "Filters",
    stateLabel: "Status",
    statsTitle: "Statistics",
    roadsTitle: "Road network",
    resetMap: "Clear map",
    optionAll: "All",
    optionOpen: "Open",
    optionPartial: "Partially open",
    optionClosed: "Closed",
    total: "Total",
    open: "Open",
    partial: "Partial",
    closed: "Closed",
    province: "Province",
    observation: "Observation",
    alternateRoute: "Alternate route",
    source: "Source",
    viewMap: "View on map",
    drawRoute: "Draw route",
    noRoads: "No roads to display.",
    noLoadRoads: "Roads could not be loaded.",
    noCoordinates: "There are no coordinates for this segment.",
    noRoute: "The route could not be drawn.",
    noNews: "No incidents reported by ECU 911.",
    mapStart: "Start",
    mapEnd: "End",
    weatherTitle: "Weather"
  }
};

export function translateState(state = "", lang = "es") {
  const value = state.toLowerCase();

  if (lang === "en") {
    if (value.includes("cerrada")) return "Closed";
    if (value.includes("parcial")) return "Partially open";
    return "Open";
  }

  if (value.includes("cerrada")) return "Cerrada";
  if (value.includes("parcial")) return "Parcialmente habilitada";
  return "Habilitada";
}