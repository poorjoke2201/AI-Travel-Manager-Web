const axios = require('axios');
const logger = require('../../utils/logger');

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY_VARIABLES = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'weather_code',
  'wind_speed_10m_max',
  'uv_index_max',
].join(',');

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dateDifferenceInDays(left, right) {
  return Math.round((new Date(left) - new Date(right)) / 86400000);
}

function weatherSource(startDate, endDate) {
  const today = new Date().toISOString().slice(0, 10);
  const startOffset = dateDifferenceInDays(startDate, today);
  const endOffset = dateDifferenceInDays(endDate, today);

  if (endOffset < 0 && startOffset >= -90) return ARCHIVE_URL;
  if (startOffset <= 16 && endOffset >= -92) return FORECAST_URL;
  return null;
}

function weatherCodeLabel(code) {
  if (code == null) return 'variable conditions';
  if (code === 0) return 'clear skies';
  if ([1, 2, 3].includes(code)) return 'partly cloudy to overcast skies';
  if ([45, 48].includes(code)) return 'mist or fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain or showers';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorms';
  return 'mixed conditions';
}

function summarizeWeather(data, startDate, endDate) {
  const daily = data?.daily;
  if (!daily?.time?.length) return null;

  const days = daily.time.map((date, index) => ({
    date,
    maxC: daily.temperature_2m_max?.[index] ?? null,
    minC: daily.temperature_2m_min?.[index] ?? null,
    rainChance: daily.precipitation_probability_max?.[index] ?? null,
    weather: weatherCodeLabel(daily.weather_code?.[index]),
    windKmh: daily.wind_speed_10m_max?.[index] ?? null,
    uv: daily.uv_index_max?.[index] ?? null,
  }));
  const maxTemps = days.map((day) => day.maxC).filter(Number.isFinite);
  const minTemps = days.map((day) => day.minC).filter(Number.isFinite);
  const rainChances = days.map((day) => day.rainChance).filter(Number.isFinite);
  const uvValues = days.map((day) => day.uv).filter(Number.isFinite);
  const conditions = [...new Set(days.map((day) => day.weather))];

  return {
    source: 'Open-Meteo',
    latitude: data.latitude,
    longitude: data.longitude,
    startDate,
    endDate,
    days,
    summary: [
      `Open-Meteo weather for ${startDate} to ${endDate}:`,
      maxTemps.length ? `highs ${Math.round(Math.min(...maxTemps))}-${Math.round(Math.max(...maxTemps))} C` : null,
      minTemps.length ? `lows ${Math.round(Math.min(...minTemps))}-${Math.round(Math.max(...minTemps))} C` : null,
      conditions.length ? `conditions include ${conditions.join(', ')}` : null,
      rainChances.length ? `maximum rain probability ${Math.round(Math.max(...rainChances))}%` : null,
      uvValues.length ? `maximum UV index ${Math.round(Math.max(...uvValues))}` : null,
    ].filter(Boolean).join('; '),
  };
}

async function getWeatherForecast({ latitude, longitude, startDate, endDate }) {
  const start = isoDate(startDate);
  const end = isoDate(endDate);
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) || !start || !end) return null;

  const url = weatherSource(start, end);
  if (!url) return null;

  try {
    const response = await axios.get(url, {
      params: {
        latitude,
        longitude,
        start_date: start,
        end_date: end,
        daily: DAILY_VARIABLES,
        timezone: 'auto',
      },
      timeout: 8000,
    });
    return summarizeWeather(response.data, start, end);
  } catch (error) {
    logger.warn('Open-Meteo weather request failed', error.message);
    return null;
  }
}

module.exports = { getWeatherForecast, summarizeWeather, weatherCodeLabel };