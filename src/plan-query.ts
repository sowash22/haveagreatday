import type { Profile, TimePreference, Units } from "./suitability.ts";

export const ACTIVITIES = {
  walk: { label: "Walk", phrase: "walk", profile: "general" },
  run: { label: "Run", phrase: "run", profile: "strenuous" },
  cycle: { label: "Cycle", phrase: "ride", profile: "strenuous" },
  family: { label: "Park with kids", phrase: "park visit", profile: "temperature" },
  dog: { label: "Dog walk", phrase: "dog walk", profile: "temperature" },
} as const satisfies Record<string, { label: string; phrase: string; profile: Profile }>;

export const TIME_OPTIONS: Record<TimePreference, string> = {
  any: "Any daylight",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export type Activity = keyof typeof ACTIVITIES;
export type SceneKey = Activity | "cloudy" | "rain" | "snow";

export function calendarWeekDates(date: string, weekOffset = 0): string[] {
  const current = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(current.getTime()) || !Number.isInteger(weekOffset)) return [];
  const daysSinceMonday = (current.getUTCDay() + 6) % 7;
  const monday = current.getTime() - daysSinceMonday * 86_400_000 + weekOffset * 7 * 86_400_000;
  return Array.from({ length: 7 }, (_, index) => new Date(monday + index * 86_400_000).toISOString().slice(0, 10));
}

export function weatherScene(activity: Activity, code: number | null): SceneKey {
  if (code !== null && ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))) return "snow";
  if (code !== null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95)) return "rain";
  if (code !== null && code >= 45 && code <= 48) return "cloudy";
  return activity;
}

export type PlanQuery = {
  latitude: number;
  longitude: number;
  activity: Activity;
  time: TimePreference;
  units: Units;
  date: string | null;
  place: string;
};

export class PlanQueryError extends Error {}

export function parsePlanQuery(params: URLSearchParams): PlanQuery {
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!params.has("lat") || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new PlanQueryError("lat must be a number from -90 to 90.");
  if (!params.has("lon") || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new PlanQueryError("lon must be a number from -180 to 180.");

  const activity = params.get("activity") ?? "walk";
  if (!Object.hasOwn(ACTIVITIES, activity)) throw new PlanQueryError(`activity must be one of: ${Object.keys(ACTIVITIES).join(", ")}.`);
  const time = params.get("time") ?? "any";
  if (!Object.hasOwn(TIME_OPTIONS, time)) throw new PlanQueryError(`time must be one of: ${Object.keys(TIME_OPTIONS).join(", ")}.`);
  const units = params.get("units") ?? "metric";
  if (units !== "metric" && units !== "imperial") throw new PlanQueryError("units must be metric or imperial.");

  const date = params.get("date");
  const parsedDate = date ? new Date(`${date}T00:00:00Z`) : null;
  if (date && (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date)) throw new PlanQueryError("date must use YYYY-MM-DD.");
  const place = (params.get("place") ?? "Approximate location").trim().slice(0, 120) || "Approximate location";

  return { latitude, longitude, activity: activity as Activity, time: time as TimePreference, units, date, place };
}
