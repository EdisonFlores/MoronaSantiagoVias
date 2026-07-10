import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { viasTramos } from "../lib/viasTramosData.js";

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Uso: node scripts/build-administrative-data.js <directorio-geojson>");

const rootDir = path.resolve(import.meta.dirname, "..");
const publicOutputDir = path.join(rootDir, "public", "data", "administrative");
const roadAreasOutput = path.join(rootDir, "data", "road-administrative-areas.json");

function normalizeName(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();
}

function readProperty(feature, keys) {
  const properties = feature?.properties || {};
  const keyMap = new Map(Object.keys(properties).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const realKey = keyMap.get(key.toLowerCase());
    const value = realKey ? properties[realKey] : undefined;
    if (value !== undefined && value !== null && value !== "") return String(value).trim();
  }
  return "";
}

const getProvinceName = (feature) => readProperty(feature, [
  "DPA_DESPRO", "DPA_PROVIN", "PROVINCIA", "provincia", "province", "NAME_1", "NOMBRE", "name"
]);
const getCantonName = (feature) => readProperty(feature, [
  "DPA_DESCAN", "CANTON", "canton", "NAME_2", "NOMBRE", "name"
]);

function squaredDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = end;
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const threshold = tolerance * tolerance;
  let maxDistance = threshold;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistance(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) { maxDistance = distance; splitIndex = index; }
  }
  if (!splitIndex) return [points[0], points[points.length - 1]];
  const left = simplifyLine(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyLine(points.slice(splitIndex), tolerance);
  return left.slice(0, -1).concat(right);
}

function roundPoint(point) {
  return [Number(Number(point[0]).toFixed(5)), Number(Number(point[1]).toFixed(5))];
}

function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length < 5) return ring?.map(roundPoint) || [];
  const openRing = ring.slice(0, -1);
  const simplified = simplifyLine(openRing.concat([openRing[0]]), tolerance);
  if (simplified.length < 4) return ring.map(roundPoint);
  const rounded = simplified.map(roundPoint);
  rounded[rounded.length - 1] = [...rounded[0]];
  return rounded;
}

function simplifyGeometry(geometry, tolerance) {
  if (geometry?.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, tolerance)) };
  }
  if (geometry?.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => simplifyRing(ring, tolerance))) };
  }
  return geometry;
}

function getRoadPoints(road) {
  const raw = Array.isArray(road.points) && road.points.length >= 2 ? road.points : [road.start, road.end];
  return raw.filter((point) => Array.isArray(point) && point.length >= 2)
    .map((point) => [Number(point[1]), Number(point[0])])
    .filter((point) => point.every(Number.isFinite));
}

function getBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point[0]), minY: Math.min(bounds.minY, point[1]),
    maxX: Math.max(bounds.maxX, point[0]), maxY: Math.max(bounds.maxY, point[1])
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function collectGeometryPoints(coordinates, output = []) {
  if (!Array.isArray(coordinates)) return output;
  if (coordinates.length >= 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
    output.push([Number(coordinates[0]), Number(coordinates[1])]);
  } else coordinates.forEach((item) => collectGeometryPoints(item, output));
  return output;
}

function overlaps(first, second) {
  return first.minX <= second.maxX && first.maxX >= second.minX &&
    first.minY <= second.maxY && first.maxY >= second.minY;
}

function pointOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  return Math.abs(cross) <= 1e-10 && point[0] >= Math.min(start[0], end[0]) - 1e-10 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-10 && point[1] >= Math.min(start[1], end[1]) - 1e-10 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-10;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (pointOnSegment(point, ring[j], ring[i])) return true;
    if (((ring[i][1] > point[1]) !== (ring[j][1] > point[1])) &&
      point[0] < ((ring[j][0] - ring[i][0]) * (point[1] - ring[i][1])) /
        (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  return polygon?.length && pointInRing(point, polygon[0]) &&
    !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(value) < 1e-10 ? 0 : value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  const [o1, o2, o3, o4] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
  return (o1 !== o2 && o3 !== o4) || (o1 === 0 && pointOnSegment(c, a, b)) ||
    (o2 === 0 && pointOnSegment(d, a, b)) || (o3 === 0 && pointOnSegment(a, c, d)) ||
    (o4 === 0 && pointOnSegment(b, c, d));
}

function lineCrossesPolygon(points, polygon) {
  if (points.some((point) => pointInPolygon(point, polygon))) return true;
  return points.slice(0, -1).some((start, index) => polygon.some((ring) =>
    ring.slice(0, -1).some((edgeStart, edgeIndex) =>
      segmentsIntersect(start, points[index + 1], edgeStart, ring[edgeIndex + 1]))));
}

function prepareFeatures(geoJson, nameReader) {
  const features = geoJson?.type === "Feature" ? [geoJson] : (geoJson.features || []);
  return features.map((feature) => ({
    feature,
    name: nameReader(feature),
    bounds: getBounds(collectGeometryPoints(feature.geometry?.coordinates))
  }));
}

function intersectingNames(road, features) {
  const points = getRoadPoints(road);
  const roadBounds = getBounds(points);
  const names = new Map();
  for (const item of features) {
    if (!item.name || !overlaps(roadBounds, item.bounds)) continue;
    const geometry = item.feature.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] :
      geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    if (polygons.some((polygon) => lineCrossesPolygon(points, polygon))) {
      names.set(normalizeName(item.name), item.name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

async function loadGeoJson(filename) {
  return JSON.parse(await readFile(path.join(sourceDir, filename), "utf8"));
}

const [country, provinces, cantons] = await Promise.all([
  loadGeoJson("ecuador.geojson"), loadGeoJson("provinces.geojson"), loadGeoJson("cantons.geojson")
]);

const provinceFeatures = prepareFeatures(provinces, getProvinceName);
const cantonFeatures = prepareFeatures(cantons, getCantonName);
const cantonProvinceFeatures = prepareFeatures(cantons, getProvinceName);
const mergeNames = (...groups) => {
  const names = new Map();
  groups.flat().filter(Boolean).forEach((name) => names.set(normalizeName(name), name));
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
};
const roadAreas = Object.fromEntries(viasTramos.map((road) => [road.id, {
  provincias: mergeNames(
    intersectingNames(road, provinceFeatures),
    intersectingNames(road, cantonProvinceFeatures)
  ),
  cantones: intersectingNames(road, cantonFeatures)
}]));

const simplifiedCountry = {
  type: "FeatureCollection",
  features: (country.type === "Feature" ? [country] : (country.features || [])).map((feature) => ({
    type: "Feature", properties: {}, geometry: simplifyGeometry(feature.geometry, 0.002)
  }))
};
const simplifiedProvinces = {
  type: "FeatureCollection",
  features: provinceFeatures.map(({ feature, name }) => ({
    type: "Feature", properties: { provincia: name }, geometry: simplifyGeometry(feature.geometry, 0.0012)
  }))
};
const simplifiedCantons = {
  type: "FeatureCollection",
  features: cantonFeatures.map(({ feature, name }) => ({
    type: "Feature",
    properties: { provincia: getProvinceName(feature), canton: name },
    geometry: simplifyGeometry(feature.geometry, 0.0008)
  }))
};

await mkdir(publicOutputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(publicOutputDir, "ecuador.geojson"), JSON.stringify(simplifiedCountry)),
  writeFile(path.join(publicOutputDir, "provinces.geojson"), JSON.stringify(simplifiedProvinces)),
  writeFile(path.join(publicOutputDir, "cantons.geojson"), JSON.stringify(simplifiedCantons)),
  writeFile(roadAreasOutput, `${JSON.stringify({ generatedAt: new Date().toISOString(), roads: roadAreas }, null, 2)}\n`)
]);

console.log(`Generadas ${Object.keys(roadAreas).length} vias administrativas.`);
