# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People quickly deciding when to walk, run or hike, cycle, walk a dog, or take children outside. Most checks happen on a phone and should take only a few seconds.

## Product purpose

Have a Great Day compares the next seven days of local weather, air quality, UV, temperature, and light conditions, then turns the three strongest windows across Morning, Noon, Evening, and Night into a short, personal plan. It reduces forecast interpretation without claiming that any hour is universally safe.

## Primary workflow

Choose a place and read one day at a glance. A compact week ribbon shows day names only and lets the user inspect another day with one tap. The main answer automatically ranks four parts of the day and presents up to three options as one conversational note, so people see the strongest choice first while retaining schedule flexibility. Each sentence keeps its time, weather condition, feels-like temperature, AQI, UV, and light status grounded in the app’s forecast calculations. A server-only v2 inference call can personalize only the opening and connective phrases; the deterministic note appears immediately and remains as the fallback. Recent places stay on the device. Opening the method disclosure reveals the windows’ combined measurements, an explorable 6 AM to 10 PM fit chart with all three windows highlighted, the tradeoff method, data source, photo credit, and privacy link.

## Capabilities and constraints

- One best day with all seven days visible and up to three clearly ranked windows for the selected day.
- Activity weighting remains available to agent requests through query parameters, not as customer-facing UI.
- Place search, approximate device location, recent places, an automatic location-aware °C/°F toggle with saved user override, and shareable query parameters.
- Seven-image weather-matched Unsplash scene pools that advance on refresh and day selection, with local fallbacks for remote failures.
- A normalized hourly-fit chart that compares weather, air, comfort, and UV without mixing incompatible units.
- Optional conversational wording through the server-only v2 inference endpoint, with strict input and output validation and an immediate deterministic fallback.
- Metric and imperial display defaults to the location's customary weather unit, then honors a saved user override or explicit query parameter.
- Forecast quality depends on upstream data and is not medical or safety advice.
- No account, advertising, first-party analytics, long-range monthly forecast, or primary-screen data dashboard.

## Product principles

1. Give one clear day with a few practical schedule options, not forecast homework.
2. Keep location effortless to change and the week effortless to scan.
3. Make the outing emotionally tangible without implying forecast certainty.
4. Keep evidence and caveats one disclosure away.
5. Preserve privacy, accessibility, and agent-friendly query parameters.
