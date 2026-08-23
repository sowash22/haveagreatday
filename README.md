# SafeDay

SafeDay is a free, account-free website that compares weather, air quality, UV, and apparent temperature to find a more favorable two-hour window for outdoor activity.

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

There is no account system, application database, advertising, analytics, or paid AI dependency.

## URLs and agents

Activity, time, units, date, and approximate location are reflected in the URL. Add `format=json` to the same URL for a machine-readable forecast:

```sh
curl 'https://safeday.vercel.app/?format=json&lat=34.15&lon=-118.14&activity=run&time=morning&units=imperial'
```

The same response is available directly at `/api/plan`. `lat` and `lon` are required; `activity`, `time`, `units`, `date`, and `place` are optional.

## Deployment

Vercel builds and deploys the Next.js app on pushes to `main`. The GitHub workflow runs tests and a production build as a second check.

Before a public launch, verify current [Open-Meteo terms](https://open-meteo.com/en/terms), attribution requirements, and service limits.
