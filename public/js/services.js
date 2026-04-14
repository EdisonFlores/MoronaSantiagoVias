// services.js
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

  const start = `${segment.start[0]},${segment.start[1]}`;
  const end = `${segment.end[0]},${segment.end[1]}`;

  const url =
    `/api/osrm-route?start=${encodeURIComponent(start)}` +
    `&end=${encodeURIComponent(end)}` +
    `&profile=driving`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.ok || !data.route?.coordinates?.length) {
    throw new Error(data.message || "No se pudo obtener la ruta desde el backend");
  }

  return data.route.coordinates;
}