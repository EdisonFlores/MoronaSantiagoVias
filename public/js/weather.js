let weatherAbortController = null;
let weatherTimer = null;
let weatherBound = false;

function getWeatherIcon(weatherCode = 0, isDay = 1) {
  const day = Number(isDay) === 1;

  if ([0].includes(weatherCode)) return day ? "☀️" : "🌙";
  if ([1, 2].includes(weatherCode)) return day ? "🌤️" : "☁️";
  if ([3].includes(weatherCode)) return "☁️";
  if ([45, 48].includes(weatherCode)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "❄️";
  if ([95, 96, 99].includes(weatherCode)) return "⛈️";

  return "🌡️";
}

function formatLocationLabel(lat, lon) {
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

async function fetchOpenMeteoWeather(lat, lon, signal) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,weather_code,is_day,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&timezone=auto`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error("No se pudo consultar Open-Meteo");
  }

  return response.json();
}

function renderWeatherBadge(data, lat, lon) {
  const textEl = document.getElementById("weatherText");
  if (!textEl || !data?.current) return;

  const temp = Math.round(data.current.temperature_2m);
  const icon = getWeatherIcon(data.current.weather_code, data.current.is_day);

  textEl.textContent = `${icon} ${temp}°C`;
  textEl.title = formatLocationLabel(lat, lon);
}

function renderWeatherModal(data, lat, lon, lang = "es") {
  const box = document.getElementById("weatherModalBody");
  if (!box || !data?.current || !data?.daily) return;

  const t = {
    es: {
      title: "Clima del punto actual del mapa",
      location: "Ubicación",
      temp: "Temperatura",
      wind: "Viento",
      max: "Máxima",
      min: "Mínima"
    },
    en: {
      title: "Weather at the current map center",
      location: "Location",
      temp: "Temperature",
      wind: "Wind",
      max: "High",
      min: "Low"
    }
  }[lang];

  box.innerHTML = `
    <div class="weather-card">
      <h3>${t.title}</h3>
      <p><strong>${t.location}:</strong> ${formatLocationLabel(lat, lon)}</p>
      <p><strong>${t.temp}:</strong> ${Math.round(data.current.temperature_2m)}°C</p>
      <p><strong>${t.wind}:</strong> ${Math.round(data.current.wind_speed_10m)} km/h</p>
      <p><strong>${t.max}:</strong> ${Math.round(data.daily.temperature_2m_max[0])}°C</p>
      <p><strong>${t.min}:</strong> ${Math.round(data.daily.temperature_2m_min[0])}°C</p>
    </div>
  `;
}

export function initWeather() {
  const modal = document.getElementById("weatherModal");
  const closeBtn = document.getElementById("weatherModalClose");
  const badge = document.getElementById("weatherBadge");

  badge?.addEventListener("click", () => modal?.classList.add("show"));
  closeBtn?.addEventListener("click", () => modal?.classList.remove("show"));
}

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
    textEl.textContent = lang === "en" ? "Loading..." : "Cargando...";
  }

  try {
    const data = await fetchOpenMeteoWeather(lat, lon, weatherAbortController.signal);
    renderWeatherBadge(data, lat, lon);
    renderWeatherModal(data, lat, lon, lang);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Error Open-Meteo:", error);

    if (textEl) {
      textEl.textContent = lang === "en" ? "Weather error" : "Error clima";
    }
  }
}

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