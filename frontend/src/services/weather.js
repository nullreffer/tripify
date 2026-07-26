const WEATHER_CODE_MAP = {
  0: { label: 'Clear', emoji: '☀️' },
  1: { label: 'Mostly clear', emoji: '🌤️' },
  2: { label: 'Partly cloudy', emoji: '⛅' },
  3: { label: 'Cloudy', emoji: '☁️' },
  45: { label: 'Fog', emoji: '🌫️' },
  48: { label: 'Fog', emoji: '🌫️' },
  51: { label: 'Light drizzle', emoji: '🌦️' },
  53: { label: 'Drizzle', emoji: '🌦️' },
  55: { label: 'Heavy drizzle', emoji: '🌧️' },
  61: { label: 'Light rain', emoji: '🌧️' },
  63: { label: 'Rain', emoji: '🌧️' },
  65: { label: 'Heavy rain', emoji: '🌧️' },
  66: { label: 'Freezing rain', emoji: '🌨️' },
  67: { label: 'Freezing rain', emoji: '🌨️' },
  71: { label: 'Light snow', emoji: '🌨️' },
  73: { label: 'Snow', emoji: '🌨️' },
  75: { label: 'Heavy snow', emoji: '❄️' },
  77: { label: 'Snow grains', emoji: '❄️' },
  80: { label: 'Rain showers', emoji: '🌦️' },
  81: { label: 'Rain showers', emoji: '🌧️' },
  82: { label: 'Heavy rain showers', emoji: '⛈️' },
  85: { label: 'Snow showers', emoji: '🌨️' },
  86: { label: 'Heavy snow showers', emoji: '❄️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
  96: { label: 'Thunderstorm with hail', emoji: '⛈️' },
  99: { label: 'Thunderstorm with hail', emoji: '⛈️' },
};

function getWeatherMeta(code) {
  return WEATHER_CODE_MAP[code] || { label: 'Unknown', emoji: '🌡️' };
}

function toDateKey(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function getWeather(lat, lng) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('Weather unavailable');
  return res.json();
}

export function buildCurrentWeather(data) {
  const current = data?.current;
  if (!current) return null;
  const meta = getWeatherMeta(current.weather_code);
  return {
    code: current.weather_code,
    label: meta.label,
    emoji: meta.emoji,
    temperature: current.temperature_2m,
    windSpeed: current.wind_speed_10m,
  };
}

export function buildScheduledDayWeather(data, targetDate) {
  const dayKey = toDateKey(targetDate);
  const daily = data?.daily;
  if (!dayKey || !daily?.time?.length) return null;
  const idx = daily.time.findIndex(d => d === dayKey);
  if (idx < 0) return null;
  const code = daily.weather_code?.[idx];
  const meta = getWeatherMeta(code);
  return {
    date: dayKey,
    code,
    label: meta.label,
    emoji: meta.emoji,
    maxTemp: daily.temperature_2m_max?.[idx],
    minTemp: daily.temperature_2m_min?.[idx],
  };
}
