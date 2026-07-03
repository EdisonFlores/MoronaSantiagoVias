// Helpers de validacion, normalizacion y persistencia de incidentes reportados por usuarios.
import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { getFirestoreDb, getUserIncidentsCollectionName } from "./firebaseAdmin.js";
import { viasTramos } from "./viasTramosData.js";

const INCIDENT_TYPES = {
  choque: "Choque",
  bache: "Bache",
  derrumbe: "Derrumbe",
  deslizamiento: "Deslizamiento",
  via_cerrada: "Vía cerrada",
  obstaculo: "Obstáculo",
  inundacion: "Inundación",
  otro: "Otro"
};

const MAX_DESCRIPTION_LENGTH = 700;
const MAX_NAME_LENGTH = 90;
const MAX_LOCATION_DISTANCE_METERS = 1500;

// Devuelve la referencia de coleccion Firestore configurada para reportes ciudadanos.
export function getUserIncidentsCollection() {
  return getFirestoreDb().collection(getUserIncidentsCollectionName());
}

// Responde JSON evitando repetir encabezados en cada endpoint.
export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

// Intenta parsear body si llega como string; en Vercel normalmente ya viene parseado.
export function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  return body;
}

// Normaliza textos de entrada a mayusculas estables para provincia/canton/parroquia/nombre.
function normalizeUpperText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-EC");
}

// Limpia textos libres sin cambiar su capitalizacion para conservar la descripcion.
function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

// Convierte cualquier valor numerico valido a Number.
function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Acepta ubicacion como GeoPoint-like, {lat,lng}, {latitude,longitude} o lat/lng planos.
function getLocationInput(payload) {
  const source = payload.ubicacion || payload.location || payload;
  const lat = toFiniteNumber(source.lat ?? source.latitude);
  const lng = toFiniteNumber(source.lng ?? source.longitude);

  return lat !== null && lng !== null ? { lat, lng } : null;
}

// Valida que la coordenada este en rangos reales de latitud y longitud.
function isValidLocation(location) {
  return (
    location &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    location.lng >= -180 &&
    location.lng <= 180
  );
}

// Proyecta lat/lng a metros aproximados para comparar contra segmentos locales.
function projectToMeters(point, referenceLat) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((referenceLat * Math.PI) / 180);

  return {
    x: point.lng * metersPerDegreeLng,
    y: point.lat * metersPerDegreeLat
  };
}

// Calcula distancia minima entre un punto y el segmento start/end de una via.
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

// Convierte coordenadas [lat,lng] de viasTramos a objeto usado por los calculos.
function getRoadCoord(point) {
  if (!Array.isArray(point) || point.length < 2) return null;

  const lat = toFiniteNumber(point[0]);
  const lng = toFiniteNumber(point[1]);

  return lat !== null && lng !== null ? { lat, lng } : null;
}

// Estima confianza segun la distancia entre el reporte y la via detectada.
function getRoadConfidence(distanceMeters) {
  if (distanceMeters <= 250) return "alta";
  if (distanceMeters <= 800) return "media";
  return "baja";
}

// Detecta automaticamente la via mas cercana al punto reportado.
export function detectNearestRoad(location) {
  const point = {
    lat: location.lat,
    lng: location.lng
  };

  const nearest = viasTramos.reduce((best, road) => {
    const start = getRoadCoord(road.start);
    const end = getRoadCoord(road.end);

    if (!start || !end) return best;

    const distanceMeters = getPointSegmentDistanceMeters(point, start, end);

    if (!best || distanceMeters < best.distanceMeters) {
      return { road, distanceMeters };
    }

    return best;
  }, null);

  if (!nearest || nearest.distanceMeters > MAX_LOCATION_DISTANCE_METERS) {
    return {
      idVia: "",
      nombreVia: "NO DETECTADA",
      referencia: "",
      distanciaMetros: nearest ? Math.round(nearest.distanceMeters) : null,
      confianza: "ninguna"
    };
  }

  return {
    idVia: nearest.road.id,
    nombreVia: normalizeUpperText(nearest.road.via),
    referencia: nearest.road.ref || "",
    distanciaMetros: Math.round(nearest.distanceMeters),
    confianza: getRoadConfidence(nearest.distanceMeters)
  };
}

// Valida campos obligatorios del formulario ciudadano.
function validateCreatePayload(payload) {
  const errors = [];
  const tipo = cleanText(payload.tipo).toLowerCase();
  const tipoTexto = INCIDENT_TYPES[tipo] || cleanText(payload.tipoTexto);
  const descripcion = cleanText(payload.descripcion);
  const provincia = normalizeUpperText(payload.provincia);
  const canton = normalizeUpperText(payload.canton);
  const parroquia = normalizeUpperText(payload.parroquia);
  const nombre = normalizeUpperText(payload.reportante?.nombre || payload.nombre);
  const responsabilidadAceptada = payload.responsabilidadAceptada === true;
  const location = getLocationInput(payload);

  if (!tipo) errors.push("tipo es obligatorio.");
  if (tipo && !INCIDENT_TYPES[tipo] && !tipoTexto) errors.push("tipoTexto es obligatorio cuando tipo no está en el catálogo.");
  if (!descripcion) errors.push("descripción es obligatoria.");
  if (descripcion.length > MAX_DESCRIPTION_LENGTH) errors.push(`descripción no debe superar ${MAX_DESCRIPTION_LENGTH} caracteres.`);
  if (!provincia) errors.push("provincia es obligatoria.");
  if (!canton) errors.push("cantón es obligatorio.");
  if (!parroquia) errors.push("parroquia es obligatoria.");
  if (!nombre) errors.push("reportante.nombre es obligatorio.");
  if (nombre.length > MAX_NAME_LENGTH) errors.push(`reportante.nombre no debe superar ${MAX_NAME_LENGTH} caracteres.`);
  if (!responsabilidadAceptada) errors.push("responsabilidadAceptada debe ser true.");
  if (!isValidLocation(location)) errors.push("ubicación debe ser un punto válido con lat y lng.");

  return {
    ok: !errors.length,
    errors,
    value: {
      tipo,
      tipoTexto,
      descripcion,
      provincia,
      canton,
      parroquia,
      nombre,
      responsabilidadAceptada,
      location
    }
  };
}

// Construye el documento Firestore final con campos automaticos del backend.
export function buildUserIncidentDocument(payload) {
  const validation = validateCreatePayload(payload);

  if (!validation.ok) {
    const error = new Error("Reporte ciudadano inválido.");
    error.statusCode = 400;
    error.details = validation.errors;
    throw error;
  }

  const data = validation.value;

  return {
    tipo: data.tipo,
    tipoTexto: data.tipoTexto,
    descripcion: data.descripcion,
    fuente: "usuario",
    visibilidad: "publico",
    provincia: data.provincia,
    canton: data.canton,
    parroquia: data.parroquia,
    ubicacion: new GeoPoint(data.location.lat, data.location.lng),
    viaDetectada: detectNearestRoad(data.location),
    reportante: {
      nombre: data.nombre
    },
    responsabilidadAceptada: data.responsabilidadAceptada,
    creadoEn: FieldValue.serverTimestamp()
  };
}

// Convierte valores Firestore a JSON consumible por el frontend.
export function serializeUserIncident(doc) {
  const data = doc.data();
  const ubicacion = data.ubicacion;
  const creadoEn = data.creadoEn?.toDate?.();

  return {
    id: doc.id,
    ...data,
    ubicacion: ubicacion
      ? {
          lat: ubicacion.latitude,
          lng: ubicacion.longitude
        }
      : null,
    creadoEn: creadoEn ? creadoEn.toISOString() : null
  };
}

// Verifica una llave simple para operaciones administrativas.
export function requireAdminKey(req) {
  const adminKey = process.env.USER_INCIDENTS_ADMIN_KEY;

  if (!adminKey) {
    const error = new Error("USER_INCIDENTS_ADMIN_KEY no está configurada.");
    error.statusCode = 503;
    throw error;
  }

  if (req.headers["x-admin-key"] !== adminKey) {
    const error = new Error("No autorizado.");
    error.statusCode = 401;
    throw error;
  }
}

// Respuesta de error uniforme para endpoints CRUD.
export function handleApiError(res, error) {
  if (error?.code === 5) {
    sendJson(res, 503, {
      ok: false,
      message: "Firestore no encontró la base de datos configurada. Revisa FIRESTORE_DATABASE_ID; si usas la base normal de Firebase debe ser (default)."
    });
    return;
  }

  if (error?.code === 8 || error?.code === "resource-exhausted") {
    sendJson(res, 429, {
      ok: false,
      message: "El servicio de reportes ciudadanos alcanzó temporalmente su límite de uso. Intenta nuevamente más tarde."
    });
    return;
  }

  if (error?.code === 4 || error?.code === 14 || error?.code === "deadline-exceeded" || error?.code === "unavailable") {
    sendJson(res, 503, {
      ok: false,
      message: "El servicio de reportes ciudadanos no está disponible temporalmente. Intenta nuevamente más tarde."
    });
    return;
  }

  if (error?.code === 9 || error?.code === "failed-precondition") {
    sendJson(res, 503, {
      ok: false,
      message: "Firestore necesita preparar un índice para esta consulta de reportes ciudadanos."
    });
    return;
  }

  if (!error.statusCode || error.statusCode >= 500) {
    console.error(error);
  }

  sendJson(res, error.statusCode || 500, {
    ok: false,
    message: error.message || "Error interno.",
    errors: error.details || undefined
  });
}
