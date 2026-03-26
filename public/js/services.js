export async function fetchIncidents() {
  const response = await fetch("/api/incidents");
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "No se pudieron cargar las vías");
  }

  return data;
}

export async function fetchOsrmRoute(segment) {
  if (!segment?.start || !segment?.end) {
    throw new Error("El tramo no tiene coordenadas start/end");
  }

  const coords = [
    `${segment.start[1]},${segment.start[0]}`,
    `${segment.end[1]},${segment.end[0]}`
  ].join(";");

  const url =
    `https://router.project-osrm.org/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&steps=false`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.code !== "Ok" || !data.routes?.length) {
    throw new Error("OSRM no encontró ruta");
  }

  return data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
}