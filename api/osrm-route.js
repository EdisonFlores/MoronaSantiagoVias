// api/osrm-route.js
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        message: "Método no permitido"
      });
    }

    const { start, end, profile = "driving" } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        ok: false,
        message: "Faltan parámetros start o end"
      });
    }

    const startParts = String(start).split(",").map(Number);
    const endParts = String(end).split(",").map(Number);

    if (
      startParts.length !== 2 ||
      endParts.length !== 2 ||
      startParts.some(Number.isNaN) ||
      endParts.some(Number.isNaN)
    ) {
      return res.status(400).json({
        ok: false,
        message: "Formato inválido en start o end. Use lat,lng"
      });
    }

    const [startLat, startLng] = startParts;
    const [endLat, endLng] = endParts;

    const coords = `${startLng},${startLat};${endLng},${endLat}`;

    const url =
      `https://router.project-osrm.org/route/v1/${profile}/${coords}` +
      `?overview=full&geometries=geojson&steps=false`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "moronasantiagovias/1.0"
      }
    });

    const data = await response.json();

    if (!response.ok || data.code !== "Ok" || !data.routes?.length) {
      return res.status(502).json({
        ok: false,
        message: "OSRM no encontró ruta",
        osrm: data
      });
    }

    const routeCoords = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);

    return res.status(200).json({
      ok: true,
      route: {
        profile,
        coordinates: routeCoords
      }
    });
  } catch (error) {
    console.error("Error en /api/osrm-route:", error);

    return res.status(500).json({
      ok: false,
      message: "No se pudo obtener la ruta"
    });
  }
}