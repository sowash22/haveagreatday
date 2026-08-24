# Have a Great Day Product Requirements Document

Status: MVP specification  
Audience: product, design, engineering, and contributors  
Last updated: 2026-08-23

## 1. Summary

Have a Great Day is a free, privacy-respecting website that helps people find the most favorable upcoming window for outdoor activity using weather, air-quality, and UV forecasts.

Have a Great Day does **not** declare conditions safe, provide medical advice, or replace official emergency guidance. It ranks relative outdoor suitability, shows the measurements behind the ranking, and links to the data sources.

The MVP is a static client-side website with no accounts, application database, advertising, analytics, or paid AI dependency.

## 2. Problem

Weather applications expose many measurements but rarely answer the practical question:

> When is the least unfavorable time in the next day for my outdoor activity, and why?

Users currently compare weather, AQI, and UV screens manually. This is especially inconvenient for people who are sensitive to air quality or heat, and for anyone planning strenuous activity.

## 3. Goals

1. Recommend one two-hour outdoor window within the next 24 hours.
2. Explain the recommendation using visible weather, AQI, UV, and temperature data.
3. Support a small set of preference profiles without collecting medical information.
4. Work globally from a city search or approximate device location.
5. Keep user data in the browser and make the calculation inspectable.
6. Remain usable with missing forecast fields and clearly identify data gaps.
7. Meet WCAG 2.2 AA accessibility expectations.

## 4. Non-goals

- Medical diagnosis, treatment, or personalized health advice
- Emergency alerts or guaranteed notification delivery
- Claims that an hour is safe or unsafe
- Accounts, social features, or cloud-saved locations
- Maps, route planning, pollen guidance, or historical analysis
- Native mobile applications
- AI-generated recommendations
- Multiple forecast-provider consensus
- Background push notifications
- A backend or database unless API limits later require a small cache

## 5. Primary users

### General outdoor planner

Wants to walk, garden, commute, or spend time outside when conditions are relatively favorable.

### Air-quality-sensitive user

Wants AQI to have more influence on the ranking. Have a Great Day does not ask for a diagnosis.

### Temperature-sensitive user

Wants hot and cold apparent temperatures to have more influence on the ranking.

### Strenuous-activity user

Plans running, cycling, field sports, or physical work and wants heat and air quality weighted more strongly.

## 6. Product principles

1. **Show evidence before advice.** Every recommendation exposes its inputs.
2. **Prefer relative language.** Use “more favorable,” not “safe.”
3. **Missing is not good.** Never turn unavailable data into a low-risk score.
4. **No account by default.** Preferences and optional recent locations remain local.
5. **Color is supplementary.** Every color state also has text and an icon.
6. **Official guidance wins.** Prominent severe-weather notices override the ranking.
7. **Keep the algorithm boring.** A documented weighted score is easier to audit than an opaque model.

## 7. Core user journey

1. The user opens Have a Great Day.
2. The user searches for a city or explicitly permits approximate device location.
3. Have a Great Day rounds coordinates to two decimal places before requesting forecasts.
4. The user selects one profile: General, Air quality, Temperature, or Strenuous activity.
5. Have a Great Day displays:
   - the recommended two-hour window;
   - the two most important reasons;
   - a 24-hour suitability timeline;
   - hourly apparent temperature, AQI, UV, precipitation, and wind;
   - source attribution and forecast freshness.
6. The user can change profile, units, or location and immediately recalculate.
7. The user can copy a share link containing rounded coordinates, units, and profile. The interface must warn that sharing the link reveals an approximate location.

## 8. Functional requirements

### P0: required for initial release

#### Location

- Search cities through the Open-Meteo Geocoding API.
- Offer browser geolocation only after a user action.
- Round latitude and longitude to two decimal places before forecast requests or URL storage.
- Display the resolved city/region and local timezone.
- Allow the user to change location without reloading.

#### Forecast data

- Fetch 24 forecast hours from Open-Meteo Weather Forecast API.
- Fetch matching hourly AQI and UV data from Open-Meteo Air Quality API.
- Request only these fields:
  - `apparent_temperature`
  - `precipitation_probability`
  - `weather_code`
  - `wind_gusts_10m`
  - `is_day`
  - `us_aqi`
  - `uv_index`
- Use `timezone=auto`.
- Show the retrieval timestamp and provider attribution.
- Treat responses as untrusted input: validate required arrays, lengths, numbers, and timestamps.

#### Profiles

- General
- Air quality
- Temperature
- Strenuous activity
- Only one profile can be active.
- Store the selected profile and unit preference in `localStorage`.

#### Recommendation

- Calculate an hourly penalty from 0 to 100.
- Select the consecutive two-hour daylight window with the lowest mean penalty.
- Consider only hours starting after the current local hour and within the next 24 hours.
- Break ties by selecting the earlier window.
- If fewer than two consecutive daylight hours exist, rank all available hours and explain the limitation.
- Display the largest two penalty contributors as reasons.

#### Timeline

- Display the next 24 hours in local time.
- Show score label, apparent temperature, AQI, UV, precipitation probability, and wind gust.
- Make the recommended hours identifiable without color.
- Support horizontal scrolling on narrow screens without hiding the summary.

#### Sharing

- Encode rounded latitude, rounded longitude, profile, and units in query parameters.
- Do not encode a street address, exact device coordinates, or health information.
- Provide a copy-link button and a native print stylesheet.

#### Failure states

- Location not found
- Permission denied
- Network unavailable
- Provider error or rate limit
- Partial forecast data
- Stale cached data
- No two-hour daylight window
- Every failure state includes a retry or recovery action.

### P1: after the MVP is stable

- U.S. National Weather Service active alerts for U.S. coordinates
- Installable PWA and last-result offline view
- Metric/imperial unit auto-detection with manual override
- Additional languages using maintained static translations
- Printable caregiver/school view
- Optional pollen information where provider coverage exists

## 9. Suitability calculation

The score is a product heuristic for relative ranking, not a medical or occupational safety standard.

### 9.1 Component penalties

Each available component produces a value from 0 to 100.

#### Air quality penalty

Use the U.S. AQI categories published by EPA/AirNow:

| U.S. AQI | EPA category | Penalty |
|---:|---|---:|
| 0–50 | Good | 0 |
| 51–100 | Moderate | 25 |
| 101–150 | Unhealthy for sensitive groups | 55 |
| 151–200 | Unhealthy | 75 |
| 201–300 | Very unhealthy | 90 |
| 301+ | Hazardous | 100 |

Source: [AirNow AQI Basics](https://www.airnow.gov/aqi/aqi-basics/).

#### UV penalty

| UV index | EPA grouping | Penalty |
|---:|---|---:|
| 0–2 | Low | 0 |
| 3–5 | Moderate | 30 |
| 6–7 | High | 55 |
| 8–10 | Very high | 80 |
| 11+ | Extreme | 100 |

Source: [U.S. EPA UV Index Scale](https://www.epa.gov/sunsafety/uv-index-scale-0). Have a Great Day may use finer bands for ranking while preserving EPA-facing labels.

#### Apparent-temperature penalty

These bands are Have a Great Day ranking heuristics, not health guidance:

| Apparent temperature | Penalty |
|---|---:|
| 10–26 °C / 50–79 °F | 0 |
| 5–9 °C or 27–29 °C | 20 |
| 0–4 °C or 30–32 °C | 40 |
| −5 to −1 °C or 33–35 °C | 60 |
| below −5 °C or 36–39 °C | 80 |
| 40 °C / 104 °F or above | 100 |

Do not attach health-action language to these internal bands.

#### Weather penalty

Calculate each sub-penalty and use the maximum:

- Precipitation: use probability percentage, capped at 80.
- Wind gusts: 0 at or below 20 km/h; 25 at 30; 50 at 40; 75 at 50; 100 at 60 or above, linearly interpolated.
- Thunderstorm weather codes `95`, `96`, and `99`: 100.

### 9.2 Profile weights

| Profile | Air | Temperature | Weather | UV |
|---|---:|---:|---:|---:|
| General | 25% | 25% | 35% | 15% |
| Air quality | 50% | 20% | 20% | 10% |
| Temperature | 25% | 45% | 20% | 10% |
| Strenuous activity | 35% | 35% | 20% | 10% |

### 9.3 Missing data

- Re-normalize weights across available components.
- Mark an hour as incomplete when any component is missing.
- Show the missing component beside the score.
- If fewer than three of four components are available, do not label the hour “More favorable.”
- If weather data is missing, exclude that hour from the recommended window.

### 9.4 Display bands

| Score | Label |
|---:|---|
| 0–24 | More favorable |
| 25–49 | Mixed conditions |
| 50–74 | Less favorable |
| 75–100 | Poor conditions |

The interface must say “relative to the next 24 hours” near the recommended window.

## 10. Data sources and terms

### MVP sources

- [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs)
- [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)

Open-Meteo states that API keys are not required for non-commercial access. Before public launch, re-check current usage terms, rate limits, and attribution requirements. Air-quality attribution must reference Open-Meteo and the CAMS data providers as required by the API documentation.

### P1 U.S. source

- [National Weather Service API](https://www.weather.gov/documentation/services-web-api)

Official alerts must be displayed separately and must not be folded into an opaque score.

## 11. Safety and content requirements

- Persistent disclaimer: “Have a Great Day compares forecast conditions. It is not medical advice or an emergency warning service.”
- Link to official provider details for AQI and UV categories.
- Never say “You should go outside,” “safe,” “risk-free,” or “danger-free.”
- Never infer a diagnosis from profile selection.
- Never ask for medications, symptoms, age, or health history.
- During an official severe alert, show the alert above the recommendation.
- Forecast freshness must always be visible.
- When data conflicts or is incomplete, say so plainly.

## 12. Privacy requirements

- No application accounts or server-side user profiles.
- No advertising, fingerprinting, session replay, or third-party analytics.
- Round coordinates to two decimal places before forecast requests and persistence.
- Store only profile, units, and an optional recent rounded location in `localStorage`.
- Provide “Forget this location” beside saved-location controls.
- Explain that forecast providers receive the rounded coordinates or city query.
- Shared links reveal an approximate location; warn before copying.
- Add a short, plain-language privacy page before launch.

## 13. Accessibility requirements

- Meet WCAG 2.2 AA for the primary flow.
- Full keyboard operation and visible focus.
- Semantic headings, form labels, status messages, and table/timeline structure.
- Minimum 44×44 CSS pixel pointer targets where practical.
- Do not rely on color alone.
- Respect reduced-motion and high-contrast preferences.
- Announce updated recommendations through a polite live region.
- Support 200% zoom and 320 CSS pixel width without losing functionality.

## 14. Visual direction

- Calm public-service aesthetic rather than a gamified health score.
- One prominent recommendation card followed by evidence.
- Use neutral language and restrained color.
- Prefer native controls, CSS, and lightweight inline SVG.
- No map, charting library, carousel, animation framework, or component library in the MVP.

## 15. Release acceptance criteria

The MVP is ready when:

1. A user can search for a city and receive a recommendation without an account.
2. Profile changes recalculate locally without another API request.
3. Each hourly rating is reproducible from documented inputs and weights.
4. Missing AQI or UV data is visible and never silently treated as favorable.
5. The interface works at 320 px width and with keyboard-only navigation.
6. Unit, algorithm, parsing, and missing-data tests pass.
7. Provider attribution, privacy explanation, disclaimer, and freshness are visible.
8. Lighthouse accessibility, best-practices, and SEO scores are at least 95 on the release build.
9. A contributor can run and build the project using only the README.

## 16. Public-good success definition

Have a Great Day succeeds if it is trustworthy, forkable, and useful without collecting user data. Initial evidence should come from GitHub issues, community feedback, accessibility review, and documented deployments—not invasive analytics.

## 17. Later opportunities

Only consider these after the MVP is used and trusted:

- Community-maintained translations
- Region-specific official warning adapters
- School or caregiver printable summaries
- Anonymous, opt-in reliability telemetry
- Self-hosted API caching for heavy public traffic
- Open scoring specification reusable by other civic projects
