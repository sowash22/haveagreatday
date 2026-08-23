"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchForecast, ProviderError, roundCoordinate, searchLocations, type ForecastResult, type LocationChoice } from "../openMeteo";
import { ACTIVITIES, TIME_OPTIONS, type Activity } from "../plan-query";
import { recommendDays, type DayPlan, type HourConditions, type HourRating, type Profile, type TimePreference, type Units } from "../suitability";

const ACTIVITY_KEY = "safeday-activity:v1";
const PROFILE_KEY = "safeday-profile";
const UNITS_KEY = "safeday-units";
const LOCATION_KEY = "safeday-location";
const LOCATION_HISTORY_KEY = "safeday-locations:v1";

type Status =
  | { kind: "idle" | "loading" | "ready" }
  | { kind: "error"; title: string; message: string; retry: boolean };

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

function formatWind(kph: number | null, units: Units): string {
  if (kph === null) return "Unavailable";
  return units === "metric" ? `${Math.round(kph)} km/h` : `${Math.round(kph * 0.621371)} mph`;
}

function formatValue(value: number | null, suffix = ""): string {
  return value === null ? "Unavailable" : `${Math.round(value)}${suffix}`;
}

function scoreBand(score: number | null): string {
  if (score === null) return "none";
  return score < 25 ? "favorable" : score < 50 ? "mixed" : score < 75 ? "unfavorable" : "poor";
}

function dayVerdict(score: number | null): string {
  if (score === null) return "No window";
  if (score < 25) return "More favorable";
  if (score < 50) return "Mixed";
  if (score < 75) return "Less favorable";
  return "Poor conditions";
}

function weatherLabel(code: number | null): string {
  if (code === null) return "Weather unavailable";
  if (code <= 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog possible";
  if (code <= 67 || (code >= 80 && code <= 82)) return "Rain possible";
  if (code <= 77 || (code >= 85 && code <= 86)) return "Snow possible";
  return "Storms possible";
}

function selectedRatings(day: DayPlan | undefined): HourRating[] {
  return day?.recommendation.hours.flatMap((index) => day.recommendation.ratings[index] ? [day.recommendation.ratings[index]] : []) ?? [];
}

function selectedHours(day: DayPlan | undefined): HourConditions[] {
  return day?.recommendation.hours.flatMap((index) => day.conditions[index] ? [day.conditions[index]] : []) ?? [];
}

function windowLabel(day: DayPlan | undefined, withDay = false): string {
  const hours = selectedHours(day);
  const start = hours[0]?.time;
  const end = hours.at(-1)?.time;
  if (!start || !end) return "No daylight window available";
  const first = formatTime(start, { ...(withDay ? { weekday: "short" } : {}), hour: "numeric" });
  return `${first} to ${formatTime(nextHour(end), { hour: "numeric" }).replace(/\s/g, " ")}`;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function maxValue(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.max(...present) : null;
}

function reasonSummary(ratings: HourRating[]): string | null {
  const reason = ratings.flatMap((rating) => rating.reasons)[0];
  return reason?.replace(/ contributes \d+ points$/, " is the main tradeoff") ?? null;
}

function ActivityTabs({ name, value, onChange }: { name: string; value: Activity; onChange: (value: Activity) => void }) {
  return <fieldset className="activity-tabs"><legend>What are you planning?</legend><div>{(Object.entries(ACTIVITIES) as Array<[Activity, typeof ACTIVITIES[Activity]]>).map(([key, item]) => <label key={key}><input type="radio" name={name} value={key} aria-label={item.label} checked={value === key} onChange={() => onChange(key)}/><span>{key === "family" ? "Family" : key === "dog" ? "Dog" : item.label}</span></label>)}</div></fieldset>;
}

function Timeline({ day, units }: { day: DayPlan; units: Units }) {
  const selected = day.recommendation.hours;
  const cells = day.conditions.map((hour, index) => ({ hour, rating: day.recommendation.ratings[index], recommended: selected.includes(index) }));
  const [activeIndex, setActiveIndex] = useState(selected[0] ?? 0);
  const active = cells[activeIndex] ?? cells[0];

  if (!active) return <p className="empty-copy">No daylight hours match this time preference.</p>;

  return <div className="hour-browser">
    <div className="hour-grid" role="group" aria-label="Choose an hour to inspect">{cells.map(({ hour, rating, recommended }, index) => <button type="button" className="hour-cell" data-band={scoreBand(rating?.score ?? null)} data-recommended={recommended || undefined} aria-pressed={activeIndex === index} aria-label={`${formatTime(hour.time, { weekday: "long", hour: "numeric" })}, ${recommended ? "recommended window, " : ""}${rating?.label ?? "data unavailable"}`} key={hour.time} onClick={() => setActiveIndex(index)}><time dateTime={hour.time}>{formatTime(hour.time, { hour: "numeric" })}</time><strong>{recommended ? "Best" : rating?.score ?? "N/A"}</strong></button>)}</div>
    <section className="hour-detail" aria-live="polite" aria-label="Selected hour details">
      <div><h3>{formatTime(active.hour.time, { weekday: "long", hour: "numeric" })}</h3><p>{weatherLabel(active.hour.weatherCode)}</p></div>
      <dl><div><dt>Feels like</dt><dd>{formatTemperature(active.hour.apparentTemperatureC, units)}</dd></div><div><dt>U.S. AQI</dt><dd>{formatValue(active.hour.usAqi)}</dd></div><div><dt>UV</dt><dd>{active.hour.uvIndex === null ? "Unavailable" : active.hour.uvIndex.toFixed(1)}</dd></div><div><dt>Rain</dt><dd>{formatValue(active.hour.precipitationProbability, "%")}</dd></div><div><dt>Wind gust</dt><dd>{formatWind(active.hour.windGustKph, units)}</dd></div></dl>
      {active.rating?.incomplete ? <p className="data-note">Missing {active.rating.missing.join(", ")} data.</p> : null}
    </section>
  </div>;
}

export function SafeDayApp() {
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
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [forgotten, setForgotten] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const placeDialog = useRef<HTMLDialogElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const forecastController = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profile = ACTIVITIES[activity].profile;

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
      const nextForecast = await fetchForecast(rounded.latitude, rounded.longitude, controller.signal);
      setForecast(nextForecast);
      setStatus({ kind: "ready" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const offline = !navigator.onLine;
      setStatus({ kind: "error", title: offline ? "You appear to be offline" : error instanceof ProviderError ? `${error.source.charAt(0).toUpperCase() + error.source.slice(1)} data unavailable` : "Forecast unavailable", message: offline ? "Reconnect to the internet, then retry this place." : error instanceof Error ? error.message : "The forecast could not be loaded. Try again.", retry: true });
    }
  }, []);

  useEffect(() => {
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
      if (copyTimer.current) clearTimeout(copyTimer.current);
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
    setSearchMessage("Searching for matching places…");
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

  function changeActivity(nextActivity: Activity) {
    setActivity(nextActivity);
    savePreference(ACTIVITY_KEY, nextActivity);
    savePreference(PROFILE_KEY, ACTIVITIES[nextActivity].profile);
  }

  function changeUnits(nextUnits: Units) {
    setUnits(nextUnits);
    savePreference(UNITS_KEY, nextUnits);
  }

  async function copyShareLink() {
    if (!location) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("success");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
    }
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
  const activeRatings = selectedRatings(activeDay);
  const activeHours = selectedHours(activeDay);
  const alternatives = rankedDays.filter((day) => day.date !== activeDay?.date).slice(0, 2);
  const meanTemperature = average(activeHours.map((hour) => hour.apparentTemperatureC));
  const meanAqi = average(activeHours.map((hour) => hour.usAqi));
  const maxUv = maxValue(activeHours.map((hour) => hour.uvIndex));
  const maxRain = maxValue(activeHours.map((hour) => hour.precipitationProbability));
  const missing = [...new Set(activeRatings.flatMap((rating) => rating.missing))];
  const warnings = forecast ? [...forecast.warnings, ...(missing.length ? [`This window is missing ${missing.join(" and ")} data.`] : [])] : [];
  const activeIsTop = Boolean(activeDay && topDay && activeDay.date === topDay.date);
  const currentDate = localHour.slice(0, 10);
  const tomorrow = currentDate ? new Date(`${currentDate}T12:00:00Z`).getTime() + 86_400_000 : 0;
  const dayName = (date: string, long = false) => date === currentDate ? "Today" : tomorrow && date === new Date(tomorrow).toISOString().slice(0, 10) ? "Tomorrow" : formatTime(`${date}T12:00`, { weekday: long ? "long" : "short" });

  return <>
    <a className="skip-link" href="#main">Skip to planner</a>
    <header className="app-bar-shell"><nav className="app-bar page-shell" aria-label="Primary navigation"><Link className="wordmark" href="/" aria-label="SafeDay home">SafeDay</Link><button className="search-pill" type="button" onClick={openPlaceDialog} aria-haspopup="dialog"><span>{location ? locationLabel(location) : "Choose a place"}</span><kbd>⌘K</kbd></button></nav></header>

    <dialog ref={placeDialog} className="place-dialog" aria-labelledby="place-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}><div className="place-dialog__panel">
      <header><h2 id="place-title">Choose a place</h2><button className="text-button" type="button" onClick={() => placeDialog.current?.close()}>Close</button></header>
      {savedLocations.length > 0 ? <section className="saved-list" aria-labelledby="saved-title"><h3 id="saved-title">Recent places</h3><div>{savedLocations.map((saved) => <button type="button" key={`${saved.latitude}-${saved.longitude}`} onClick={() => chooseLocation(saved)}><span>{saved.name}</span><small>{[saved.region, saved.country].filter(Boolean).join(", ") || `${saved.latitude.toFixed(2)}, ${saved.longitude.toFixed(2)}`}</small></button>)}</div></section> : null}
      <form className="location-form" onSubmit={handleSearch} noValidate><label htmlFor="city">Search for a city or town</label><div className="input-row"><input ref={searchInput} id="city" name="city" type="search" autoComplete="address-level2" enterKeyHint="search" placeholder="Try Pasadena or Portland" aria-describedby="city-help" aria-invalid={searchError || undefined} value={query} onChange={(event) => { setQuery(event.target.value); if (searchError) setSearchError(false); }} required/><button className="button" type="submit" disabled={searching} aria-busy={searching}>{searching ? "Searching…" : "Search"}</button></div><p id="city-help" className={`field-help${searchError ? " field-help--error" : ""}`} role={searchError ? "alert" : undefined}>{searchMessage}</p></form>
      <button className="button button--soft" type="button" onClick={useApproximateLocation} disabled={locating} aria-busy={locating}>{locating ? "Finding you…" : "Use my location"}</button>
      <div className="search-results" aria-live="polite">{searchResults.length > 0 ? <ul>{searchResults.map((result) => <li key={`${result.latitude}-${result.longitude}`}><button type="button" onClick={() => chooseLocation(result)}><span>{result.name}</span><small>{[result.region, result.country].filter(Boolean).join(", ")}</small></button></li>)}</ul> : null}</div>
      <div className="privacy-note"><p>No account or analytics. Only rounded coordinates leave this device.</p>{location ? <button className="text-button text-button--danger" type="button" onClick={forgetLocation} disabled={forgotten}>{forgotten ? "Removed from recent places" : "Forget this place"}</button> : null}</div>
    </div></dialog>

    <main id="main" className="page-shell app-main">
      {status.kind === "idle" ? <section className="welcome"><div className="welcome__copy"><h1>Your next good hour outside.</h1><p>SafeDay looks across the week for a better time to walk, run, ride, take the dog out, or head to the park.</p><div className="welcome__actions"><ActivityTabs name="welcome-activity" value={activity} onChange={changeActivity}/><button className="button" type="button" onClick={openPlaceDialog}>Choose a place</button></div><p className="welcome__note">One recommendation, clear reasons, and nearby alternatives.</p></div><div className="welcome__image"><img src="/outdoor-path.png" alt="People walking, cycling, and taking a dog along a waterfront path" width="1536" height="1024" fetchPriority="high"/></div></section> : null}
      {status.kind === "loading" ? <section className="loading-state" role="status" aria-live="polite"><div className="loading-line"/><h1>Looking across the week.</h1><p>Comparing weather, air, UV, and temperature for your activity.</p></section> : null}
      {status.kind === "error" ? <section className="error-state" role="alert"><h1>{status.title}</h1><p>{status.message}</p><div className="error-actions">{status.retry && location ? <button className="button" type="button" onClick={() => void loadLocation(location)}>Retry forecast</button> : null}<button className="button button--soft" type="button" onClick={openPlaceDialog}>Choose another place</button></div></section> : null}

      {status.kind === "ready" && location && forecast && activeDay ? <div className="planner">
        <section className="recommendation" data-band={scoreBand(activeDay.score)} aria-labelledby="recommendation-title">
          <div className="recommendation__copy">
            <div className="recommendation__context"><span>{activeIsTop ? "Best matching window this week" : `Best matching ${dayName(activeDay.date, true)} window`}</span></div>
            <ActivityTabs name="activity" value={activity} onChange={changeActivity}/>
            <h1 id="recommendation-title">{dayName(activeDay.date, true)},<br/>{windowLabel(activeDay)}.</h1>
            {activeHours.length > 0 ? <><p className="recommendation__reason">{dayVerdict(activeDay.score)} for your {ACTIVITIES[activity].phrase}. {activeIsTop ? "This window has the strongest overall balance for the week." : `This is ${dayName(activeDay.date, true)}'s strongest matching window.`}</p>{reasonSummary(activeRatings) ? <p className="tradeoff">{reasonSummary(activeRatings)}.</p> : null}<dl className="fact-row"><div><dt>Feels like</dt><dd>{formatTemperature(meanTemperature, units)}</dd></div><div><dt>Rain</dt><dd>{formatValue(maxRain, "%")}</dd></div><div><dt>Air</dt><dd>{formatValue(meanAqi, " AQI")}</dd></div><div><dt>UV</dt><dd>{maxUv === null ? "Unavailable" : maxUv.toFixed(1)}</dd></div></dl></> : <p className="empty-copy">Try another time of day or choose one of the available days below.</p>}
            <div className="plan-actions"><button className="text-button" type="button" onClick={() => void copyShareLink()} data-state={copyState === "idle" ? undefined : copyState}>{copyState === "success" ? "Plan link copied" : copyState === "error" ? "Try sharing again" : "Share this plan"}</button><span>Check again before you go.</span></div>
          </div>
          <div className="recommendation__image"><img src="/outdoor-path.png" alt="A calm waterfront path used by walkers, runners, cyclists, families, and dogs" width="1536" height="1024" fetchPriority="high"/></div>
        </section>

        {warnings.length > 0 ? <aside className="data-warning" role="status"><strong>Some inputs are incomplete.</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></aside> : null}

        <details className="preferences"><summary>Adjust time or units</summary><div className="preferences__fields"><label className="select-field" htmlFor="time-preference"><span>Time of day</span><select id="time-preference" value={timePreference} onChange={(event) => setTimePreference(event.target.value as TimePreference)}>{(Object.entries(TIME_OPTIONS) as Array<[TimePreference, string]>).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><fieldset className="unit-fieldset"><legend>Temperature</legend><label><input type="radio" name="units" value="metric" checked={units === "metric"} onChange={() => changeUnits("metric")}/> °C</label><label><input type="radio" name="units" value="imperial" checked={units === "imperial"} onChange={() => changeUnits("imperial")}/> °F</label></fieldset></div></details>

        <section className="week-section" aria-labelledby="week-title"><div className="section-heading"><h2 id="week-title">The week at a glance</h2><p>Choose any day to see its best {TIME_OPTIONS[timePreference].toLowerCase()} window.</p></div><div className="week-strip" role="group" aria-label="Choose a forecast day">{dayPlans.map((day) => <button type="button" key={day.date} data-band={scoreBand(day.score)} data-selected={day.date === activeDay.date || undefined} aria-pressed={day.date === activeDay.date} onClick={() => setSelectedDate(day.date)}><span>{dayName(day.date)}</span><time dateTime={day.date}>{formatTime(`${day.date}T12:00`, { month: "short", day: "numeric" })}</time><strong>{dayVerdict(day.score)}</strong><small>{day.score === null ? "Try another time" : windowLabel(day)}</small></button>)}</div></section>

        <section className="plan-evidence" aria-label="Alternatives and forecast details"><div className="alternatives"><h2>Other options</h2>{alternatives.length ? <div className="alternative-list">{alternatives.map((day) => <button type="button" key={day.date} onClick={() => setSelectedDate(day.date)}><span><strong>{dayName(day.date, true)}</strong><small>{windowLabel(day)}</small></span><span>{dayVerdict(day.score)}</span></button>)}</div> : <p className="empty-copy">No other complete windows match this preference yet.</p>}</div><details className="hourly-details"><summary>See hourly conditions for {dayName(activeDay.date, true)}</summary><div className="hourly-details__body"><Timeline key={`${activeDay.date}-${timePreference}-${activity}`} day={activeDay} units={units}/><details className="method-note"><summary>How the ranking works</summary><p>SafeDay turns each measurement into a 0 to 100 penalty, weights it for your activity, and chooses the lowest average across two consecutive daylight hours. Missing values never count as zero.</p></details></div></details></section>
        <aside className="disclaimer"><strong>Use local guidance too.</strong><p>SafeDay compares forecasts. It is not medical advice, pet or child safety guidance, or an emergency warning service.</p></aside>
        <p className="freshness">Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(forecast.fetchedAt))}. Forecast values can change.</p>
      </div> : null}
    </main>
    <footer className="statement-footer"><div className="page-shell"><p className="statement-footer__line">More good hours outside. Less guessing.</p><div className="statement-footer__meta"><span>SafeDay</span><nav aria-label="Footer navigation"><a href="https://open-meteo.com/" rel="noreferrer">Forecast data</a><Link href="/privacy">Privacy</Link></nav></div></div></footer>
  </>;
}
