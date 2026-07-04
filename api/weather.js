// Proxy del clima para que el navegador no dependa de consultar proveedores directamente.
const WEATHER_TIMEOUT_MS = 8000;
const WEATHER_CACHE_MS = 10 * 60 * 1000;
const weatherCache = new Map();

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseCoordinate(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }

  return number;
}

function normalizeOpenMeteoData(data) {
  if (data?.current) return data;
  if (!data?.current_weather) return data;

  return {
    ...data,
    current: {
      temperature_2m: data.current_weather.temperature,
      weather_code: data.current_weather.weathercode,
      is_day: data.current_weather.is_day,
      wind_speed_10m: data.current_weather.windspeed
    },
    daily: data.daily || {
      temperature_2m_max: [data.current_weather.temperature],
      temperature_2m_min: [data.current_weather.temperature]
    }
  };
}

function getWeatherCodeFromMetSymbol(symbolCode = "") {
  const symbol = String(symbolCode).toLowerCase();

  if (symbol.includes("thunder")) return 95;
  if (symbol.includes("heavyrain") || symbol.includes("rainshowers")) return 80;
  if (symbol.includes("rain") || symbol.includes("sleet")) return 61;
  if (symbol.includes("snow")) return 71;
  if (symbol.includes("fog")) return 45;
  if (symbol.includes("cloudy")) return 3;
  if (symbol.includes("partlycloudy") || symbol.includes("fair")) return 2;
  if (symbol.includes("clearsky")) return 0;

  return 3;
}

function normalizeMetData(data) {
  const timeseries = data?.properties?.timeseries;

  if (!Array.isArray(timeseries) || !timeseries.length) {
    return null;
  }

  const now = timeseries[0];
  const instant = now?.data?.instant?.details || {};
  const nextHour = now?.data?.next_1_hours || now?.data?.next_6_hours || {};
  const symbolCode = nextHour?.summary?.symbol_code || "";
  const firstDay = timeseries.slice(0, 24);
  const temperatures = firstDay
    .map((item) => item?.data?.instant?.details?.air_temperature)
    .filter(Number.isFinite);
  const currentDate = new Date(now.time);
  const currentHour = currentDate.getUTCHours();

  return {
    provider: "met-no",
    current: {
      temperature_2m: instant.air_temperature,
      weather_code: getWeatherCodeFromMetSymbol(symbolCode),
      is_day: symbolCode.includes("_night") || currentHour < 11 || currentHour > 23 ? 0 : 1,
      wind_speed_10m: instant.wind_speed
    },
    daily: {
      temperature_2m_max: [temperatures.length ? Math.max(...temperatures) : instant.air_temperature],
      temperature_2m_min: [temperatures.length ? Math.min(...temperatures) : instant.air_temperature]
    }
  };
}

function getCacheKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function getCachedWeather(lat, lon) {
  const cached = weatherCache.get(getCacheKey(lat, lon));

  if (!cached || Date.now() - cached.savedAt > WEATHER_CACHE_MS) {
    return null;
  }

  return cached.weather;
}

function setCachedWeather(lat, lon, weather) {
  weatherCache.set(getCacheKey(lat, lon), {
    savedAt: Date.now(),
    weather
  });
}

async function fetchJsonWithTimeout(url, provider, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "User-Agent": "MoronaSantiagoVial/1.0 https://morona-santiago-vias.vercel.app",
        ...headers
      },
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`${provider} respondio ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenMeteoWeather(lat, lon) {
  const base = "https://api.open-meteo.com/v1/forecast";
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto"
  });
  const urls = [
    `${base}?${params.toString()}&current=temperature_2m,weather_code,is_day,wind_speed_10m`,
    `${base}?${params.toString()}&current_weather=true`
  ];
  let lastError = null;

  for (const url of urls) {
    try {
      const weather = normalizeOpenMeteoData(await fetchJsonWithTimeout(url, "Open-Meteo"));

      if (weather?.current) {
        return {
          ...weather,
          provider: "open-meteo"
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Open-Meteo no devolvio clima");
}

async function fetchMetNorwayWeather(lat, lon) {
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lon.toFixed(4));

  const data = await fetchJsonWithTimeout(url.toString(), "MET Norway");
  const weather = normalizeMetData(data);

  if (!weather?.current) {
    throw new Error("MET Norway no devolvio clima");
  }

  return weather;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "Metodo no permitido"
    });
  }

  const lat = parseCoordinate(req.query.lat, -90, 90);
  const lon = parseCoordinate(req.query.lon, -180, 180);

  if (lat === null || lon === null) {
    return res.status(400).json({
      ok: false,
      message: "Coordenadas invalidas"
    });
  }

  const cachedWeather = getCachedWeather(lat, lon);

  if (cachedWeather) {
    return res.status(200).json({
      ok: true,
      cached: true,
      weather: cachedWeather
    });
  }

  const providers = [fetchOpenMeteoWeather, fetchMetNorwayWeather];
  const errors = [];

  for (const fetchProvider of providers) {
    try {
      const weather = await fetchProvider(lat, lon);
      setCachedWeather(lat, lon, weather);

      return res.status(200).json({
        ok: true,
        cached: false,
        provider: weather.provider,
        weather
      });
    } catch (error) {
      errors.push(error.message);
    }
  }

  console.error("No se pudo consultar clima:", errors);

  return res.status(503).json({
    ok: false,
    message: "No se pudo consultar el clima"
  });
}
