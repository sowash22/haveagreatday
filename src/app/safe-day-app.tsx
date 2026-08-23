"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchForecast, ProviderError, roundCoordinate, searchLocations, type ForecastResult, type LocationChoice } from "../openMeteo";
import { PROFILES, recommend, type HourConditions, type HourRating, type Profile, type Units } from "../suitability";

const PROFILE_KEY = "safeday-profile";
const UNITS_KEY = "safeday-units";
const LOCATION_KEY = "safeday-location";

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

function saveLocation(location: LocationChoice): void {
  try { localStorage.setItem(LOCATION_KEY, JSON.stringify({ latitude: location.latitude, longitude: location.longitude })); } catch { /* Forecasts do not require persistence. */ }
}

function readSavedLocation(): LocationChoice | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown };
    if (typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number") return null;
    return { name: "Saved approximate location", region: "", country: "", latitude: roundCoordinate(parsed.latitude), longitude: roundCoordinate(parsed.longitude) };
  } catch {
    return null;
  }
}

function sharedLocation(params: URLSearchParams): LocationChoice | null {
  if (!params.has("lat") || !params.has("lon")) return null;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { name: "Shared approximate location", region: "", country: "", latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
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
  if (celsius === null) return "—";
  return units === "metric" ? `${Math.round(celsius)} °C` : `${Math.round(celsius * 9 / 5 + 32)} °F`;
}

function formatWind(kph: number | null, units: Units): string {
  if (kph === null) return "—";
  return units === "metric" ? `${Math.round(kph)} km/h` : `${Math.round(kph * 0.621371)} mph`;
}

function formatValue(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${Math.round(value)}${suffix}`;
}

function scoreBand(score: number): string {
  return score < 25 ? "favorable" : score < 50 ? "mixed" : score < 75 ? "unfavorable" : "poor";
}

function reasonSummary(ratings: HourRating[]): string[] {
  const reasons = new Map<string, { total: number; count: number }>();
  ratings.flatMap((rating) => rating.reasons).forEach((reason) => {
    const match = reason.match(/^(.*) contributes (\d+) points$/);
    if (!match?.[1] || !match[2]) return;
    const current = reasons.get(match[1]) ?? { total: 0, count: 0 };
    reasons.set(match[1], { total: current.total + Number(match[2]), count: current.count + 1 });
  });
  return [...reasons.entries()]
    .map(([name, value]) => ({ name, average: Math.round(value.total / value.count) }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 2)
    .map((item) => `${item.name}: ${item.average} penalty points`);
}

function Timeline({ conditions, ratings, selected, units }: { conditions: HourConditions[]; ratings: HourRating[]; selected: number[]; units: Units }) {
  const cells = conditions.map((hour, index) => ({ hour, rating: ratings[index], recommended: selected.includes(index) }));
  const row = (label: string, values: ReactNode[]) => (
    <tr><th scope="row">{label}</th>{values.map((value, index) => <td key={`${label}-${conditions[index]?.time}`}>{value}</td>)}</tr>
  );
  return (
    <div className="timeline-scroll" tabIndex={0} aria-label="Scrollable 24-hour forecast table">
      <table className="timeline">
        <thead><tr><th scope="col">Measure</th>{cells.map(({ hour, rating, recommended }) => (
          <th scope="col" className={recommended ? "is-recommended" : undefined} key={hour.time}>
            <time dateTime={hour.time}>{formatTime(hour.time, { weekday: "short", hour: "numeric" })}</time>
            {recommended && <strong>Recommended</strong>}
            <span>{rating?.label ?? "Unavailable"}</span>
          </th>
        ))}</tr></thead>
        <tbody>
          {row("Penalty", cells.map(({ rating }) => rating ? <>{rating.score}<small>{rating.incomplete ? `Missing ${rating.missing.join(", ")}` : "Complete"}</small></> : "—"))}
          {row("Feels like", cells.map(({ hour }) => formatTemperature(hour.apparentTemperatureC, units)))}
          {row("U.S. AQI", cells.map(({ hour }) => formatValue(hour.usAqi)))}
          {row("UV index", cells.map(({ hour }) => hour.uvIndex === null ? "—" : hour.uvIndex.toFixed(1)))}
          {row("Rain chance", cells.map(({ hour }) => formatValue(hour.precipitationProbability, "%")))}
          {row("Wind gust", cells.map(({ hour }) => formatWind(hour.windGustKph, units)))}
        </tbody>
      </table>
    </div>
  );
}

export function SafeDayApp() {
  const [profile, setProfile] = useState<Profile>("general");
  const [units, setUnits] = useState<Units>("metric");
  const [location, setLocation] = useState<LocationChoice | null>(null);
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
  const searchController = useRef<AbortController | null>(null);
  const forecastController = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLocation = useCallback(async (choice: LocationChoice) => {
    const rounded = { ...choice, latitude: roundCoordinate(choice.latitude), longitude: roundCoordinate(choice.longitude) };
    setLocation(rounded);
    setForecast(null);
    setSearchResults([]);
    setForgotten(false);
    saveLocation(rounded);
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
      setStatus({
        kind: "error",
        title: offline ? "You appear to be offline" : error instanceof ProviderError ? `${error.source.charAt(0).toUpperCase() + error.source.slice(1)} data unavailable` : "Forecast unavailable",
        message: offline ? "Reconnect to the internet, then retry this location. SafeDay does not keep forecast data on a server." : error instanceof Error ? error.message : "The forecast could not be loaded. Try again.",
        retry: true,
      });
    }
  }, []);

  useEffect(() => {
    const storedProfile = readChoice<Profile>(PROFILE_KEY, ["general", "air", "temperature", "strenuous"], "general");
    const storedUnits = readChoice<Units>(UNITS_KEY, ["metric", "imperial"], "metric");
    const params = new URLSearchParams(window.location.search);
    const requestedProfile = params.get("profile");
    const requestedUnits = params.get("units");
    const initialProfile = requestedProfile && Object.hasOwn(PROFILES, requestedProfile) ? requestedProfile as Profile : storedProfile;
    const initialUnits = requestedUnits === "metric" || requestedUnits === "imperial" ? requestedUnits : storedUnits;
    setProfile(initialProfile);
    setUnits(initialUnits);
    savePreference(PROFILE_KEY, initialProfile);
    savePreference(UNITS_KEY, initialUnits);
    const initialLocation = sharedLocation(params) ?? readSavedLocation();
    if (initialLocation) void loadLocation(initialLocation);
    return () => {
      searchController.current?.abort();
      forecastController.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [loadLocation]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const place = query.trim();
    if (place.length < 2) {
      setSearchError(true);
      setSearchMessage("The place name is too short. Enter at least two characters.");
      return;
    }
    setSearchError(false);
    setSearchMessage("Searching Open-Meteo for matching places…");
    setSearching(true);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    try {
      const results = await searchLocations(place, controller.signal);
      setSearchResults(results);
      setSearchMessage(results.length ? `${results.length} matching ${results.length === 1 ? "place" : "places"}.` : "No matching places. Check the spelling or try a nearby city.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSearchError(true);
      setSearchMessage(error instanceof Error ? error.message : "The location search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function useApproximateLocation() {
    if (!navigator.geolocation) {
      setStatus({ kind: "error", title: "Location access is unavailable", message: "This browser does not provide device location. Search for a nearby city instead.", retry: false });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void loadLocation({ name: "Approximate device location", region: "", country: "", latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (error) => {
        setLocating(false);
        setStatus({
          kind: "error",
          title: "Location unavailable",
          message: error.code === error.PERMISSION_DENIED ? "Location permission was denied. Allow it in browser settings or search for a city instead." : "Your approximate location could not be read. Search for a nearby city or try again.",
          retry: false,
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function changeProfile(nextProfile: Profile) {
    setProfile(nextProfile);
    savePreference(PROFILE_KEY, nextProfile);
  }

  function changeUnits(nextUnits: Units) {
    setUnits(nextUnits);
    savePreference(UNITS_KEY, nextUnits);
  }

  async function copyShareLink() {
    if (!location) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ lat: location.latitude.toFixed(2), lon: location.longitude.toFixed(2), profile, units }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyState("success");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
    }
  }

  function forgetLocation() {
    try { localStorage.removeItem(LOCATION_KEY); } catch { /* Nothing else to clear. */ }
    setForgotten(true);
  }

  const recommendation = forecast ? recommend(forecast.conditions, profile, currentHourInTimezone(forecast.timezone)) : null;
  const selectedRatings = recommendation?.hours.flatMap((index) => recommendation.ratings[index] ? [recommendation.ratings[index]] : []) ?? [];
  const selectedHours = recommendation?.hours.flatMap((index) => forecast?.conditions[index] ? [forecast.conditions[index]] : []) ?? [];
  const meanScore = selectedRatings.length ? Math.round(selectedRatings.reduce((sum, rating) => sum + rating.score, 0) / selectedRatings.length) : null;
  const missing = [...new Set(selectedRatings.flatMap((rating) => rating.missing))];
  const start = selectedHours[0]?.time;
  const end = selectedHours.at(-1)?.time;
  const windowLabel = start && end ? `${formatTime(start, { weekday: "short", hour: "numeric" })}–${formatTime(nextHour(end), { hour: "numeric" }).replace(/\s/g, " ")}` : "No daylight window available";
  const warnings = forecast ? [...forecast.warnings, ...(missing.length ? [`Recommended ${missing.join(" and ")} data is incomplete.`] : [])] : [];

  return (
    <>
      <a className="skip-link" href="#main">Skip to forecast</a>
      <header className="site-header page-shell">
        <Link className="wordmark" href="/" aria-label="SafeDay home">SafeDay</Link>
        <Link className="header-link" href="/privacy">Privacy</Link>
      </header>
      <main id="main" className="page-shell">
        <section className="intro" aria-labelledby="intro-title">
          <div><h1 id="intro-title">Find a better time outside.</h1></div>
          <p>Compare the next day’s weather, air quality, UV, and apparent temperature. SafeDay ranks relative conditions; it never declares an hour safe.</p>
        </section>
        <aside className="disclaimer" aria-label="Important information">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 2.7 20h18.6L12 3Zm0 6v5m0 3v.1" /></svg>
          <p><strong>Forecast comparison only.</strong> SafeDay is not medical advice or an emergency warning service. Follow official local guidance.</p>
        </aside>
        <section className="finder" aria-labelledby="finder-title">
          <div className="section-heading"><h2 id="finder-title">Choose a place</h2><p>Your city query or rounded coordinates go directly to Open-Meteo. No account, ads, or analytics.</p></div>
          <form className="location-form" onSubmit={handleSearch} noValidate>
            <div className="field">
              <label htmlFor="city">City or town</label>
              <div className="input-row">
                <input id="city" name="city" type="search" autoComplete="address-level2" placeholder="e.g. Pasadena" aria-describedby="city-help" aria-invalid={searchError || undefined} value={query} onChange={(event) => { setQuery(event.target.value); if (searchError) { setSearchError(false); setSearchMessage("Search worldwide, then choose the matching place."); } }} required />
                <button className="button button--primary" type="submit" disabled={searching} aria-busy={searching}>{searching ? "Loading…" : "Search"}</button>
              </div>
              <p id="city-help" className={`field-help${searchError ? " field-help--error" : ""}`}>{searchMessage}</p>
            </div>
            <span className="form-separator" aria-hidden="true">or</span>
            <button className="button button--secondary" type="button" onClick={useApproximateLocation} disabled={locating} aria-busy={locating}>
              {!locating && <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>}
              {locating ? "Loading…" : "Use approximate location"}
            </button>
          </form>
          <div className="search-results" aria-live="polite">
            {searchResults.length > 0 && <><p className="results-label">Choose a place</p><ul>{searchResults.map((result) => <li key={`${result.latitude}-${result.longitude}`}><button type="button" onClick={() => void loadLocation(result)}><span>{result.name}</span><small>{[result.region, result.country].filter(Boolean).join(", ")}</small></button></li>)}</ul></>}
            {!searching && searchResults.length === 0 && searchMessage.startsWith("No matching") && <div className="no-results"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><p>No places matched this search. Try a nearby city or use your approximate location.</p></div>}
          </div>
        </section>
        <section className="workspace" aria-labelledby="forecast-title">
          {status.kind !== "ready" && <div className="app-status" role="status" aria-live="polite">
            {status.kind === "loading" ? <><div className="skeleton skeleton--mark" aria-hidden="true"/><div className="skeleton-lines" aria-hidden="true"><span/><span/><span/></div><p className="visually-hidden">Loading forecast…</p></> : status.kind === "error" ? <><div className="error-mark" aria-hidden="true">×</div><div><h2 id="forecast-title">{status.title}</h2><p>{status.message}</p>{status.retry && location ? <button className="button button--secondary" type="button" onClick={() => void loadLocation(location)}>Retry forecast</button> : <a className="text-link" href="#city">Search for a city</a>}</div></> : <><div className="empty-mark" aria-hidden="true">24h</div><div><h2 id="forecast-title">Your forecast will appear here</h2><p>Search for a city or use your approximate location to compare the next 24 hours.</p></div></>}
          </div>}
          {status.kind === "ready" && location && forecast && recommendation && <div>
            <div className="forecast-toolbar"><div><p className="location-name">{locationLabel(location)}</p><p>{location.latitude.toFixed(2)}, {location.longitude.toFixed(2)} · {forecast.timezone} ({forecast.timezoneAbbreviation})</p></div><div className="toolbar-actions"><button className="text-button" type="button" onClick={forgetLocation} disabled={forgotten}>{forgotten ? "Location forgotten" : "Forget this location"}</button><button className="text-button" type="button" onClick={() => { document.getElementById("city")?.focus(); document.getElementById("city")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); }}>Change place</button></div></div>
            <section className="settings" aria-labelledby="settings-title"><div className="section-heading section-heading--compact"><h2 id="settings-title">Tune the comparison</h2><p>Changing these controls recalculates locally. It does not fetch again.</p></div><div className="settings-grid"><fieldset className="profile-fieldset"><legend>Activity profile</legend><div className="profile-grid">{(Object.entries(PROFILES) as Array<[Profile, typeof PROFILES[Profile]]>).map(([value, item]) => <label className="choice-card" key={value}><input type="radio" name="profile" value={value} checked={profile === value} onChange={() => changeProfile(value)} /><span><strong>{item.name}</strong><small>{item.description}</small></span></label>)}</div></fieldset><fieldset className="units-fieldset"><legend>Units</legend><div className="unit-options"><label><input type="radio" name="units" value="metric" checked={units === "metric"} onChange={() => changeUnits("metric")} /> Metric</label><label><input type="radio" name="units" value="imperial" checked={units === "imperial"} onChange={() => changeUnits("imperial")} /> Imperial</label></div></fieldset></div></section>
            <section className="recommendation" aria-labelledby="forecast-title" aria-live="polite"><div className="recommendation-score" data-band={meanScore === null ? "none" : scoreBand(meanScore)}><span>{meanScore ?? "—"}</span><small>penalty / 100</small></div><div className="recommendation-copy"><p className="relative-label">Most favorable relative to the next 24 hours</p><h2 id="forecast-title">{windowLabel}</h2>{recommendation.limitation && <p className="limitation"><strong>Limited result:</strong> {recommendation.limitation}</p>}{selectedRatings.length > 0 && <ul className="reason-list">{reasonSummary(selectedRatings).map((reason) => <li key={reason}>{reason}</li>)}</ul>}{warnings.length > 0 && <div className="data-warning"><strong>Incomplete data</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}</div><div className="recommendation-actions"><p>The share link includes this approximate location.</p><button className="button button--primary" type="button" onClick={() => void copyShareLink()} data-state={copyState === "idle" ? undefined : copyState}>{copyState === "success" ? "Copied" : copyState === "error" ? "Copy failed—retry" : "Copy share link"}</button><button className="button button--secondary" type="button" onClick={() => window.print()}>Print forecast</button></div></section>
            <section className="timeline-section" aria-labelledby="timeline-title"><div className="section-heading"><h2 id="timeline-title">Hourly evidence</h2><p>Scroll the table horizontally. “Recommended” text identifies the selected {recommendation.hours.length === 1 ? "hour" : "hours"} without relying on color.</p></div><Timeline conditions={forecast.conditions} ratings={recommendation.ratings} selected={recommendation.hours} units={units} /><p className="freshness">Retrieved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(forecast.fetchedAt))}. Forecast values can change.</p></section>
            <aside className="method-note"><h2>How the ranking works</h2><p>SafeDay converts each measurement into a 0–100 penalty, applies the selected profile’s weights, and picks the lowest mean across two consecutive daylight hours. Missing values never become zero; remaining weights are re-normalized.</p><ul className="source-links"><li><a href="https://www.airnow.gov/aqi/aqi-basics/" rel="noreferrer">AQI categories</a></li><li><a href="https://www.epa.gov/sunsafety/uv-index-scale-0" rel="noreferrer">UV categories</a></li><li><a href="https://open-meteo.com/en/docs" rel="noreferrer">Weather docs</a></li><li><a href="https://open-meteo.com/en/docs/air-quality-api" rel="noreferrer">Air quality &amp; CAMS</a></li></ul></aside>
          </div>}
        </section>
      </main>
      <footer className="site-footer page-shell"><p><span>SafeDay</span><span aria-hidden="true">·</span><a href="https://open-meteo.com/" rel="noreferrer">Forecasts by Open-Meteo</a><span aria-hidden="true">·</span><Link href="/privacy">Privacy</Link></p></footer>
    </>
  );
}
