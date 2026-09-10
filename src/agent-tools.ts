import { aqiCategory, uvCategory, type HourConditions } from "./suitability.ts";

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);

function maximum(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.max(...present) : null;
}

function minimum(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.min(...present) : null;
}

export function weatherEvidence(hours: HourConditions[]) {
  return {
    apparentTemperatureC: {
      low: minimum(hours.map((hour) => hour.apparentTemperatureC)),
      high: maximum(hours.map((hour) => hour.apparentTemperatureC)),
    },
    hours: hours.map(({ time, apparentTemperatureC, weatherCode, isDay }) => ({ time, apparentTemperatureC, weatherCode, isDay })),
  };
}

export function airQualityEvidence(hours: HourConditions[]) {
  const peak = maximum(hours.map((hour) => hour.usAqi));
  return {
    peak,
    category: peak === null ? "Unavailable" : aqiCategory(peak),
    hours: hours.flatMap(({ time, usAqi }) => usAqi === null ? [] : [{ time, usAqi }]),
  };
}

export function uvEvidence(hours: HourConditions[]) {
  const peak = maximum(hours.map((hour) => hour.uvIndex));
  return {
    peak,
    category: peak === null ? "Unavailable" : uvCategory(peak),
    hours: hours.flatMap(({ time, uvIndex }) => uvIndex === null ? [] : [{ time, uvIndex }]),
  };
}

export function conditionAnalysis(hours: HourConditions[]) {
  const timesFor = (matches: (hour: HourConditions) => boolean) => hours.filter(matches).map((hour) => hour.time);
  return {
    peakPrecipitationProbability: maximum(hours.map((hour) => hour.precipitationProbability)),
    peakWindGustKph: maximum(hours.map((hour) => hour.windGustKph)),
    rainHours: timesFor((hour) => (hour.weatherCode !== null && RAIN_CODES.has(hour.weatherCode)) || (hour.precipitationProbability ?? 0) >= 50),
    snowHours: timesFor((hour) => hour.weatherCode !== null && SNOW_CODES.has(hour.weatherCode)),
    stormHours: timesFor((hour) => hour.weatherCode !== null && STORM_CODES.has(hour.weatherCode)),
    strongWindHours: timesFor((hour) => (hour.windGustKph ?? 0) >= 40),
  };
}
