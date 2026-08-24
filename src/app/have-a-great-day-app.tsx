"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchForecast, ProviderError, roundCoordinate, searchLocations, type ForecastResult, type LocationChoice } from "../openMeteo";
import { ACTIVITIES, TIME_OPTIONS, weatherScene, type Activity, type SceneKey } from "../plan-query";
import { PROFILE_WEIGHTS, recommendDays, type ComponentName, type DayPlan, type HourConditions, type HourRating, type Profile, type TimePreference, type Units } from "../suitability";

const ACTIVITY_KEY = "haveagreatday-activity:v1";
const PROFILE_KEY = "haveagreatday-profile";
const UNITS_KEY = "haveagreatday-units";
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
const CLEAR_SCENES: readonly Scene[] = [CLEAR_SUNPATH, CLEAR_DOGWALK];

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
  ],
  rain: [
    BASE_SCENES.rain,
    { src: "/scene-rain-dogwalk.jpg", photographer: "Martin Koloski", href: "https://unsplash.com/photos/VXfz0gnHIRg", position: "center 54%" },
    { src: "/scene-rain-umbrellas.jpg", photographer: "Kouji Tsuru", href: "https://unsplash.com/photos/dxi_FQzoGBo", position: "center 48%" },
  ],
  snow: [
    BASE_SCENES.snow,
    { src: "/scene-snow-forest.jpg", photographer: "Sandra", href: "https://unsplash.com/photos/tRGcPlYH_cI", position: "center 58%" },
    { src: "/scene-snow-path.jpg", photographer: "stenedit", href: "https://unsplash.com/photos/vlDO_Q821UQ", position: "center 60%" },
  ],
};

const METRIC_LABELS: Record<ComponentName, string> = {
  weather: "Weather",
  air: "Air",
  temperature: "Comfort",
  uv: "UV",
};

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
    const minimal = { name: location.name, region: location.region, country: location.country, latitude: location.latitude, longitude: location.longitude };
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

function selectedRatings(day: DayPlan | undefined): HourRating[] {
  return day?.recommendation.hours.flatMap((index) => day.recommendation.ratings[index] ? [day.recommendation.ratings[index]] : []) ?? [];
}

function selectedHours(day: DayPlan | undefined): HourConditions[] {
  return day?.recommendation.hours.flatMap((index) => day.conditions[index] ? [day.conditions[index]] : []) ?? [];
}

function windowLabel(day: DayPlan | undefined): string {
  const hours = selectedHours(day);
  const start = hours[0]?.time;
  const end = hours.at(-1)?.time;
  if (!start || !end) return "No daylight window available";
  return `${formatTime(start, { hour: "numeric" })} to ${formatTime(nextHour(end), { hour: "numeric" }).replace(/\s/g, " ")}`;
}

function compactWindowLabel(day: DayPlan): string {
  const hours = selectedHours(day);
  const start = hours[0]?.time;
  const end = hours.at(-1)?.time;
  if (!start || !end) return "None";
  const compactTime = (time: string) => formatTime(time, { hour: "numeric" }).replace(/\s/g, "").replace("AM", "a").replace("PM", "p");
  return `${compactTime(start)}-${compactTime(nextHour(end))}`;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function maxValue(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.max(...present) : null;
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
  const placeDialog = useRef<HTMLDialogElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const forecastController = useRef<AbortController | null>(null);
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
    const initialUnits = params.get("units") === "imperial" ? "imperial" : readChoice<Units>(UNITS_KEY, ["metric", "imperial"], "metric");
    const requestedTime = params.get("time");
    const initialTime = requestedTime && Object.hasOwn(TIME_OPTIONS, requestedTime) ? requestedTime as TimePreference : "any";
    const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date") ?? "" : "";
    const history = readSavedLocations();
    setActivity(initialActivity);
    setUnits(initialUnits);
    setTimePreference(initialTime);
    setSavedLocations(history);
    savePreference(ACTIVITY_KEY, initialActivity);
    savePreference(PROFILE_KEY, ACTIVITIES[initialActivity].profile);
    savePreference(UNITS_KEY, initialUnits);
    const initialLocation = sharedLocation(params) ?? readSavedLocation() ?? history[0] ?? null;
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
    };
  }, [loadLocation, openPlaceDialog]);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.searchParams.set("activity", activity);
    url.searchParams.set("time", timePreference);
    url.searchParams.set("units", units);
    if (selectedDate) url.searchParams.set("date", selectedDate); else url.searchParams.delete("date");
    if (location) {
      url.searchParams.set("lat", location.latitude.toFixed(2));
      url.searchParams.set("lon", location.longitude.toFixed(2));
      url.searchParams.set("place", location.name);
      if (location.region) url.searchParams.set("region", location.region); else url.searchParams.delete("region");
      if (location.country) url.searchParams.set("country", location.country); else url.searchParams.delete("country");
    } else {
      for (const key of ["lat", "lon", "place", "region", "country"]) url.searchParams.delete(key);
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
  const activeIsTop = Boolean(activeDay && topDay && activeDay.date === topDay.date);
  const activeRatings = selectedRatings(activeDay);
  const activeHours = selectedHours(activeDay);
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
  const currentDate = localHour.slice(0, 10);
  const tomorrow = currentDate ? new Date(`${currentDate}T12:00:00Z`).getTime() + 86_400_000 : 0;
  const dayName = (date: string) => date === currentDate ? "Today" : tomorrow && date === new Date(tomorrow).toISOString().slice(0, 10) ? "Tomorrow" : formatTime(`${date}T12:00`, { weekday: "long" });
  const representativeWeather = activeHours.find((hour) => hour.weatherCode !== null)?.weatherCode ?? null;
  const sceneKey = weatherScene(activity, representativeWeather);
  const scenePool = SCENE_POOLS[sceneKey];
  const sceneIndex = Math.abs(sceneSequence) % scenePool.length;
  const scene = scenePool[sceneIndex] ?? BASE_SCENES[sceneKey];
  const greatTimeFit = activeDay?.score === null || activeDay?.score === undefined ? null : Math.max(0, 100 - activeDay.score);
  const activeRank = activeDay ? rankedDays.findIndex((day) => day.date === activeDay.date) + 1 : 0;
  const rankingSummary = activeIsTop
    ? "Best balance across the next seven days."
    : activeDay
      ? `Best window on ${dayName(activeDay.date)}${activeRank > 0 ? `. ${activeRank} of ${rankedDays.length} this week.` : "."}`
      : "We compare each available daylight window.";
  const profileWeights = Object.entries(PROFILE_WEIGHTS[profile])
    .toSorted(([, first], [, second]) => second - first) as Array<[ComponentName, number]>;

  useEffect(() => {
    const nextScene = scenePool[(sceneIndex + 1) % scenePool.length];
    if (!nextScene || nextScene.src === scene.src) return;
    const image = new window.Image();
    const source = encodeURIComponent(nextScene.src);
    const widths = [640, 828, 1200, 1920];
    image.srcset = widths.map((width) => `/_next/image?url=${source}&w=${width}&q=75 ${width}w`).join(", ");
    image.sizes = "(max-width: 1248px) 100vw, 1216px";
    image.src = `/_next/image?url=${source}&w=1200&q=75`;
  }, [scene.src, sceneIndex, scenePool]);

  return <div className="experience-root">
    <a className="skip-link" href="#main">Skip to planner</a>
    <main id="main" className="single-screen">
      <section className="decision-card" data-scene={sceneKey} aria-labelledby="decision-title">
        <Image key={scene.src} className="decision-card__image" src={scene.src} alt="" aria-hidden="true" fill sizes="(max-width: 1248px) 100vw, 1216px" fetchPriority="high" style={scene.position ? { objectPosition: scene.position } : undefined}/>
        <div className="decision-card__scrim" aria-hidden="true"/>

        <header className="card-bar">
          <Link className="wordmark wordmark--card" href="/" aria-label="Have a Great Day home">Have a Great Day</Link>
          <button className="place-control" type="button" onClick={openPlaceDialog} aria-haspopup="dialog"><span>{location ? locationLabel(location) : "Choose a place"}</span><kbd>⌘K</kbd></button>
        </header>

        {status.kind === "ready" && activeDay ? <div className="week-overview"><p>Best times this week</p><div className="week-times" role="group" aria-label="Best outdoor times for the next seven days">{dayPlans.map((day) => {
          const selectable = selectedHours(day).length > 0;
          return <button type="button" key={day.date} disabled={!selectable} data-selected={day.date === activeDay.date || undefined} aria-pressed={day.date === activeDay.date} aria-label={`${dayName(day.date)}, ${windowLabel(day)}`} onClick={() => chooseDate(day.date)}><span>{formatTime(`${day.date}T12:00`, { weekday: "short" }).slice(0, 2)}</span><strong>{compactWindowLabel(day)}</strong></button>;
        })}</div></div> : null}

        <div className="decision-copy" aria-live="polite">
          {status.kind === "idle" ? <><h1 id="decision-title">Find your best time outside.</h1><p>Choose a place. We&apos;ll compare the week and give you one clear window.</p><button className="card-action" type="button" onClick={openPlaceDialog}>Choose a place</button></> : null}
          {status.kind === "loading" ? <div className="card-loading" role="status"><span/><h1 id="decision-title">Looking across the week.</h1><p>Balancing weather, air quality, UV, temperature, and daylight.</p></div> : null}
          {status.kind === "error" ? <div className="card-error" role="alert"><h1 id="decision-title">{status.title}</h1><p>{status.message}</p><div>{status.retry && location ? <button className="card-action" type="button" onClick={() => void loadLocation(location)}>Try again</button> : null}<button className="card-action card-action--quiet" type="button" onClick={openPlaceDialog}>Change place</button></div></div> : null}
          {status.kind === "ready" && location && forecast && activeDay ? <>
            <h1 id="decision-title">{dayName(activeDay.date)},<br/>{windowLabel(activeDay)}</h1>
            <p className="decision-context">{activeIsTop ? "Best outdoor window" : "Outdoor window"} in {location.name}. {activeIsTop ? "Our best balance this week" : "Compared with the same forecast factors"} across weather, air quality, UV, temperature, and daylight.</p>
          </> : null}
        </div>

        <details className="method-details">
          <summary><span>{status.kind === "ready" ? "Why this time" : "How it works"}</span>{greatTimeFit !== null ? <strong>{greatTimeFit}/100 fit</strong> : null}</summary>
          <div className="method-details__body">
            {status.kind === "ready" && activeDay && activeHours.length ? <>
              <header className="method-heading"><div><h2>Why this time works</h2><p>{rankingSummary}</p></div><div className="fit-score"><strong>{greatTimeFit}</strong><span>Great-time fit</span></div></header>
              <dl className="method-facts">
                <div><dt>Feels like</dt><dd>{formatTemperature(meanTemperature, units)}</dd>{meanTemperature !== null ? <small>{tradeoffLabel(metricTradeoffs.temperature)}</small> : null}</div>
                <div><dt>Rain</dt><dd>{formatValue(maxRain, "%")}</dd>{maxRain !== null ? <small>{tradeoffLabel(metricTradeoffs.weather)}</small> : null}</div>
                <div><dt>Air</dt><dd>{meanAqi === null ? "No data" : formatValue(meanAqi, " AQI")}</dd>{meanAqi !== null ? <small>{tradeoffLabel(metricTradeoffs.air)}</small> : null}</div>
                <div><dt>UV</dt><dd>{maxUv === null ? "No data" : maxUv.toFixed(1)}</dd>{maxUv !== null ? <small>{tradeoffLabel(metricTradeoffs.uv)}</small> : null}</div>
              </dl>
            </> : <p>We compare seven days of local weather, air quality, UV, feels-like temperature, and daylight, then pick the lowest-tradeoff outdoor window.</p>}
            <section className="method-breakdown" aria-labelledby="method-breakdown-title">
              {status.kind === "ready" && activeDay && activeHours.length ? <div className="method-breakdown__intro"><h3 id="method-breakdown-title">How we decide</h3><p>We compare daylight hours and choose the lowest total tradeoff. {reasonSummary(activeRatings) ? `${reasonSummary(activeRatings)}.` : "The forecast factors are well balanced."}</p></div> : <h3 id="method-breakdown-title">Data and sources</h3>}
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
      <div className="privacy-note"><p>No account or analytics. Only rounded coordinates leave this device.</p>{location ? <button className="text-button text-button--danger" type="button" onClick={forgetLocation} disabled={forgotten}>{forgotten ? "Removed from recent places" : "Forget this place"}</button> : null}</div>
    </div></dialog>
  </div>;
}
