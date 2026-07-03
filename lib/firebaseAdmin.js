// Inicializa Firebase Admin desde variables de entorno del backend.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// En desarrollo local, algunos arranques de vercel dev no inyectan .env.local al API.
function loadLocalEnvFile() {
  const envPath = join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) return;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

loadLocalEnvFile();

// Convierte la private key guardada en env con \n escapados al formato real.
function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

// Permite que los endpoints respondan claro cuando falta configuracion local.
export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    getPrivateKey()
  );
}

// Valida que el backend tenga las credenciales minimas para Firebase Admin.
function getFirebaseCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    const error = new Error("Firebase Admin no esta configurado. Revisa FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.");
    error.statusCode = 503;
    throw error;
  }

  return {
    projectId,
    clientEmail,
    privateKey
  };
}

// Reutiliza la app Admin entre invocaciones serverless cuando Vercel la mantiene viva.
export function getFirebaseAdminApp() {
  if (getApps().length) return getApps()[0];

  return initializeApp({
    credential: cert(getFirebaseCredentials())
  });
}

// Devuelve Firestore usando la base configurada, sea default o una base nombrada.
export function getFirestoreDb() {
  const app = getFirebaseAdminApp();
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

  return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
}

// Nombre de coleccion para reportes ciudadanos.
export function getUserIncidentsCollectionName() {
  return process.env.FIRESTORE_USER_INCIDENTS_COLLECTION || "incidentesusuarios";
}
