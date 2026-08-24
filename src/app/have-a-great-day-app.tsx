"use client";

import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assessAdaptiveDay } from "../adaptive-plan";
import { describeConversationDay, describeConversationWindow, fallbackConversationVoice, parseConversationVoice, type ConversationDaySummary, type ConversationInput, type ConversationVoice } from "../conversation";
import { customaryUnitsForLocation, fetchForecast, ProviderError, roundCoordinate, searchLocations, type ForecastResult, type LocationChoice } from "../openMeteo";
import { ACTIVITIES, TIME_OPTIONS, weatherScene, type Activity, type SceneKey } from "../plan-query";
import { PROFILE_WEIGHTS, rateHour, recommend, recommendDays, type ComponentName, type DayPlan, type HourConditions, type HourRating, type Profile, type Recommendation, type TimePreference, type Units } from "../suitability";

const ACTIVITY_KEY = "haveagreatday-activity:v1";
const PROFILE_KEY = "haveagreatday-profile";
const UNITS_KEY = "haveagreatday-units";
const UNITS_OVERRIDE_KEY = "haveagreatday-units-override:v1";
const LOCATION_KEY = "haveagreatday-location";
const LOCATION_HISTORY_KEY = "haveagreatday-locations:v1";
const SCENE_ROTATION_KEY = "haveagreatday-scene:v1";

function migrateStorage(): void {
  const keys = [
    ["safeday-activity:v1", ACTIVITY_KEY],
    ["safeday-profile", PROFILE_KEY],
    ["safeday-units", UNITS_KEY],
    ["safeday-location", LOCATION_KEY],
    ["safeday-locations:v1", LOCATION_HISTORY_KEY],
  ] as const;
  try {
    for (const [legacy, current] of keys) {
      const value = localStorage.getItem(legacy);
      if (value !== null && localStorage.getItem(current) === null) localStorage.setItem(current, value);
      localStorage.removeItem(legacy);
    }
  } catch { /* Existing settings remain available when storage access is allowed. */ }
}

type Status =
  | { kind: "idle" | "loading" | "ready" }
  | { kind: "error"; title: string; message: string; retry: boolean };

type Scene = { src: string; photographer: string; href: string; position?: string };

const UNSPLASH_VIEW_ID = "M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA==";

function unsplashScene(imageId: string, photographer: string, photoId: string, position?: string): Scene {
  const url = new URL(`https://images.unsplash.com/${imageId}`);
  url.search = new URLSearchParams({ auto: "format", fit: "crop", fm: "jpg", ixid: UNSPLASH_VIEW_ID, ixlib: "rb-4.1.0", q: "75", w: "2400" }).toString();
  return { src: url.toString(), photographer, href: `https://unsplash.com/photos/${photoId}`, position };
}

function isUnsplashScene(src: string): boolean {
  return src.startsWith("https://images.unsplash.com/");
}

function unsplashImageUrl(src: string, width: number, quality = 75): string {
  const url = new URL(src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality));
  return url.toString();
}

function unsplashImageLoader({ src, width, quality }: ImageLoaderProps): string {
  return unsplashImageUrl(src, width, quality ?? 75);
}

const BASE_SCENES: Record<SceneKey, Scene> = {
  walk: { src: "/scene-walk.jpg", photographer: "Annie Spratt", href: "https://unsplash.com/photos/MkQmva8z5oI" },
  run: { src: "/scene-run.jpg", photographer: "Phil Aicken", href: "https://unsplash.com/photos/JsSw0qpikmQ" },
  cycle: { src: "/scene-cycle.jpg", photographer: "Eliézer Fernandes", href: "https://unsplash.com/photos/DT4cnNNpINs" },
  family: { src: "/scene-family.jpg", photographer: "Arlind Photography", href: "https://unsplash.com/photos/kcDTK3T8VcQ" },
  dog: { src: "/scene-dog.jpg", photographer: "Daniel Legt", href: "https://unsplash.com/photos/cmHtKzmmPoI" },
  cloudy: { src: "/scene-cloudy.jpg", photographer: "Gennady Zakharin", href: "https://unsplash.com/photos/bG0p4aJCQ78" },
  rain: { src: "/scene-rain.jpg", photographer: "Yan F", href: "https://unsplash.com/photos/AJeAR_FMgww" },
  snow: { src: "/scene-snow.jpg", photographer: "Ben Kupke", href: "https://unsplash.com/photos/Hl7D_ZOo4jk" },
};

const CLEAR_SUNPATH: Scene = { src: "/scene-clear-sunpath.jpg", photographer: "Tunahan Kuzgun", href: "https://unsplash.com/photos/u2bL7sIdA1E", position: "center 56%" };
const CLEAR_DOGWALK: Scene = { src: "/scene-clear-dogwalk.jpg", photographer: "Brooke Balentine", href: "https://unsplash.com/photos/3mu-RJ7-TXc", position: "center 58%" };
const CLEAR_SCENES: readonly Scene[] = [
  CLEAR_SUNPATH,
  CLEAR_DOGWALK,
  unsplashScene("photo-1782005863367-694fd380d705", "Bhargav Panchal", "qSnrNfcDPQ8", "center 52%"),
  unsplashScene("photo-1771767435868-e3141980fcb1", "Sang Kwak", "hdhG-bof6e0", "center 55%"),
  unsplashScene("photo-1780540771752-b4435e425e53", "eldhose kuriyan", "or4xDwcxtAs", "center 52%"),
  unsplashScene("photo-1770563182950-7ce423af5116", "Timur Shakerzianov", "inGSMcT-i70", "center 55%"),
];

const SCENE_POOLS: Record<SceneKey, readonly Scene[]> = {
  walk: [BASE_SCENES.walk, ...CLEAR_SCENES],
  run: [BASE_SCENES.run, ...CLEAR_SCENES],
  cycle: [BASE_SCENES.cycle, ...CLEAR_SCENES],
  family: [BASE_SCENES.family, ...CLEAR_SCENES],
  dog: [BASE_SCENES.dog, CLEAR_DOGWALK, CLEAR_SUNPATH],
  cloudy: [
    BASE_SCENES.cloudy,
    { src: "/scene-cloudy-autumn.jpg", photographer: "Gennady Zakharin", href: "https://unsplash.com/photos/O2CVeC8zyFs", position: "center 54%" },
    { src: "/scene-cloudy-fog.jpg", photographer: "Nadiia Shuran", href: "https://unsplash.com/photos/N5LcYyNomKc", position: "center 58%" },
    unsplashScene("photo-1741177364548-a430f08ba0e3", "Tuan Nguyen", "jGfq2nOrgBA", "center 54%"),
    unsplashScene("photo-1742993065579-5e0325856322", "Anurag Sarkar", "-LozHaO9Eac", "center 56%"),
    unsplashScene("photo-1775716021167-e8133881470a", "Alexander Lunyov", "KGv2NvNfLa8", "center 52%"),
    unsplashScene("photo-1768410984104-bf3834fc0fb4", "Dewang Gupta", "iH0ejMO5wzE", "center 56%"),
  ],
  rain: [
    BASE_SCENES.rain,
    { src: "/scene-rain-dogwalk.jpg", photographer: "Martin Koloski", href: "https://unsplash.com/photos/VXfz0gnHIRg", position: "center 54%" },
    { src: "/scene-rain-umbrellas.jpg", photographer: "Kouji Tsuru", href: "https://unsplash.com/photos/dxi_FQzoGBo", position: "center 48%" },
    unsplashScene("photo-1777530708108-aff3b36b68fb", "Aysegul Aytören", "YvfGbhc286Q", "center 52%"),
    unsplashScene("photo-1767556177573-3882bb872b75", "Tkhao Khoang", "RAkfGC4JgRI", "center 55%"),
    unsplashScene("photo-1663531340061-6b9537f38566", "Charlie Devinett-Jones", "wN40qLWQtiI", "center 52%"),
    unsplashScene("photo-1680278278096-dab420e28141", "Nathan Franklin", "WIDrs1BZzPI", "center 55%"),
  ],
  snow: [
    BASE_SCENES.snow,
    { src: "/scene-snow-forest.jpg", photographer: "Sandra", href: "https://unsplash.com/photos/tRGcPlYH_cI", position: "center 58%" },
    { src: "/scene-snow-path.jpg", photographer: "stenedit", href: "https://unsplash.com/photos/vlDO_Q821UQ", position: "center 60%" },
    unsplashScene("photo-1768148253833-8154fe21ae80", "Maria Rodideal", "7IzHFilk-aI", "center 56%"),
    unsplashScene("photo-1758930908635-ba29de1281de", "Sebastian Schuster", "P_18HS7_aIM", "center 54%"),
    unsplashScene("photo-1767721989746-3bc7cc50904c", "odalv", "nkfj_npUo4s", "center 56%"),
    unsplashScene("photo-1766076079286-2abee2e7e4ef", "Brett Jordan", "nBv-jqez538", "center 58%"),
  ],
};

const METRIC_LABELS: Record<ComponentName, string> = {
  weather: "Weather",
  air: "Air",
  temperature: "Comfort",
  uv: "UV",
};

type ChartPoint = {
  hour: number;
  fits: Partial<Record<ComponentName, number>>;
};

type WindowPlan = { conditions: HourConditions[]; recommendation: Recommendation };
type PeriodId = "morning" | "noon" | "evening" | "night";
type PeriodPlan = WindowPlan & { id: PeriodId; score: number | null };

const OUTING_PERIODS: Array<{ id: PeriodId; start: number; end: number }> = [
  { id: "morning", start: 6, end: 11 },
  { id: "noon", start: 11, end: 15 },
  { id: "evening", start: 15, end: 20 },
  { id: "night", start: 20, end: 22 },
];
const PERIOD_TIE_PRIORITY: PeriodId[] = ["morning", "evening", "night", "noon"];

const CHART_METRICS: Array<{ name: ComponentName; color: string; dash?: string }> = [
  { name: "weather", color: "#8ed8ff" },
  { name: "air", color: "#92efc8", dash: "7 4" },
  { name: "temperature", color: "#ffd58a", dash: "2 3" },
  { name: "uv", color: "#ffaaa0", dash: "10 3 2 3" },
];

const CHART_START_HOUR = 6;
const CHART_END_HOUR = 22;
const CHART_WIDTH = 640;
const CHART_TOP = 8;
const CHART_BOTTOM = 92;

function chartX(hour: number): number {
  return (hour - CHART_START_HOUR) / (CHART_END_HOUR - CHART_START_HOUR) * CHART_WIDTH;
}

function chartY(fit: number): number {
  return CHART_BOTTOM - fit / 100 * (CHART_BOTTOM - CHART_TOP);
}

function metricPath(points: ChartPoint[], metric: ComponentName): string {
  let drawing = false;
  return points.map((point) => {
    const fit = point.fits[metric];
    if (fit === undefined) {
      drawing = false;
      return "";
    }
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${chartX(point.hour).toFixed(1)},${chartY(fit).toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

function nextSceneSequence(): number {
  try {
    const previous = Number.parseInt(sessionStorage.getItem(SCENE_ROTATION_KEY) ?? "0", 10);
    const next = Number.isFinite(previous) ? previous + 1 : 1;
    sessionStorage.setItem(SCENE_ROTATION_KEY, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

function readChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value && choices.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function savePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* The selection still works for this visit. */ }
}

function parseLocation(value: unknown): LocationChoice | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<LocationChoice>;
  if (typeof item.latitude !== "number" || typeof item.longitude !== "number") return null;
  if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude) || item.latitude < -90 || item.latitude > 90 || item.longitude < -180 || item.longitude > 180) return null;
  return {
    name: typeof item.name === "string" && item.name ? item.name : "Saved approximate location",
    region: typeof item.region === "string" ? item.region : "",
    country: typeof item.country === "string" ? item.country : "",
    countryCode: typeof item.countryCode === "string" && /^[a-z]{2}$/i.test(item.countryCode) ? item.countryCode.toUpperCase() : undefined,
    latitude: roundCoordinate(item.latitude),
    longitude: roundCoordinate(item.longitude),
  };
}

function readSavedLocations(): LocationChoice[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOCATION_HISTORY_KEY) ?? "[]");
    return Array.isArray(value) ? value.flatMap((item) => parseLocation(item) ?? []).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveLocation(location: LocationChoice): LocationChoice[] {
  try {
    const minimal = { name: location.name, region: location.region, country: location.country, countryCode: location.countryCode, latitude: location.latitude, longitude: location.longitude };
    const history = [minimal, ...readSavedLocations().filter((item) => item.latitude !== location.latitude || item.longitude !== location.longitude)].slice(0, 5);
    localStorage.setItem(LOCATION_KEY, JSON.stringify(minimal));
    localStorage.setItem(LOCATION_HISTORY_KEY, JSON.stringify(history));
    return history;
  } catch {
    return [location];
  }
}

function readSavedLocation(): LocationChoice | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? parseLocation(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function sharedLocation(params: URLSearchParams): LocationChoice | null {
  if (!params.has("lat") || !params.has("lon")) return null;
  return parseLocation({
    name: params.get("place")?.slice(0, 120) || "Shared approximate location",
    region: params.get("region")?.slice(0, 120) || "",
    country: params.get("country")?.slice(0, 120) || "",
    countryCode: params.get("countryCode")?.slice(0, 2) || undefined,
    latitude: Number(params.get("lat")),
    longitude: Number(params.get("lon")),
  });
}

function locationLabel(location: LocationChoice): string {
  return [location.name, location.region, location.country].filter(Boolean).join(", ");
}

function currentHourInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:00`;
}

function formatTime(time: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${time}:00Z`));
}

function nextHour(time: string): string {
  return new Date(new Date(`${time}:00Z`).getTime() + 3_600_000).toISOString().slice(0, 16);
}

function formatTemperature(celsius: number | null, units: Units): string {
  if (celsius === null) return "Unavailable";
  return units === "metric" ? `${Math.round(celsius)} °C` : `${Math.round(celsius * 9 / 5 + 32)} °F`;
}

function formatValue(value: number | null, suffix = ""): string {
  return value === null ? "Unavailable" : `${Math.round(value)}${suffix}`;
}

function selectedRatings(day: WindowPlan | undefined): HourRating[] {
  return day?.recommendation.hours.flatMap((index) => day.recommendation.ratings[index] ? [day.recommendation.ratings[index]] : []) ?? [];
}

function selectedHours(day: WindowPlan | undefined): HourConditions[] {
  return day?.recommendation.hours.flatMap((index) => day.conditions[index] ? [day.conditions[index]] : []) ?? [];
}

function windowLabel(day: WindowPlan | undefined): string {
  const hours = selectedHours(day);
  const start = hours[0]?.time;
  const end = hours.at(-1)?.time;
  if (!start || !end) return "No window available";
  return `${formatTime(start, { hour: "numeric" })} to ${formatTime(nextHour(end), { hour: "numeric" }).replace(/\s/g, " ")}`;
}

function lightLabel(day: WindowPlan): string {
  const hours = selectedHours(day);
  if (!hours.length) return "No window";
  if (hours.every((hour) => hour.isDay === true)) return "Daylight";
  if (hours.every((hour) => hour.isDay === false)) return "After dark";
  const first = hours[0]?.isDay;
  const last = hours.at(-1)?.isDay;
  if (first === false && last === true) return "Around sunrise";
  if (first === true && last === false) return "Around sunset";
  return "Changing light";
}

function weatherConditionLabel(codes: Array<number | null>): string {
  const present = codes.filter((code): code is number => code !== null);
  if (!present.length) return "Weather unavailable";
  if (present.some((code) => [95, 96, 99].includes(code))) return "Thunderstorms";
  if (present.some((code) => [71, 73, 75, 77, 85, 86].includes(code))) return "Snow";
  if (present.some((code) => [61, 63, 65, 66, 67, 80, 81, 82].includes(code))) return "Rain";
  if (present.some((code) => [51, 53, 55, 56, 57].includes(code))) return "Drizzle";
  if (present.some((code) => [45, 48].includes(code))) return "Fog";
  if (present.some((code) => code === 3)) return "Overcast";
  if (present.some((code) => [1, 2].includes(code))) return "Partly cloudy";
  if (present.every((code) => code === 0)) return "Clear";
  return "Mixed weather";
}

function periodPlans(conditions: HourConditions[], date: string, profile: Profile, currentLocalHour: string): PeriodPlan[] {
  return OUTING_PERIODS.map((period) => {
    const periodConditions = conditions.filter((condition) => {
      if (!condition.time.startsWith(`${date}T`)) return false;
      const hour = Number(condition.time.slice(11, 13));
      return hour >= period.start && hour < period.end;
    });
    const recommendation = recommend(periodConditions, profile, currentLocalHour, { daylightOnly: false });
    const ratings = recommendation.hours.flatMap((index) => recommendation.ratings[index] ? [recommendation.ratings[index]] : []);
    const score = ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length) : null;
    return { id: period.id, conditions: periodConditions, recommendation, score };
  });
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function maxValue(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.max(...present) : null;
}

function periodEvidence(day: WindowPlan, units: Units): { condition: string; temperature: string; aqi: string; uv: string } {
  const hours = selectedHours(day);
  const temperature = average(hours.map((hour) => hour.apparentTemperatureC));
  const aqi = average(hours.map((hour) => hour.usAqi));
  const uv = maxValue(hours.map((hour) => hour.uvIndex));
  return {
    condition: weatherConditionLabel(hours.map((hour) => hour.weatherCode)),
    temperature: temperature === null ? "No temp" : formatTemperature(temperature, units).replace(" ", "\u00a0"),
    aqi: aqi === null ? "AQI unavailable" : `AQI ${Math.round(aqi)}`,
    uv: uv === null ? "UV unavailable" : `UV ${uv.toFixed(1)}`,
  };
}

function temperatureRange(values: Array<number | null>, units: Units): string {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return "Feels-like temperature unavailable";
  const converted = present.map((value) => units === "metric" ? value : value * 9 / 5 + 32);
  const low = Math.round(Math.min(...converted));
  const high = Math.round(Math.max(...converted));
  const suffix = units === "metric" ? "°C" : "°F";
  return low === high ? `Feels like about ${low} ${suffix}` : `Feels like ${low} to ${high} ${suffix}`;
}

function daylightSummary(hours: HourConditions[]): string {
  const daylight = hours.filter((hour) => hour.isDay === true);
  const start = daylight[0]?.time;
  const end = daylight.at(-1)?.time;
  if (!start || !end) return "No daylight in the hours checked";
  return `Daylight from ${formatTime(start, { hour: "numeric" })} to ${formatTime(nextHour(end), { hour: "numeric" })}`;
}

function conversationDaySummary(hours: HourConditions[], units: Units): ConversationDaySummary {
  const rain = maxValue(hours.map((hour) => hour.precipitationProbability));
  const aqi = maxValue(hours.map((hour) => hour.usAqi));
  const uv = maxValue(hours.map((hour) => hour.uvIndex));
  return {
    condition: weatherConditionLabel(hours.map((hour) => hour.weatherCode)),
    temperature: temperatureRange(hours.map((hour) => hour.apparentTemperatureC), units),
    rain: rain === null ? "Rain chance unavailable" : `Rain up to ${Math.round(rain)}%`,
    aqi: aqi === null ? "Air quality unavailable" : `Air peaks at AQI ${Math.round(aqi)}`,
    uv: uv === null ? "UV unavailable" : `UV peaks at ${uv.toFixed(1)}`,
    light: daylightSummary(hours),
  };
}

function componentAverage(ratings: HourRating[], component: ComponentName): number | null {
  return average(ratings.map((rating) => rating.components[component] ?? null));
}

function tradeoffLabel(value: number | null): string {
  if (value === null) return "Not available";
  if (value < 20) return "Low tradeoff";
  if (value < 50) return "Some tradeoff";
  return "Higher tradeoff";
}

function reasonSummary(ratings: HourRating[]): string | null {
  const reason = ratings.flatMap((rating) => rating.reasons)[0];
  return reason?.replace(/ contributes \d+ points$/, " is the main tradeoff") ?? null;
}

function HourlyFitChart({ points, date, selectedHour, windows, onHourChange }: { points: ChartPoint[]; date: string; selectedHour: number; windows: Array<{ start: number; end: number }>; onHourChange: (hour: number) => void }) {
  const selectedPoint = points.find((point) => point.hour === selectedHour);
  const selectedTime = formatTime(`${date}T${String(selectedHour).padStart(2, "0")}:00`, { hour: "numeric" });
  const selectedSummary = CHART_METRICS.map((metric) => `${METRIC_LABELS[metric.name]} ${selectedPoint?.fits[metric.name] === undefined ? "unavailable" : Math.round(selectedPoint.fits[metric.name] ?? 0)}`).join(", ");
  const selectedX = chartX(selectedHour);
  const highlightWindows = windows.map((window) => ({
    start: Math.max(CHART_START_HOUR, Math.min(CHART_END_HOUR, window.start)),
    end: Math.max(CHART_START_HOUR, Math.min(CHART_END_HOUR, window.end)),
  })).filter((window) => window.end > window.start);

  return <figure className="hourly-chart" aria-labelledby="hourly-chart-title">
    <figcaption><span><strong id="hourly-chart-title">Through the day</strong><small>{windows.length ? `Higher is friendlier. Shaded areas are ${windows.length === 3 ? "the three selected" : "the selected"} ${windows.length === 1 ? "window" : "windows"}; drag to explore.` : "Higher is friendlier; drag to explore the whole day."}</small></span><strong>{selectedTime}</strong></figcaption>
    <div className="hourly-chart__plot">
      <svg viewBox={`0 0 ${CHART_WIDTH} 100`} preserveAspectRatio="none" aria-hidden="true">
        <line className="hourly-chart__guide" x1="0" x2={CHART_WIDTH} y1={CHART_TOP} y2={CHART_TOP}/>
        <line className="hourly-chart__guide" x1="0" x2={CHART_WIDTH} y1={(CHART_TOP + CHART_BOTTOM) / 2} y2={(CHART_TOP + CHART_BOTTOM) / 2}/>
        <line className="hourly-chart__guide" x1="0" x2={CHART_WIDTH} y1={CHART_BOTTOM} y2={CHART_BOTTOM}/>
        {highlightWindows.map((window) => <rect key={`${window.start}-${window.end}`} className="hourly-chart__window" x={chartX(window.start)} y="0" width={chartX(window.end) - chartX(window.start)} height="100" rx="8"/>)}
        {CHART_METRICS.map((metric) => <path key={metric.name} className="hourly-chart__line" d={metricPath(points, metric.name)} stroke={metric.color} strokeDasharray={metric.dash}/>)}
        <line className="hourly-chart__cursor" x1={selectedX} x2={selectedX} y1="0" y2="100"/>
      </svg>
      <input type="range" min={CHART_START_HOUR} max={CHART_END_HOUR} step="1" value={selectedHour} onChange={(event) => onHourChange(Number(event.target.value))} aria-label="Explore hourly conditions" aria-valuetext={`${selectedTime}. ${selectedSummary}`}/>
    </div>
    <div className="hourly-chart__axis" aria-hidden="true"><span>6a</span><span>10a</span><span>2p</span><span>6p</span><span>10p</span></div>
    <div className="hourly-chart__legend">{CHART_METRICS.map((metric) => {
      const fit = selectedPoint?.fits[metric.name];
      return <span key={metric.name}><i aria-hidden="true" style={{ backgroundColor: metric.color }}/><span>{METRIC_LABELS[metric.name]}</span><strong>{fit === undefined ? "No data" : Math.round(fit)}</strong></span>;
    })}</div>
  </figure>;
}

function updateWithTransition(update: () => void): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !document.startViewTransition) update();
  else document.startViewTransition(update);
}

export function HaveAGreatDayApp() {
  const [activity, setActivity] = useState<Activity>("walk");
  const [units, setUnits] = useState<Units>("metric");
  const [timePreference, setTimePreference] = useState<TimePreference>("any");
  const [selectedDate, setSelectedDate] = useState("");
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [savedLocations, setSavedLocations] = useState<LocationChoice[]>([]);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationChoice[]>([]);
  const [searchMessage, setSearchMessage] = useState("Search worldwide, then choose the matching place.");
  const [searchError, setSearchError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sceneSequence, setSceneSequence] = useState(0);
  const [failedSceneSrc, setFailedSceneSrc] = useState("");
  const [chartHour, setChartHour] = useState(12);
  const [conversationResult, setConversationResult] = useState<{ key: string; voice: ConversationVoice } | null>(null);
  const placeDialog = useRef<HTMLDialogElement | null>(null);
  const methodDetails = useRef<HTMLDetailsElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const forecastController = useRef<AbortController | null>(null);
  const conversationController = useRef<AbortController | null>(null);
  const unitsOverridden = useRef(false);
  const profile = ACTIVITIES[activity].profile;

  const advanceScene = useCallback(() => {
    setSceneSequence(nextSceneSequence());
  }, []);

  const openPlaceDialog = useCallback(() => {
    placeDialog.current?.showModal();
    window.setTimeout(() => searchInput.current?.focus(), 0);
  }, []);

  const loadLocation = useCallback(async (choice: LocationChoice, date = "") => {
    const rounded = { ...choice, latitude: roundCoordinate(choice.latitude), longitude: roundCoordinate(choice.longitude) };
    if (!unitsOverridden.current) setUnits(customaryUnitsForLocation(rounded, navigator.language));
    setLocation(rounded);
    setForecast(null);
    setSelectedDate(date);
    setSearchResults([]);
    setSearchMessage(`Showing forecast for ${locationLabel(rounded)}.`);
    setForgotten(false);
    setSavedLocations(saveLocation(rounded));
    setStatus({ kind: "loading" });
    forecastController.current?.abort();
    const controller = new AbortController();
    forecastController.current = controller;
    try {
      setForecast(await fetchForecast(rounded.latitude, rounded.longitude, controller.signal));
      setStatus({ kind: "ready" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const offline = !navigator.onLine;
      setStatus({ kind: "error", title: offline ? "You appear to be offline" : error instanceof ProviderError ? `${error.source.charAt(0).toUpperCase() + error.source.slice(1)} data unavailable` : "Forecast unavailable", message: offline ? "Reconnect to the internet, then retry this place." : error instanceof Error ? error.message : "The forecast could not be loaded. Try again.", retry: true });
    }
  }, []);

  useEffect(() => {
    setSceneSequence(nextSceneSequence());
    migrateStorage();
    const params = new URLSearchParams(window.location.search);
    const legacyProfile = readChoice<Profile>(PROFILE_KEY, ["general", "air", "temperature", "strenuous"], "general");
    const legacyActivity: Activity = legacyProfile === "strenuous" ? "run" : legacyProfile === "temperature" ? "family" : "walk";
    const requestedActivity = params.get("activity");
    const initialActivity = requestedActivity && Object.hasOwn(ACTIVITIES, requestedActivity) ? requestedActivity as Activity : readChoice<Activity>(ACTIVITY_KEY, Object.keys(ACTIVITIES) as Activity[], legacyActivity);
    const requestedTime = params.get("time");
    const initialTime = requestedTime && Object.hasOwn(TIME_OPTIONS, requestedTime) ? requestedTime as TimePreference : "any";
    const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date") ?? "" : "";
    const history = readSavedLocations();
    const initialLocation = sharedLocation(params) ?? readSavedLocation() ?? history[0] ?? null;
    const requestedUnits = params.get("units");
    const urlUnits = requestedUnits === "metric" || requestedUnits === "imperial" ? requestedUnits : null;
    const urlOverridesUnits = urlUnits !== null && params.get("unitMode") !== "auto";
    let savedUnitsOverride = false;
    try { savedUnitsOverride = localStorage.getItem(UNITS_OVERRIDE_KEY) === "true"; } catch { /* Automatic units remain available. */ }
    unitsOverridden.current = urlOverridesUnits || savedUnitsOverride;
    const initialUnits = urlOverridesUnits
      ? urlUnits
      : savedUnitsOverride
        ? readChoice<Units>(UNITS_KEY, ["metric", "imperial"], "metric")
        : customaryUnitsForLocation(initialLocation, navigator.language);
    setActivity(initialActivity);
    setUnits(initialUnits);
    setTimePreference(initialTime);
    setSavedLocations(history);
    savePreference(ACTIVITY_KEY, initialActivity);
    savePreference(PROFILE_KEY, ACTIVITIES[initialActivity].profile);
    if (initialLocation) void loadLocation(initialLocation, initialDate);
    setHydrated(true);

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPlaceDialog();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      searchController.current?.abort();
      forecastController.current?.abort();
      conversationController.current?.abort();
    };
  }, [loadLocation, openPlaceDialog]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const details = methodDetails.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = methodDetails.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.searchParams.set("activity", activity);
    url.searchParams.set("time", timePreference);
    url.searchParams.set("units", units);
    url.searchParams.set("unitMode", unitsOverridden.current ? "override" : "auto");
    if (selectedDate) url.searchParams.set("date", selectedDate); else url.searchParams.delete("date");
    url.searchParams.delete("period");
    if (location) {
      url.searchParams.set("lat", location.latitude.toFixed(2));
      url.searchParams.set("lon", location.longitude.toFixed(2));
      url.searchParams.set("place", location.name);
      if (location.region) url.searchParams.set("region", location.region); else url.searchParams.delete("region");
      if (location.country) url.searchParams.set("country", location.country); else url.searchParams.delete("country");
      if (location.countryCode) url.searchParams.set("countryCode", location.countryCode); else url.searchParams.delete("countryCode");
    } else {
      for (const key of ["lat", "lon", "place", "region", "country", "countryCode"]) url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);
  }, [activity, hydrated, location, selectedDate, timePreference, units]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const place = query.trim();
    if (place.length < 2) {
      setSearchError(true);
      setSearchMessage("Enter at least two characters, then search again.");
      return;
    }
    setSearchError(false);
    setSearchMessage("Searching for matching places...");
    setSearching(true);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    try {
      const results = await searchLocations(place, controller.signal);
      setSearchResults(results);
      setSearchMessage(results.length ? `${results.length} matching ${results.length === 1 ? "place" : "places"}.` : "No matches. Check the spelling or try a nearby city.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSearchError(true);
      setSearchMessage(error instanceof Error ? error.message : "The location search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function chooseLocation(choice: LocationChoice) {
    placeDialog.current?.close();
    void loadLocation(choice);
  }

  function useApproximateLocation() {
    if (!navigator.geolocation) {
      setSearchError(true);
      setSearchMessage("This browser cannot read device location. Search for a nearby city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        placeDialog.current?.close();
        void loadLocation({ name: "Approximate device location", region: "", country: "", latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (error) => {
        setLocating(false);
        setSearchError(true);
        setSearchMessage(error.code === error.PERMISSION_DENIED ? "Location permission was denied. Allow it in browser settings or search for a city." : "Your location could not be read. Search for a nearby city or try again.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function chooseDate(date: string) {
    updateWithTransition(() => {
      setSelectedDate(date);
      advanceScene();
    });
  }

  function toggleUnits() {
    const nextUnits: Units = units === "metric" ? "imperial" : "metric";
    unitsOverridden.current = true;
    setUnits(nextUnits);
    savePreference(UNITS_KEY, nextUnits);
    savePreference(UNITS_OVERRIDE_KEY, "true");
  }

  function forgetLocation() {
    if (!location) return;
    const next = savedLocations.filter((item) => item.latitude !== location.latitude || item.longitude !== location.longitude);
    try {
      localStorage.removeItem(LOCATION_KEY);
      localStorage.setItem(LOCATION_HISTORY_KEY, JSON.stringify(next));
    } catch { /* The UI still removes it for this visit. */ }
    setSavedLocations(next);
    setForgotten(true);
  }

  const localHour = forecast ? currentHourInTimezone(forecast.timezone) : "";
  const dayPlans = useMemo(() => forecast ? recommendDays(forecast.conditions, profile, localHour, timePreference) : [], [forecast, profile, localHour, timePreference]);
  const rankedDays = useMemo(() => dayPlans.filter((day) => day.score !== null).toSorted((a, b) => (a.score ?? 100) - (b.score ?? 100)), [dayPlans]);
  const topDay = rankedDays[0];
  const activeDay = dayPlans.find((day) => day.date === selectedDate) ?? topDay ?? dayPlans[0];
  const activePeriods = useMemo(() => forecast && activeDay ? periodPlans(forecast.conditions, activeDay.date, profile, localHour) : [], [activeDay, forecast, localHour, profile]);
  const rankedPeriods = useMemo(() => activePeriods
    .filter((period) => period.score !== null)
    .toSorted((first, second) => (first.score ?? 100) - (second.score ?? 100) || PERIOD_TIE_PRIORITY.indexOf(first.id) - PERIOD_TIE_PRIORITY.indexOf(second.id)), [activePeriods]);
  const planningHours = useMemo(() => {
    if (!forecast || !activeDay) return [];
    return forecast.conditions.filter((condition) => {
      if (!condition.time.startsWith(`${activeDay.date}T`) || condition.time <= localHour) return false;
      const hour = Number(condition.time.slice(11, 13));
      return hour >= CHART_START_HOUR && hour < CHART_END_HOUR;
    });
  }, [activeDay, forecast, localHour]);
  const adaptiveDecision = useMemo(() => assessAdaptiveDay(planningHours, rankedPeriods.map((period) => ({ id: period.id, score: period.score, hours: selectedHours(period) })), profile), [planningHours, profile, rankedPeriods]);
  const recommendedPeriods = useMemo(() => adaptiveDecision.candidateIds.flatMap((id) => rankedPeriods.find((period) => period.id === id) ?? []), [adaptiveDecision.candidateIds, rankedPeriods]);
  const currentDate = localHour.slice(0, 10);
  const tomorrow = currentDate ? new Date(`${currentDate}T12:00:00Z`).getTime() + 86_400_000 : 0;
  const dayName = (date: string) => date === currentDate ? "Today" : tomorrow && date === new Date(tomorrow).toISOString().slice(0, 10) ? "Tomorrow" : formatTime(`${date}T12:00`, { weekday: "long" });
  const activeDayLabel = activeDay ? dayName(activeDay.date) : "";
  const daySummary = useMemo(() => conversationDaySummary(planningHours, units), [planningHours, units]);
  const conversationInput = useMemo<ConversationInput | null>(() => {
    if (!activeDay || !activeDayLabel || !location) return null;
    return {
      place: location.name === "Approximate device location" ? "Your area" : location.name,
      day: activeDayLabel,
      date: activeDay.date,
      assessment: {
        allowedModes: adaptiveDecision.allowedModes,
        defaultMode: adaptiveDecision.defaultMode,
        defaultWindowCount: adaptiveDecision.defaultWindowCount,
        favorableHourShare: adaptiveDecision.favorableHourShare,
        blockedHourShare: adaptiveDecision.blockedHourShare,
        summary: daySummary,
      },
      windows: recommendedPeriods.map((period) => {
        const evidence = periodEvidence(period, units);
        return {
          id: period.id,
          time: windowLabel(period),
          fit: Math.max(0, 100 - (period.score ?? 100)),
          condition: evidence.condition,
          temperature: evidence.temperature,
          aqi: evidence.aqi,
          uv: evidence.uv,
          light: lightLabel(period),
        };
      }),
    };
  }, [activeDay, activeDayLabel, adaptiveDecision, daySummary, location, recommendedPeriods, units]);
  const conversationKey = useMemo(() => conversationInput ? JSON.stringify(conversationInput) : "", [conversationInput]);
  const fallbackVoice = useMemo(() => conversationInput ? fallbackConversationVoice(conversationInput) : null, [conversationInput]);
  const personalizedVoice = conversationResult?.key === conversationKey ? conversationResult.voice : null;
  const conversationVoice = personalizedVoice ?? fallbackVoice;
  const displayedWindows = useMemo(() => conversationVoice?.mode === "windows"
    ? conversationVoice.selectedIds.flatMap((id) => conversationInput?.windows.find((window) => window.id === id) ?? [])
    : [], [conversationInput, conversationVoice]);
  const displayedPeriods = useMemo(() => conversationVoice?.mode === "windows"
    ? conversationVoice.selectedIds.flatMap((id) => recommendedPeriods.find((period) => period.id === id) ?? [])
    : [], [conversationVoice, recommendedPeriods]);
  const activeHours = conversationVoice?.mode === "windows" ? displayedPeriods.flatMap((period) => selectedHours(period)) : planningHours;
  const activeRatings = conversationVoice?.mode === "windows" ? displayedPeriods.flatMap((period) => selectedRatings(period)) : planningHours.map((hour) => rateHour(hour, profile));
  const meanTemperature = average(activeHours.map((hour) => hour.apparentTemperatureC));
  const meanAqi = average(activeHours.map((hour) => hour.usAqi));
  const maxUv = maxValue(activeHours.map((hour) => hour.uvIndex));
  const maxRain = maxValue(activeHours.map((hour) => hour.precipitationProbability));
  const metricTradeoffs = {
    temperature: componentAverage(activeRatings, "temperature"),
    weather: componentAverage(activeRatings, "weather"),
    air: componentAverage(activeRatings, "air"),
    uv: componentAverage(activeRatings, "uv"),
  };
  const sceneHours = selectedHours(activeDay);
  const representativeWeather = sceneHours.find((hour) => hour.weatherCode !== null)?.weatherCode ?? null;
  const sceneKey = weatherScene(activity, representativeWeather);
  const scenePool = SCENE_POOLS[sceneKey];
  const sceneIndex = Math.abs(sceneSequence) % scenePool.length;
  const sceneCandidate = scenePool[sceneIndex] ?? BASE_SCENES[sceneKey];
  const scene = failedSceneSrc === sceneCandidate.src ? BASE_SCENES[sceneKey] : sceneCandidate;
  const recommendationScore = conversationVoice?.mode === "none" ? null : average(activeRatings.map((rating) => rating.score));
  const greatTimeFit = recommendationScore === null ? null : Math.max(0, Math.round(100 - recommendationScore));
  const rankingSummary = conversationVoice?.mode === "all_day"
    ? `Conditions stay consistently favorable across the hours we checked for ${activeDayLabel}.`
    : conversationVoice?.mode === "none"
      ? `The forecast does not leave a practical outdoor window in the hours we checked for ${activeDayLabel}.`
      : displayedPeriods.length
        ? `${displayedPeriods.length === 1 ? "The strongest window" : `The ${displayedPeriods.length} worthwhile windows`} we found for ${activeDayLabel}.`
        : "We compare each available window.";
  const profileWeights = Object.entries(PROFILE_WEIGHTS[profile])
    .toSorted(([, first], [, second]) => second - first) as Array<[ComponentName, number]>;
  const chartWindows = displayedPeriods.flatMap((period) => {
    const hours = selectedHours(period);
    const start = hours[0] ? Number(hours[0].time.slice(11, 13)) : null;
    const end = hours.at(-1) ? Number(hours.at(-1)?.time.slice(11, 13)) + 1 : null;
    return start === null || end === null ? [] : [{ start, end }];
  });
  const firstPlanningHour = planningHours[0] ? Number(planningHours[0].time.slice(11, 13)) : 12;
  const firstWindowStart = chartWindows[0]?.start ?? firstPlanningHour;
  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!forecast || !activeDay) return [];
    return forecast.conditions.flatMap((condition) => {
      if (!condition.time.startsWith(`${activeDay.date}T`)) return [];
      const hour = Number(condition.time.slice(11, 13));
      if (hour < CHART_START_HOUR || hour > CHART_END_HOUR) return [];
      const rating = rateHour(condition, profile);
      const fits: ChartPoint["fits"] = {};
      for (const name of Object.keys(rating.components) as ComponentName[]) fits[name] = 100 - (rating.components[name] ?? 100);
      return [{ hour, fits }];
    });
  }, [activeDay, forecast, profile]);

  useEffect(() => {
    setChartHour(Math.max(CHART_START_HOUR, Math.min(CHART_END_HOUR, firstWindowStart)));
  }, [activeDay?.date, firstWindowStart]);

  useEffect(() => {
    conversationController.current?.abort();
    if (!conversationInput || !conversationKey) return;

    const controller = new AbortController();
    conversationController.current = controller;
    void (async () => {
      try {
        const response = await fetch("/api/conversation/", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: conversationKey,
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const voice = parseConversationVoice(await response.json(), conversationInput);
        if (voice && !controller.signal.aborted) setConversationResult({ key: conversationKey, voice });
      } catch { /* The grounded, deterministic note remains visible. */ }
    })();

    return () => controller.abort();
  }, [conversationInput, conversationKey]);

  useEffect(() => {
    const nextScene = scenePool[(sceneIndex + 1) % scenePool.length];
    if (!nextScene || nextScene.src === scene.src) return;
    const image = new window.Image();
    const widths = [640, 828, 1200, 1920];
    if (isUnsplashScene(nextScene.src)) {
      image.srcset = widths.map((width) => `${unsplashImageUrl(nextScene.src, width)} ${width}w`).join(", ");
      image.src = unsplashImageUrl(nextScene.src, 1200);
    } else {
      const source = encodeURIComponent(nextScene.src);
      image.srcset = widths.map((width) => `/_next/image?url=${source}&w=${width}&q=75 ${width}w`).join(", ");
      image.src = `/_next/image?url=${source}&w=1200&q=75`;
    }
    image.sizes = "(max-width: 1248px) 100vw, 1216px";
  }, [scene.src, sceneIndex, scenePool]);

  return <div className="experience-root">
    <a className="skip-link" href="#main">Skip to planner</a>
    <main id="main" className="single-screen">
      <section className="decision-card" data-scene={sceneKey} aria-labelledby="decision-title">
        <Image key={scene.src} className="decision-card__image" src={scene.src} alt="" aria-hidden="true" fill sizes="(max-width: 1248px) 100vw, 1216px" fetchPriority="high" loader={isUnsplashScene(scene.src) ? unsplashImageLoader : undefined} onError={isUnsplashScene(scene.src) ? () => setFailedSceneSrc(scene.src) : undefined} style={scene.position ? { objectPosition: scene.position } : undefined}/>
        <div className="decision-card__scrim" aria-hidden="true"/>

        <header className="card-bar">
          <Link className="brand-lockup" href="/" aria-label="Have a Great Day home"><strong>Have a Great Day</strong><small>Let’s find your best times outside.</small></Link>
          <div className="card-controls">
            <button className="place-control" type="button" onClick={openPlaceDialog} aria-haspopup="dialog"><span>{location ? locationLabel(location) : "Choose a place"}</span><kbd>⌘K</kbd></button>
            <button className="unit-toggle" type="button" onClick={toggleUnits} aria-label={`Temperature is shown in ${units === "metric" ? "Celsius" : "Fahrenheit"}. Switch to ${units === "metric" ? "Fahrenheit" : "Celsius"}.`}>{units === "metric" ? "°C" : "°F"}</button>
          </div>
        </header>

        {status.kind === "ready" && activeDay ? <div className="week-overview"><p>The week ahead</p><div className="week-times" role="group" aria-label="Choose a day in the next week">{dayPlans.map((day) => {
          const selectable = day.conditions.length > 0;
          return <button type="button" key={day.date} disabled={!selectable} data-selected={day.date === activeDay.date || undefined} aria-pressed={day.date === activeDay.date} aria-label={dayName(day.date)} onClick={() => chooseDate(day.date)}><span>{formatTime(`${day.date}T12:00`, { weekday: "short" })}</span></button>;
        })}</div></div> : null}

        <div className="decision-copy" aria-live="polite">
          {status.kind === "idle" ? <><h1 id="decision-title">Find your best time outside.</h1><p>Choose a place. We&apos;ll read the whole week and tell you what&apos;s genuinely worth planning around.</p><button className="card-action" type="button" onClick={openPlaceDialog}>Choose a place</button></> : null}
          {status.kind === "loading" ? <div className="card-loading" role="status"><span/><h1 id="decision-title">Looking across the week.</h1><p>Balancing weather, air quality, UV, temperature, and daylight.</p></div> : null}
          {status.kind === "error" ? <div className="card-error" role="alert"><h1 id="decision-title">{status.title}</h1><p>{status.message}</p><div>{status.retry && location ? <button className="card-action" type="button" onClick={() => void loadLocation(location)}>Try again</button> : null}<button className="card-action card-action--quiet" type="button" onClick={openPlaceDialog}>Change place</button></div></div> : null}
          {status.kind === "ready" && location && forecast && activeDay ? <>
            <h1 id="decision-title" className="visually-hidden">Outdoor times for {dayName(activeDay.date)}</h1>
            {conversationInput && conversationVoice ? <section className="forecast-conversation" aria-label={`A personal plan for ${dayName(activeDay.date)}`} aria-live="off">
              <p className="forecast-conversation__kicker">A little plan for your day</p>
              <div key={personalizedVoice ? `${conversationKey}:personal` : `${conversationKey}:instant`} className="forecast-conversation__note">
                <p className="forecast-conversation__opening">{conversationVoice.opening}</p>
                {conversationVoice.mode === "windows" ? <div className="forecast-conversation__lines" role="list" aria-label={`Ranked outdoor times for ${dayName(activeDay.date)}`}>{displayedWindows.map((window, index) => {
                  const lead = conversationVoice.leads[index]?.text ?? fallbackVoice?.leads[index]?.text ?? "Another option is";
                  return <p role="listitem" key={window.id}><span>{lead} </span><strong>{window.time}</strong><span>. {describeConversationWindow(window)}</span></p>;
                })}</div> : <div className="forecast-conversation__day"><p>{describeConversationDay(conversationInput.assessment.summary)}</p><p>{conversationVoice.mode === "all_day" ? "Choose the time that fits your plans instead of planning around a narrow forecast window." : "Choose another day above and we’ll look for a better opening."}</p></div>}
              </div>
            </section> : <p className="decision-context">No outdoor window remains for {dayName(activeDay.date).toLowerCase()}. Choose another day to keep planning.</p>}
          </> : null}
        </div>

        <details ref={methodDetails} className="method-details">
          <summary>{status.kind === "ready" ? conversationVoice?.mode === "all_day" ? "Why this day?" : conversationVoice?.mode === "none" ? "Why another day?" : "Why these times?" : "How it works"}</summary>
          <div className="method-details__body">
            {status.kind === "ready" && activeDay && activeHours.length ? <>
              <header className="method-heading"><div><h2>{conversationVoice?.mode === "all_day" ? "Why the whole day works" : conversationVoice?.mode === "none" ? "Why another day is better" : "Why these times work"}</h2><p>{rankingSummary}</p></div>{greatTimeFit !== null ? <div className="fit-score"><strong>{greatTimeFit}</strong><span>Average fit</span></div> : null}</header>
              <dl className="method-facts">
                <div><dt>Feels like</dt><dd>{formatTemperature(meanTemperature, units)}</dd>{meanTemperature !== null ? <small>{tradeoffLabel(metricTradeoffs.temperature)}</small> : null}</div>
                <div><dt>Rain</dt><dd>{formatValue(maxRain, "%")}</dd>{maxRain !== null ? <small>{tradeoffLabel(metricTradeoffs.weather)}</small> : null}</div>
                <div><dt>Air</dt><dd>{meanAqi === null ? "No data" : formatValue(meanAqi, " AQI")}</dd>{meanAqi !== null ? <small>{tradeoffLabel(metricTradeoffs.air)}</small> : null}</div>
                <div><dt>UV</dt><dd>{maxUv === null ? "No data" : maxUv.toFixed(1)}</dd>{maxUv !== null ? <small>{tradeoffLabel(metricTradeoffs.uv)}</small> : null}</div>
              </dl>
              <HourlyFitChart points={chartPoints} date={activeDay.date} selectedHour={chartHour} windows={chartWindows} onHourChange={setChartHour}/>
            </> : <p>We compare seven days of local weather, air quality, UV, and feels-like temperature, then find practical windows throughout each day.</p>}
            <section className="method-breakdown" aria-labelledby="method-breakdown-title">
              {status.kind === "ready" && activeDay && activeHours.length ? <div className="method-breakdown__intro"><h3 id="method-breakdown-title">How we decide</h3><p>{conversationVoice?.mode === "all_day" ? "We checked the full planning day and found that isolated windows would add clutter." : conversationVoice?.mode === "none" ? "We checked the full planning day and did not find a window that cleared the forecast guardrails." : "We compare four parts of the day, then keep only the windows with a worthwhile balance."} {reasonSummary(activeRatings) ? `${reasonSummary(activeRatings)}.` : "The available forecast factors are well balanced."}</p></div> : <h3 id="method-breakdown-title">Data and sources</h3>}
              {status.kind === "ready" && activeDay && activeHours.length ? <div className="method-weights" aria-label="How much each forecast factor influences the result">{profileWeights.map(([name, weight]) => <span key={name}><strong>{METRIC_LABELS[name]}</strong> {Math.round(weight * 100)}%</span>)}</div> : null}
              <footer><span>Photo by <a href={scene.href} rel="noreferrer">{scene.photographer}</a> on Unsplash</span><span>Planning aid only</span><span className="method-footer-links"><a href="https://open-meteo.com/" rel="noreferrer">Forecast data</a><Link href="/privacy">Privacy</Link></span></footer>
            </section>
          </div>
        </details>
      </section>
    </main>

    <dialog ref={placeDialog} className="place-dialog" aria-labelledby="place-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}><div className="place-dialog__panel">
      <header><h2 id="place-title">Choose a place</h2><button className="text-button" type="button" onClick={() => placeDialog.current?.close()}>Close</button></header>
      {savedLocations.length > 0 ? <section className="saved-list" aria-labelledby="saved-title"><h3 id="saved-title">Recent places</h3><div>{savedLocations.map((saved) => <button type="button" key={`${saved.latitude}-${saved.longitude}`} onClick={() => chooseLocation(saved)}><span>{saved.name}</span><small>{[saved.region, saved.country].filter(Boolean).join(", ") || `${saved.latitude.toFixed(2)}, ${saved.longitude.toFixed(2)}`}</small></button>)}</div></section> : null}
      <form className="location-form" onSubmit={handleSearch} noValidate><label htmlFor="city">Search for a city or town</label><div className="input-row"><input ref={searchInput} id="city" name="city" type="search" autoComplete="address-level2" enterKeyHint="search" placeholder="Try Pasadena or Portland" aria-describedby="city-help" aria-invalid={searchError || undefined} value={query} onChange={(event) => { setQuery(event.target.value); if (searchError) setSearchError(false); }} required/><button className="button" type="submit" disabled={searching} aria-busy={searching}>{searching ? "Searching..." : "Search"}</button></div><p id="city-help" className={`field-help${searchError ? " field-help--error" : ""}`} role={searchError ? "alert" : undefined}>{searchMessage}</p></form>
      <button className="button button--soft" type="button" onClick={useApproximateLocation} disabled={locating} aria-busy={locating}>{locating ? "Finding you..." : "Use my location"}</button>
      <div className="search-results" aria-live="polite">{searchResults.length > 0 ? <ul>{searchResults.map((result) => <li key={`${result.latitude}-${result.longitude}`}><button type="button" onClick={() => chooseLocation(result)}><span>{result.name}</span><small>{[result.region, result.country].filter(Boolean).join(", ")}</small></button></li>)}</ul> : null}</div>
      <div className="privacy-note"><p>No account or first-party analytics. Forecasts use Open-Meteo, wording uses our inference service, and photos use Unsplash.</p>{location ? <button className="text-button text-button--danger" type="button" onClick={forgetLocation} disabled={forgotten}>{forgotten ? "Removed from recent places" : "Forget this place"}</button> : null}</div>
    </div></dialog>
  </div>;
}
