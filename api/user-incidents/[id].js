// CRUD por id para incidentes ciudadanos. Cambios destructivos requieren llave admin.
import { FieldValue } from "firebase-admin/firestore";
import {
  getUserIncidentsCollection,
  handleApiError,
  parseBody,
  requireAdminKey,
  sendJson,
  serializeUserIncident
} from "../../lib/userIncidentReports.js";

const ALLOWED_VISIBILITY = new Set(["publico", "oculto"]);

// Obtiene el id desde rutas dinamicas de Vercel.
function getIncidentId(req) {
  return String(req.query?.id || "").trim();
}

// Busca un documento por id o responde como no encontrado.
async function getIncidentRef(req) {
  const id = getIncidentId(req);

  if (!id) {
    const error = new Error("id es obligatorio.");
    error.statusCode = 400;
    throw error;
  }

  const ref = getUserIncidentsCollection().doc(id);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    const error = new Error("Reporte ciudadano no encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return { ref, snapshot };
}

// Lee un reporte publico por id.
async function getUserIncident(req, res) {
  const { snapshot } = await getIncidentRef(req);
  const incident = serializeUserIncident(snapshot);

  if (incident.visibilidad !== "publico") {
    sendJson(res, 404, {
      ok: false,
      message: "Reporte ciudadano no encontrado."
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    incident
  });
}

// Construye una actualizacion administrativa acotada para no romper el esquema.
function buildAdminUpdate(payload) {
  const update = {};

  if (payload.visibilidad !== undefined) {
    if (!ALLOWED_VISIBILITY.has(payload.visibilidad)) {
      const error = new Error("visibilidad debe ser público u oculto.");
      error.statusCode = 400;
      throw error;
    }

    update.visibilidad = payload.visibilidad;
  }

  if (payload.descripcion !== undefined) {
    update.descripcion = String(payload.descripcion).replace(/\s+/g, " ").trim();
  }

  if (payload.tipo !== undefined) {
    update.tipo = String(payload.tipo).replace(/\s+/g, " ").trim().toLowerCase();
  }

  if (payload.tipoTexto !== undefined) {
    update.tipoTexto = String(payload.tipoTexto).replace(/\s+/g, " ").trim();
  }

  if (!Object.keys(update).length) {
    const error = new Error("No hay campos válidos para actualizar.");
    error.statusCode = 400;
    throw error;
  }

  return update;
}

// Actualiza campos administrativos del reporte.
async function updateUserIncident(req, res) {
  requireAdminKey(req);
  const { ref } = await getIncidentRef(req);
  const payload = parseBody(req.body);
  const update = buildAdminUpdate(payload);

  await ref.update(update);
  const updated = await ref.get();

  sendJson(res, 200, {
    ok: true,
    incident: serializeUserIncident(updated)
  });
}

// Oculta el reporte en lugar de borrarlo fisicamente para conservar trazabilidad.
async function deleteUserIncident(req, res) {
  requireAdminKey(req);
  const { ref } = await getIncidentRef(req);

  await ref.update({
    visibilidad: "oculto",
    eliminadoEn: FieldValue.serverTimestamp()
  });

  sendJson(res, 200, {
    ok: true
  });
}

// Handler Vercel para operaciones por id.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      await getUserIncident(req, res);
      return;
    }

    if (req.method === "PATCH") {
      await updateUserIncident(req, res);
      return;
    }

    if (req.method === "DELETE") {
      await deleteUserIncident(req, res);
      return;
    }

    sendJson(res, 405, {
      ok: false,
      message: "Método no permitido."
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
