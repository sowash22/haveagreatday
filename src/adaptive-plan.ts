import { type ConversationPeriodId, type SuggestionMode } from "./conversation";
import { rateHour, type HourConditions, type Profile } from "./suitability";

export type AdaptivePeriod = {
  id: ConversationPeriodId;
  score: number | null;
  hours: HourConditions[];
};

export type AdaptiveDecision = {
  allowedModes: SuggestionMode[];
  defaultMode: SuggestionMode;
  defaultWindowCount: number;
  candidateIds: ConversationPeriodId[];
  favorableHourShare: number;
  blockedHourShare: number;
};

const HEAVY_WEATHER_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);
const RAIN_CODES = new Set([61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function isOutdoorBlockingHour(hour: HourConditions): boolean {
  const code = hour.weatherCode;
  const precipitation = hour.precipitationProbability;
  const gust = hour.windGustKph;
  if (code !== null && HEAVY_WEATHER_CODES.has(code)) return true;
  if (code !== null && RAIN_CODES.has(code) && precipitation !== null && precipitation >= 60) return true;
  if (code !== null && SNOW_CODES.has(code) && ((precipitation !== null && precipitation >= 50) || (gust !== null && gust >= 40))) return true;
  if (precipitation !== null && precipitation >= 80) return true;
  if (gust !== null && gust >= 55) return true;
  if (hour.usAqi !== null && hour.usAqi >= 151) return true;
  if (hour.uvIndex !== null && hour.uvIndex >= 11) return true;
  if (hour.apparentTemperatureC !== null && (hour.apparentTemperatureC < -5 || hour.apparentTemperatureC >= 36)) return true;
  return false;
}

export function assessAdaptiveDay(hours: HourConditions[], rankedPeriods: AdaptivePeriod[], profile: Profile): AdaptiveDecision {
  const ratings = hours.map((hour) => rateHour(hour, profile));
  const blockedCount = hours.filter(isOutdoorBlockingHour).length;
  const favorableCount = hours.filter((hour, index) => !isOutdoorBlockingHour(hour) && (ratings[index]?.score ?? 100) < 25).length;
  const usableCount = hours.filter((hour, index) => !isOutdoorBlockingHour(hour) && (ratings[index]?.score ?? 100) < 50).length;
  const completeEnoughCount = ratings.filter((rating) => rating.missing.length <= 1).length;
  const blockedHourShare = hours.length ? blockedCount / hours.length : 1;
  const favorableHourShare = hours.length ? favorableCount / hours.length : 0;
  const usableHourShare = hours.length ? usableCount / hours.length : 0;
  const completeEnoughShare = hours.length ? completeEnoughCount / hours.length : 0;

  const candidates = rankedPeriods.filter((period) =>
    period.score !== null
    && period.score < 50
    && period.hours.length > 0
    && period.hours.every((hour) => !isOutdoorBlockingHour(hour)),
  ).slice(0, 3);

  const poorDay = hours.length === 0
    || candidates.length === 0
    || (hours.length >= 4 && blockedHourShare >= 0.6)
    || (hours.length >= 4 && usableHourShare < 0.25);
  const allDay = !poorDay
    && hours.length >= 6
    && blockedHourShare === 0
    && favorableHourShare >= 0.75
    && usableHourShare >= 0.9
    && completeEnoughShare >= 0.75;

  if (poorDay) {
    return {
      allowedModes: ["none"],
      defaultMode: "none",
      defaultWindowCount: 0,
      candidateIds: [],
      favorableHourShare: Math.round(favorableHourShare * 100),
      blockedHourShare: Math.round(blockedHourShare * 100),
    };
  }

  const bestScore = candidates[0]?.score ?? 100;
  const defaultWindowCount = Math.max(1, candidates.filter((period) => (period.score ?? 100) <= Math.min(42, bestScore + 14)).length);
  const averageScore = ratings.length ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length : 100;
  const allowedModes: SuggestionMode[] = [
    ...(allDay ? ["all_day" as const] : []),
    "windows",
    ...(blockedHourShare >= 0.35 || averageScore >= 40 ? ["none" as const] : []),
  ];

  return {
    allowedModes,
    defaultMode: allDay ? "all_day" : "windows",
    defaultWindowCount: allDay ? 0 : defaultWindowCount,
    candidateIds: candidates.map((period) => period.id),
    favorableHourShare: Math.round(favorableHourShare * 100),
    blockedHourShare: Math.round(blockedHourShare * 100),
  };
}
