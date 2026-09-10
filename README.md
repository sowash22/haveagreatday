# Have a Great Day

Have a Great Day is a free, account-free website that compares weather, air quality, UV, and apparent temperature to find a more favorable two-hour window for outdoor activity.

It ranks relative forecast conditions. It does not declare an hour safe, provide medical advice, or replace official emergency guidance.

## Run locally

```sh
npm install
npm run dev
```

The development server prints its local URL. No API keys or environment variables are required for non-commercial Open-Meteo access.

## Check and build

```sh
npm test
npm run build
```

## How it works

- City search uses the Open-Meteo Geocoding API.
- Coordinates are rounded to two decimal places before forecast requests, local storage, or shared links.
- Weather comes from the Open-Meteo Forecast API.
- U.S. AQI and UV come from the Open-Meteo Air Quality API, with underlying CAMS data attribution as documented by Open-Meteo.
- The browser and public forecast endpoint use the same weights and thresholds in [PRD.md](./PRD.md).
- Only profile, units, and an optional recent rounded location are stored locally.

There is no account system, application database, advertising, or required paid AI dependency.

## Agentic planner

When `OPENAI_API_KEY` is configured, `/api/agent` runs a LangGraph-backed ReAct agent with four tools: weather, air quality, UV index, and deterministic condition analysis. All tools share one forecast load, and the final response must pass the same application validation as the existing `/api/conversation` endpoint.

The browser tries the agent first, keeps `/api/conversation` as its inference fallback, and always retains the immediate deterministic fallback.

### Agent request flow

The browser sends the selected place, date, assessment, candidate windows, and rounded coordinates to `/api/agent`. The route validates that payload, creates a short-lived agent for that request, and gives the agent four zero-argument tools. Tool arguments are empty because the server binds each tool to the already-validated place and date.

The ReAct loop is:

1. `get_weather` reads apparent temperature, WMO weather codes, and daylight.
2. `get_air_quality` reads hourly and peak U.S. AQI.
3. `get_uv_index` reads hourly and peak UV.
4. `analyze_conditions` deterministically identifies rain, snow, storms, and strong wind, then returns the application's allowed modes and ranked windows.
5. The model produces a structured voice response. The existing `parseConversationVoice` validator checks it before anything reaches the UI.

The tools are separate agent capabilities, but they share one lazy `fetchForecast` promise. The provider request is made only when the first tool runs, and later tools reuse the same result. The model may reason over tool results, but the UI never treats model reasoning as forecast evidence: scoring, thresholds, and safety language stay in ordinary application code.

The response includes `_agent` metadata with the framework, ReAct pattern, and tools actually called. The UI uses only the validated voice fields, while the metadata is useful when inspecting the route in a browser or API client.

### Configuration

The agent is optional. Set `OPENAI_API_KEY` to enable it and optionally set `OPENAI_MODEL` to choose the model. If the key is absent, the route returns `503`; the browser then calls `/api/conversation`, followed by its deterministic local fallback. No account, database, or persistent LangGraph checkpoint is required for this demo.

## URLs and agents

Activity, time, units, date, and approximate location are reflected in the URL. Add `format=json` to the same URL for a machine-readable forecast:

```sh
curl 'https://safeday.vercel.app/?format=json&lat=34.15&lon=-118.14&activity=run&time=morning&units=imperial'
```

The same response is available directly at `/api/plan`. `lat` and `lon` are required; `activity`, `time`, `units`, `date`, and `place` are optional.

## Deployment

Vercel builds and deploys the Next.js app on pushes to `main`. The GitHub workflow runs tests and a production build as a second check.

Before a public launch, verify current [Open-Meteo terms](https://open-meteo.com/en/terms), attribution requirements, and service limits.
