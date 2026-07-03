// CRUD base para incidentes ciudadanos: lista publicos y crea nuevos reportes.
import { Timestamp } from "firebase-admin/firestore";
import {
  buildUserIncidentDocument,
  getUserIncidentsCollection,
  handleApiError,
  parseBody,
  sendJson,
  serializeUserIncident
} from "../lib/userIncidentReports.js";

// Limita el tamano de consulta para cuidar lecturas de Firestore.
function getSafeLimit(value) {
  const limit = Number(value || 50);

  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function getSafeCursor(value) {
  const cursor = String(value || "").trim();
  return cursor || null;
}

function getActiveReportsCutoff() {
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  return Timestamp.fromDate(new Date(Date.now() - twoWeeksMs));
}

// Lista reportes ciudadanos publicos ordenados por fecha reciente.
async function listUserIncidents(req, res) {
  const limit = getSafeLimit(req.query?.limit);
  const cursor = getSafeCursor(req.query?.cursor);
  const collection = getUserIncidentsCollection();
  const activeCutoff = getActiveReportsCutoff();
  let query = collection
    .where("visibilidad", "==", "publico")
    .where("creadoEn", ">=", activeCutoff)
    .orderBy("creadoEn", "desc")
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      query = query.startAfter(Timestamp.fromDate(cursorDate));
    }
  }

  let snapshot;
  let incidents;

  try {
    snapshot = await query.get();
    incidents = snapshot.docs.map(serializeUserIncident);
  } catch (error) {
    if (error?.code !== 9 && error?.code !== "failed-precondition") {
      throw error;
    }

    const fallbackSnapshot = await collection
      .orderBy("creadoEn", "desc")
      .limit(limit * 2)
      .get();

    snapshot = fallbackSnapshot;
    incidents = fallbackSnapshot.docs
      .map(serializeUserIncident)
      .filter((incident) => {
        const createdAt = incident.creadoEn ? new Date(incident.creadoEn) : null;
        return (
          incident.visibilidad === "publico" &&
          createdAt &&
          !Number.isNaN(createdAt.getTime()) &&
          createdAt >= activeCutoff.toDate()
        );
      })
      .slice(0, limit);
  }

  const lastIncident = incidents.at(-1);

  sendJson(res, 200, {
    ok: true,
    total: incidents.length,
    nextCursor: snapshot.size >= limit && lastIncident?.creadoEn ? lastIncident.creadoEn : null,
    incidents
  });
}

// Crea un reporte ciudadano validando campos obligatorios y deteccion de via.
async function createUserIncident(req, res) {
  const payload = parseBody(req.body);
  const doc = buildUserIncidentDocument(payload);
  const ref = await getUserIncidentsCollection().add(doc);
  const created = await ref.get();

  sendJson(res, 201, {
    ok: true,
    incident: serializeUserIncident(created)
  });
}

// Handler Vercel para GET/POST de incidentes ciudadanos.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      await listUserIncidents(req, res);
      return;
    }

    if (req.method === "POST") {
      await createUserIncident(req, res);
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
