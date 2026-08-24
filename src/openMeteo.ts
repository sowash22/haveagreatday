import type { HourConditions, Units } from "./suitability.ts";

export type LocationChoice = {
  name: string;
  region: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
};

const FAHRENHEIT_WEATHER_REGIONS = new Set(["BS", "BZ", "KY", "PR", "PW", "US"]);
const FAHRENHEIT_COUNTRIES = new Set(["bahamas", "belize", "cayman islands", "palau", "puerto rico", "united states", "united states of america"]);

export function customaryUnitsForLocation(location: Pick<LocationChoice, "country" | "countryCode"> | null, locale = ""): Units {
  const countryCode = location?.countryCode?.trim().toUpperCase();
  if (countryCode) return FAHRENHEIT_WEATHER_REGIONS.has(countryCode) ? "imperial" : "metric";
  const country = location?.country.trim().toLowerCase();
  if (country) return FAHRENHEIT_COUNTRIES.has(country) ? "imperial" : "metric";
  try {
    const localeRegion = locale ? new Intl.Locale(locale).region : undefined;
    return localeRegion && FAHRENHEIT_WEATHER_REGIONS.has(localeRegion) ? "imperial" : "metric";
  } catch {
    return "metric";
  }
}

export type ForecastResult = {
  conditions: HourConditions[];
  timezone: string;
  timezoneAbbreviation: string;
  fetchedAt: string;
  warnings: string[];
};

export class ProviderError extends Error {
  constructor(public source: "location" | "weather" | "air quality", message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} was not an object.`);
  return value as JsonRecord;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} was missing.`);
  return value;
}

function timeArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item))) {
    throw new Error(`${label} timestamps were malformed.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} timestamps were duplicated.`);
  return value as string[];
}

function numberArray(value: unknown, length: number, label: string): Array<number | null> {
  if (value === undefined || value === null) return Array.from({ length }, () => null);
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} did not match the timestamp count.`);
  return value.map((item) => {
    if (item === null) return null;
    if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`${label} contained a non-number.`);
    return item;
  });
}

function assertUnit(units: JsonRecord, field: string, expected: string): void {
  if (units[field] !== expected) throw new Error(`${field} used an unexpected unit.`);
}

export function roundCoordinate(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Coordinate was not a finite number.");
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function parseForecastResponses(weatherValue: unknown, airValue: unknown | null): Omit<ForecastResult, "fetchedAt" | "warnings"> {
  const weather = record(weatherValue, "Weather response");
  const weatherHourly = record(weather.hourly, "Weather hourly data");
  const weatherUnits = record(weather.hourly_units, "Weather units");
  assertUnit(weatherUnits, "apparent_temperature", "°C");
  assertUnit(weatherUnits, "precipitation_probability", "%");
  assertUnit(weatherUnits, "wind_gusts_10m", "km/h");
  const times = timeArray(weatherHourly.time, "Weather");
  const temperature = numberArray(weatherHourly.apparent_temperature, times.length, "Apparent temperature");
  const precipitation = numberArray(weatherHourly.precipitation_probability, times.length, "Precipitation probability");
  const weatherCode = numberArray(weatherHourly.weather_code, times.length, "Weather code");
  const wind = numberArray(weatherHourly.wind_gusts_10m, times.length, "Wind gust");
  const isDayRaw = numberArray(weatherHourly.is_day, times.length, "Daylight flag");

  const airByTime = new Map<string, { aqi: number | null; uv: number | null }>();
  if (airValue !== null) {
    const air = record(airValue, "Air-quality response");
    const airHourly = record(air.hourly, "Air-quality hourly data");
    const airUnits = record(air.hourly_units, "Air-quality units");
    assertUnit(airUnits, "us_aqi", "USAQI");
    assertUnit(airUnits, "uv_index", "");
    const airTimes = timeArray(airHourly.time, "Air-quality");
    const aqi = numberArray(airHourly.us_aqi, airTimes.length, "U.S. AQI");
    const uv = numberArray(airHourly.uv_index, airTimes.length, "UV index");
    airTimes.forEach((time, index) => airByTime.set(time, { aqi: aqi[index] ?? null, uv: uv[index] ?? null }));
  }

  const conditions = times.map((time, index): HourConditions => {
    const air = airByTime.get(time);
    const daylight = isDayRaw[index];
    if (daylight !== null && daylight !== 0 && daylight !== 1) throw new Error("Daylight flag was not 0 or 1.");
    return {
      time,
      apparentTemperatureC: temperature[index] ?? null,
      precipitationProbability: precipitation[index] ?? null,
      weatherCode: weatherCode[index] ?? null,
      windGustKph: wind[index] ?? null,
      isDay: daylight === null ? null : daylight === 1,
      usAqi: air?.aqi ?? null,
      uvIndex: air?.uv ?? null,
    };
  });

  return {
    conditions,
    timezone: stringValue(weather.timezone, "Timezone"),
    timezoneAbbreviation: stringValue(weather.timezone_abbreviation, "Timezone abbreviation"),
  };
}

async function fetchJson(url: URL, source: ProviderError["source"], signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ProviderError(source, `The ${source} provider could not be reached. Check your connection and try again.`);
  }
  if (!response.ok) {
    const detail = response.status === 429 ? "The provider’s request limit was reached." : `The provider returned status ${response.status}.`;
    throw new ProviderError(source, `${detail} Try again shortly.`);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError(source, `The ${source} provider returned unreadable data. Try again.`);
  }
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationChoice[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: query, count: "5", language: "en", format: "json" }).toString();
  const data = record(await fetchJson(url, "location", signal), "Location response");
  if (data.results === undefined) return [];
  if (!Array.isArray(data.results)) throw new ProviderError("location", "The location provider returned malformed results. Try another search.");
  return data.results.flatMap((item): LocationChoice[] => {
    try {
      const result = record(item, "Location result");
      if (typeof result.latitude !== "number" || typeof result.longitude !== "number") return [];
      return [{
        name: stringValue(result.name, "Location name"),
        region: typeof result.admin1 === "string" ? result.admin1 : "",
        country: typeof result.country === "string" ? result.country : "",
        countryCode: typeof result.country_code === "string" ? result.country_code.toUpperCase() : undefined,
        latitude: roundCoordinate(result.latitude),
        longitude: roundCoordinate(result.longitude),
      }];
    } catch {
      return [];
    }
  });
}

export async function fetchForecast(latitude: number, longitude: number, signal?: AbortSignal): Promise<ForecastResult> {
  const coordinates = { latitude: String(roundCoordinate(latitude)), longitude: String(roundCoordinate(longitude)) };
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    ...coordinates,
    hourly: "apparent_temperature,precipitation_probability,weather_code,wind_gusts_10m,is_day",
    forecast_days: "7",
    timezone: "auto",
  }).toString();
  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.search = new URLSearchParams({
    ...coordinates,
    hourly: "us_aqi,uv_index",
    forecast_days: "7",
    timezone: "auto",
  }).toString();

  const [weatherResult, airResult] = await Promise.allSettled([
    fetchJson(weatherUrl, "weather", signal),
    fetchJson(airUrl, "air quality", signal),
  ]);
  if (weatherResult.status === "rejected") throw weatherResult.reason;
  const warnings: string[] = [];
  const air = airResult.status === "fulfilled" ? airResult.value : null;
  if (airResult.status === "rejected") warnings.push("Air-quality and UV data are unavailable; ratings use the remaining measurements.");
  try {
    return { ...parseForecastResponses(weatherResult.value, air), fetchedAt: new Date().toISOString(), warnings };
  } catch (error) {
    if (air !== null) {
      try {
        warnings.push("Air-quality and UV data were malformed; ratings use the remaining measurements.");
        return { ...parseForecastResponses(weatherResult.value, null), fetchedAt: new Date().toISOString(), warnings };
      } catch {
        // The weather payload is malformed too; report the required source below.
      }
    }
    throw new ProviderError("weather", `The forecast provider returned malformed data. ${error instanceof Error ? error.message : "Try again."}`);
  }
}
