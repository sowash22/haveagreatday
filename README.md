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
- The browser calculates every rating locally using the weights and thresholds in [PRD.md](./PRD.md).
- Only profile, units, and an optional recent rounded location are stored locally.

There is no backend, account system, application database, advertising, analytics, or paid AI dependency.

## Static deployment

The GitHub Pages workflow runs tests, creates the Next.js static export, and deploys `out` on pushes to `main`. Enable Pages with “GitHub Actions” as the source in repository settings.

Before a public launch, verify current [Open-Meteo terms](https://open-meteo.com/en/terms), attribution requirements, and service limits.
