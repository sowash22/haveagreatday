# SafeDay Implementation Plan

This plan implements the MVP defined in [PRD.md](./PRD.md). It intentionally stops at a static, account-free application.

## 1. Fixed technical decisions

- Vanilla TypeScript, HTML, and CSS
- Vite for development and production builds
- Vitest for the scoring and API-parsing tests
- Browser `fetch`, Geolocation, URL, `Intl`, and `localStorage` APIs
- Direct browser requests to Open-Meteo
- No frontend framework, state library, component library, chart library, backend, or database
- Static deployment target; GitHub Pages is the initial default

If a direct API request becomes unreliable because of CORS or rate limits, add one small caching proxy. Do not add a backend speculatively.

## 2. Proposed repository shape

```text
.
├── index.html
├── package.json
├── README.md
├── PRD.md
├── PLAN.md
├── public/
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── api/
│   │   ├── geocoding.ts
│   │   └── openMeteo.ts
│   ├── domain/
│   │   ├── model.ts
│   │   └── suitability.ts
│   ├── ui/
│   │   ├── app.ts
│   │   └── format.ts
│   ├── main.ts
│   └── styles.css
└── tests/
    ├── openMeteo.test.ts
    └── suitability.test.ts
```

Keep files combined until they become difficult to navigate. The proposed structure is a ceiling, not a requirement to create empty modules.

## 3. Domain contracts

Implement and test these contracts before building the full UI:

```ts
type Profile = "general" | "air" | "temperature" | "strenuous";

type HourConditions = {
  time: string;
  apparentTemperatureC: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  windGustKph: number | null;
  isDay: boolean | null;
  usAqi: number | null;
  uvIndex: number | null;
};

type HourRating = {
  time: string;
  score: number;
  label:
    | "More favorable"
    | "Mixed conditions"
    | "Less favorable"
    | "Poor conditions";
  incomplete: boolean;
  reasons: string[];
  components: {
    air?: number;
    temperature?: number;
    weather?: number;
    uv?: number;
  };
};
```

Do not expose raw provider response objects outside the API adapter.

## 4. Delivery phases

### Phase 0 — project skeleton

- [ ] Initialize the vanilla TypeScript Vite project in the repository root.
- [ ] Add scripts: `dev`, `build`, `test`, and `preview`.
- [ ] Add a minimal semantic page shell.
- [ ] Add base CSS variables, focus styles, and responsive container.
- [ ] Replace the README with setup commands, scope, data sources, and disclaimer.
- [ ] Confirm `npm run build` works before adding features.

Definition of done: a contributor can clone, install, run, test, and build.

### Phase 1 — scoring engine

- [ ] Implement AQI, UV, apparent-temperature, precipitation, wind, and thunderstorm penalties.
- [ ] Implement profile weights exactly as specified in the PRD.
- [ ] Re-normalize weights when a component is missing.
- [ ] Prevent incomplete hours from receiving the most favorable label when fewer than three components exist.
- [ ] Implement two-consecutive-hour window selection.
- [ ] Return the two largest component reasons.

Required tests:

- [ ] EPA AQI boundary values: 50/51, 100/101, 150/151, 200/201, 300/301.
- [ ] UV boundary values: 2/3, 5/6, 7/8, 10/11.
- [ ] Hot and cold apparent-temperature boundaries.
- [ ] Thunderstorm code forces weather penalty to 100.
- [ ] Missing data re-normalizes rather than becoming zero.
- [ ] Fewer than three components cannot produce “More favorable.”
- [ ] Window selection uses consecutive daylight hours.
- [ ] Ties select the earlier window.

Definition of done: the complete recommendation algorithm runs without DOM or network access and its tests pass.

### Phase 2 — API adapters

- [ ] Implement city search with the Open-Meteo Geocoding API.
- [ ] Round all selected coordinates to two decimals.
- [ ] Fetch 24 hours of weather data with `timezone=auto`.
- [ ] Fetch 24 hours of AQI and UV data for the same rounded coordinate.
- [ ] Validate HTTP status, JSON structure, arrays, units, and timestamps.
- [ ] Merge provider arrays by timestamp rather than array index alone.
- [ ] Preserve provider generation/retrieval metadata for the UI.
- [ ] Add an `AbortController` so a new location search cancels older requests.

Required tests:

- [ ] Valid fixtures parse into `HourConditions`.
- [ ] Mismatched timestamps merge correctly.
- [ ] Null and missing arrays remain null.
- [ ] Malformed responses produce a typed user-facing error.
- [ ] Coordinate rounding is stable for positive and negative values.

Definition of done: one function returns validated `HourConditions[]` for a selected location.

### Phase 3 — location flow

- [ ] Build a labeled city search input and submit button.
- [ ] Display selectable geocoding results with city, region, and country.
- [ ] Add a separate “Use approximate location” action.
- [ ] Handle denied or unavailable geolocation without blocking city search.
- [ ] Show that coordinates are rounded and sent directly to the forecast provider.
- [ ] Add “Forget this location.”
- [ ] Read supported query parameters on first load.

Definition of done: users can choose, replace, share, and forget a location without an account.

### Phase 4 — recommendation UI

- [ ] Add the four profile controls as an accessible single-select group.
- [ ] Render the recommended two-hour window and relative-language qualifier.
- [ ] Render the top two reasons.
- [ ] Build the hourly timeline with semantic markup and CSS; do not add a chart dependency.
- [ ] Include numeric values and labels, not color alone.
- [ ] Display incomplete-data markers.
- [ ] Display attribution and retrieval time.
- [ ] Add metric/imperial formatting without changing stored source units.
- [ ] Announce updated results in a polite live region.

Definition of done: the primary flow works at desktop and 320 px width with keyboard navigation.

### Phase 5 — resilience and safety copy

- [ ] Add loading, empty, retry, offline, partial-data, and provider-error states.
- [ ] Add the persistent non-medical disclaimer.
- [ ] Add source links for AQI, UV, weather, and air-quality data.
- [ ] Warn that shared links contain an approximate location.
- [ ] Add print styles.
- [ ] Add a plain-language privacy page.
- [ ] Verify the UI never uses prohibited claims such as “safe” or “risk-free” for an hour.

Definition of done: every error has a recovery path and every recommendation retains its evidence.

### Phase 6 — accessibility and release

- [ ] Test keyboard-only operation.
- [ ] Test VoiceOver or another screen reader through the primary flow.
- [ ] Test 200% zoom, reduced motion, forced colors, and 320 px width.
- [ ] Check contrast and visible focus.
- [ ] Run unit tests and production build.
- [ ] Run Lighthouse against the production build.
- [ ] Verify attribution against current Open-Meteo terms.
- [ ] Add a GitHub Pages deployment workflow.
- [ ] Publish `v0.1.0` and open GitHub Discussions or an issue template for feedback.

Definition of done: all PRD release acceptance criteria pass.

## 5. API request shapes

Use the exact minimum fields required by the MVP.

### Weather

```text
https://api.open-meteo.com/v1/forecast
  ?latitude={roundedLat}
  &longitude={roundedLon}
  &hourly=apparent_temperature,precipitation_probability,weather_code,wind_gusts_10m,is_day
  &forecast_hours=24
  &timezone=auto
```

### Air quality and UV

```text
https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude={roundedLat}
  &longitude={roundedLon}
  &hourly=us_aqi,uv_index
  &forecast_hours=24
  &timezone=auto
```

### Geocoding

```text
https://geocoding-api.open-meteo.com/v1/search
  ?name={encodedQuery}
  &count=5
  &language=en
  &format=json
```

Do not add provider parameters without a user-visible need.

## 6. State model

One application state object is sufficient:

```ts
type AppState = {
  status: "idle" | "searching" | "loading" | "ready" | "error";
  location: LocationChoice | null;
  profile: Profile;
  units: "metric" | "imperial";
  conditions: HourConditions[];
  error: AppError | null;
  fetchedAt: string | null;
};
```

Use normal functions and DOM events. Add a state library only if this object becomes measurably difficult to manage.

## 7. Acceptance test scenarios

### Normal conditions

Given a location with complete forecast data, the application recommends the lowest-scoring consecutive daylight hours and explains the top contributors.

### Air-quality profile

Given two otherwise similar windows, the Air quality profile prefers the lower-AQI window more strongly than the General profile.

### Missing AQI

Given weather and UV data but no AQI, the application marks the result incomplete, re-normalizes remaining weights, and exposes the missing data.

### Thunderstorm

Given a thunderstorm code, the affected hour has a weather penalty of 100 and cannot appear more favorable than a comparable clear hour.

### Nighttime

Given a location near sunset, the recommendation searches forward up to 24 hours and selects the next available consecutive daylight window.

### Network failure

Given a failed provider request, the application names the failed data source, retains the selected location, and offers retry.

### Shared URL

Given a valid shared URL, the app restores rounded coordinates, profile, and units without embedding an address or health data.

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Users interpret the result as a guarantee | Relative labels, persistent disclaimer, visible raw data |
| Air-quality forecast is coarse or unavailable | Show provider resolution/freshness and missing-data state |
| API usage terms change | Verify before launch; keep provider adapter replaceable |
| Direct browser calls hit rate limits | Add a minimal cache only after observed failures |
| Exact location leaks through URLs | Round coordinates; never include an address; warn before sharing |
| Color-coded results exclude users | Text labels, icons, semantic markup, contrast testing |
| Scoring weights are disputed | Publish the algorithm and invite source-linked changes |
| Scope expands into medical advice | Enforce non-goals in review and avoid diagnosis-specific profiles |

## 9. Suggested issue sequence

Create issues only when implementation begins:

1. Scaffold static TypeScript application
2. Implement and test suitability scoring
3. Parse and merge Open-Meteo responses
4. Build city and approximate-location flow
5. Build recommendation card and hourly timeline
6. Add missing-data and failure states
7. Add privacy, attribution, disclaimer, and sharing
8. Complete accessibility verification
9. Add static deployment and release checklist

Avoid separate issues for individual components until multiple contributors need parallel ownership.

## 10. Release commands

The finished project should support:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

## 11. Explicitly deferred

- Backend services
- User accounts
- Push notifications
- Maps
- AI summaries
- React or another UI framework
- Design system packages
- Database persistence
- Native applications
- Complex CI beyond test/build/deploy

Add a deferred item only after user feedback demonstrates that the simple version cannot solve the problem.
