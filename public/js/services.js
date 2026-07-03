// Capa de acceso HTTP usada por el frontend para no mezclar fetch con UI.
// Solicita al backend la red vial ya combinada con incidentes ECU 911.
export async function fetchIncidents() {
  const response = await fetch("/api/incidents");
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "No se pudieron cargar las vías");
  }

  return data;
}

// Lee JSON de forma segura para que un error HTML del servidor no rompa la UI.
async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      message: "Respuesta invalida del servidor"
    };
  }
}

// Solicita los reportes ciudadanos guardados en Firestore.
export async function fetchUserIncidents(options = {}) {
  const limit = Number(options.limit) || 50;
  const params = new URLSearchParams({
    limit: String(limit)
  });

  if (options.cursor) {
    params.set("cursor", options.cursor);
  }

  const response = await fetch(`/api/user-incidents?${params.toString()}`);
  const data = await readJsonResponse(response);

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "No se pudieron cargar los reportes ciudadanos");
  }

  return data;
}

// Registra un incidente ciudadano usando el backend seguro con Firebase Admin.
export async function createUserIncident(payload) {
  const response = await fetch("/api/user-incidents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);

  if (!response.ok || !data.ok) {
    const details = Array.isArray(data.errors) && data.errors.length
      ? ` ${data.errors.join(" ")}`
      : "";
    throw new Error(`${data.message || "No se pudo registrar el incidente"}${details}`);
  }

  return data;
}

// Pide al backend una ruta OSRM y controla el timeout desde el cliente.
export async function fetchOsrmRoute(segment, options = {}) {
  if (!segment?.start || !segment?.end) {
    throw new Error("El tramo no tiene coordenadas start/end");
  }

  const timeoutMs = options.timeoutMs || 6000;
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const start = `${segment.start[0]},${segment.start[1]}`;
    const end = `${segment.end[0]},${segment.end[1]}`;

    const url =
      `/api/osrm-route?start=${encodeURIComponent(start)}` +
      `&end=${encodeURIComponent(end)}` +
      `&profile=driving`;

    const response = await fetch(url, {
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok || !data.ok || !data.route?.coordinates?.length) {
      throw new Error(data.message || "No se pudo obtener la ruta desde el backend");
    }

    return {
      ok: true,
      source: "osrm",
      coordinates: data.route.coordinates
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("OSRM demoró demasiado");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
