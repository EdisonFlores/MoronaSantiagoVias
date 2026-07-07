// Proxy ligero hacia OSRM para evitar exponer logica de rutas dentro del frontend.
// Valida parametros, consulta OSRM y devuelve coordenadas en formato Leaflet.
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        message: "Metodo no permitido"
      });
    }

    const { start, end, points, profile = "driving" } = req.query;

    if ((!start || !end) && !points) {
      return res.status(400).json({
        ok: false,
        message: "Faltan parametros start/end o points"
      });
    }

    const parsedPoints = points
      ? String(points)
          .split(";")
          .map((point) => point.split(",").map(Number))
      : [
          String(start).split(",").map(Number),
          String(end).split(",").map(Number)
        ];

    if (
      parsedPoints.length < 2 ||
      parsedPoints.some((point) => point.length !== 2 || point.some(Number.isNaN))
    ) {
      return res.status(400).json({
        ok: false,
        message: "Formato invalido. Use lat,lng separados por punto y coma"
      });
    }

    // OSRM espera longitud,latitud aunque la app trabaja internamente con lat,lng.
    const coords = parsedPoints
      .map(([lat, lng]) => `${lng},${lat}`)
      .join(";");

    const url =
      `https://router.project-osrm.org/route/v1/${profile}/${coords}` +
      `?overview=full&geometries=geojson&steps=false`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "ecuavial/1.0"
      }
    });

    const data = await response.json();

    if (!response.ok || data.code !== "Ok" || !data.routes?.length) {
      return res.status(502).json({
        ok: false,
        message: "OSRM no encontro ruta",
        osrm: data
      });
    }

    // Se regresa a formato Leaflet [lat, lng] para dibujar sin conversion adicional.
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
