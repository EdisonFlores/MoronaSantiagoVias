// Consulta el proxy de clima segun el centro actual del mapa y actualiza badge/modal.
let weatherAbortController = null;
let weatherTimer = null;
let weatherBound = false;
let lastWeatherData = null;
let lastWeatherPoint = null;

const WEATHER_TIMEOUT_MS = 7000;

// Mapea codigos Open-Meteo a iconos compactos para el chip superior.
function getWeatherIcon(weatherCode = 0, isDay = 1) {
  const code = Number(weatherCode);
  const day = Number(isDay) === 1;

  if (code === 0) return day ? "Soleado" : "Noche";
  if ([1, 2].includes(code)) return "Parcial";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "Llovizna";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Lluvia";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Frio";
  if ([95, 96, 99].includes(code)) return "Tormenta";

  return "Clima";
}

// Formatea latitud/longitud para titulos y modal de clima.
function formatLocationLabel(lat, lon) {
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

// Evita que un proveedor de clima deje la interfaz esperando indefinidamente.
function createTimeoutSignal(parentSignal, timeoutMs = WEATHER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", abort, { once: true });
  }

  controller.signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abort);
  }, { once: true });

  return controller.signal;
}

// Normaliza la respuesta antigua current_weather para usar el mismo renderizado.
function normalizeWeatherData(data) {
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

// En desarrollo puede usar la API publicada para evitar bloqueos locales del navegador.
function getWeatherProxyUrls(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon)
  });
  const localHosts = ["localhost", "127.0.0.1"];
  const urls = [`/api/weather?${params.toString()}`];

  if (localHosts.includes(window.location.hostname)) {
    urls.push(`https://morona-santiago-vias.vercel.app/api/weather?${params.toString()}`);
  }

  return urls;
}

// Primero consulta el proxy backend; si falla, intenta Open-Meteo directo como respaldo.
async function fetchOpenMeteoWeather(lat, lon, signal) {
  const base = "https://api.open-meteo.com/v1/forecast";
  const params = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`;
  const daily = "daily=temperature_2m_max,temperature_2m_min&timezone=auto";
  const urls = [
    ...getWeatherProxyUrls(lat, lon),
    `${base}?${params}&current=temperature_2m,weather_code,is_day,wind_speed_10m&${daily}`,
    `${base}?${params}&current_weather=true&${daily}`
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: createTimeoutSignal(signal)
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message || `Open-Meteo respondio ${response.status}`);
      }

      return normalizeWeatherData(payload.weather || payload);
    } catch (error) {
      if (signal?.aborted || error.name === "AbortError") throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("No se pudo consultar el clima");
}

// Actualiza el chip superior con icono y temperatura actual.
function renderWeatherBadge(data, lat, lon) {
  const textEl = document.getElementById("weatherText");
  if (!textEl || !data?.current) return;

  const temp = Math.round(data.current.temperature_2m);
  const icon = getWeatherIcon(data.current.weather_code, data.current.is_day);

  textEl.textContent = `${icon} ${temp} C`;
  textEl.title = formatLocationLabel(lat, lon);
}

// Muestra un estado entendible cuando no hay clima disponible.
function renderWeatherUnavailable(lang = "es") {
  const textEl = document.getElementById("weatherText");
  const box = document.getElementById("weatherModalBody");
  const labels = {
    es: {
      badge: "Clima no disponible",
      title: "Clima no disponible",
      text: "No se pudo consultar el clima en este momento. Revisa tu conexion e intenta nuevamente."
    },
    en: {
      badge: "Weather unavailable",
      title: "Weather unavailable",
      text: "Weather could not be loaded right now. Check your connection and try again."
    },
    sh: {
      badge: "Nayaimpin atsawai",
      title: "Nayaimpin atsawai",
      text: "Yamai nayaimpin jukimaitsui. Internet iista nuya ataksha takasta."
    }
  };
  const t = labels[lang] || labels.es;

  if (textEl) {
    textEl.textContent = t.badge;
    textEl.title = t.text;
  }

  if (box) {
    box.innerHTML = `
      <div class="weather-card">
        <h3>${t.title}</h3>
        <p>${t.text}</p>
      </div>
    `;
  }
}

// El modal usa etiquetas locales para no depender del diccionario general.
function renderWeatherModal(data, lat, lon, lang = "es") {
  const box = document.getElementById("weatherModalBody");
  if (!box || !data?.current || !data?.daily) return;

  const labels = {
    es: {
      title: "Clima del punto actual del mapa",
      location: "Ubicacion",
      temp: "Temperatura",
      wind: "Viento",
      max: "Maxima",
      min: "Minima"
    },
    en: {
      title: "Weather at the current map center",
      location: "Location",
      temp: "Temperature",
      wind: "Wind",
      max: "High",
      min: "Low"
    },
    sh: {
      title: "Mapanam pujamunam nayaimpin",
      location: "Pujamuri",
      temp: "Tsueri",
      wind: "Tampu",
      max: "Nunka tsueri",
      min: "Nunka yumiri"
    }
  };
  const t = labels[lang] || labels.es;

  box.innerHTML = `
    <div class="weather-card">
      <h3>${t.title}</h3>
      <p><strong>${t.location}:</strong> ${formatLocationLabel(lat, lon)}</p>
      <p><strong>${t.temp}:</strong> ${Math.round(data.current.temperature_2m)} C</p>
      <p><strong>${t.wind}:</strong> ${Math.round(data.current.wind_speed_10m)} km/h</p>
      <p><strong>${t.max}:</strong> ${Math.round(data.daily.temperature_2m_max[0])} C</p>
      <p><strong>${t.min}:</strong> ${Math.round(data.daily.temperature_2m_min[0])} C</p>
    </div>
  `;
}

// Conecta apertura y cierre del modal de clima.
export function initWeather() {
  const modal = document.getElementById("weatherModal");
  const closeBtn = document.getElementById("weatherModalClose");
  const badge = document.getElementById("weatherBadge");

  const closeWeatherModal = () => {
    if (modal?.contains(document.activeElement)) {
      document.activeElement.blur();
      badge?.focus({ preventScroll: true });
    }

    modal?.classList.remove("show");
    modal?.setAttribute("aria-hidden", "true");
  };

  badge?.addEventListener("click", () => {
    if (!lastWeatherData) renderWeatherUnavailable(document.documentElement.lang || "es");
    modal?.classList.add("show");
    modal?.setAttribute("aria-hidden", "false");
    closeBtn?.focus({ preventScroll: true });
  });

  closeBtn?.addEventListener("click", closeWeatherModal);
}

// Cancela la peticion anterior cuando el usuario mueve el mapa rapidamente.
export async function updateWeatherFromMapCenter(map, lang = "es") {
  if (!map) return;

  const center = map.getCenter();
  const lat = center.lat;
  const lon = center.lng;

  if (weatherAbortController) {
    weatherAbortController.abort();
  }

  weatherAbortController = new AbortController();

  const textEl = document.getElementById("weatherText");
  if (textEl) {
    textEl.textContent = lang === "en"
      ? "Loading..."
      : lang === "sh"
        ? "Jukimui..."
        : "Cargando...";
  }

  try {
    const data = await fetchOpenMeteoWeather(lat, lon, weatherAbortController.signal);
    lastWeatherData = data;
    lastWeatherPoint = { lat, lon };
    renderWeatherBadge(data, lat, lon);
    renderWeatherModal(data, lat, lon, lang);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Error de clima:", error);

    if (lastWeatherData && lastWeatherPoint) {
      renderWeatherBadge(lastWeatherData, lastWeatherPoint.lat, lastWeatherPoint.lon);
      renderWeatherModal(lastWeatherData, lastWeatherPoint.lat, lastWeatherPoint.lon, lang);
      return;
    }

    renderWeatherUnavailable(lang);
  }
}

// Debounce del evento moveend para evitar consultar clima en cada pequeno ajuste.
export function bindWeatherToMap(map, getLang) {
  if (!map || weatherBound) return;
  weatherBound = true;

  const run = () => updateWeatherFromMapCenter(map, getLang?.() || "es");

  run();

  map.on("moveend", () => {
    clearTimeout(weatherTimer);
    weatherTimer = setTimeout(run, 450);
  });
}
