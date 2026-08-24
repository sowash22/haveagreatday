# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People quickly deciding when to walk, run or hike, cycle, walk a dog, or take children outside. Most checks happen on a phone and should take only a few seconds.

## Product purpose

Have a Great Day is an outdoor planning companion, not just another weather dashboard. It compares the next seven days of local weather, air quality, UV, comfort, and daylight, then uses a small, constrained inference layer to turn that evidence into a short, personal plan for walking, hiking, riding, or spending time outside with children and pets. A usable day always offers two or three daylight windows; a consistently favorable day can still be celebrated as an all-day opportunity, while an impractical day recommends choosing another day. It reduces forecast interpretation without claiming that any hour is universally safe.

## Primary workflow

Choose a place and read one day at a glance. A compact week ribbon shows day names only and lets the user inspect another day with one tap. The app evaluates daylight hours across four dayparts, then constrains the possible answer to defensible outcomes. The inference layer chooses whether an all-day note with two or three practical windows, two or three ranked windows, or an honest “choose another day” message is most useful. Every displayed condition, time, and measurement remains grounded in the app’s forecast calculations, and a deterministic adaptive note appears immediately as the fallback. Recent places stay on the device. Two adjacent disclosures keep supporting context out of the primary task: one reveals the matching measurements and tradeoff method; the other shares the personal story and restraint behind the product. The current photo credit stays quietly visible at the bottom right of the main image.

## Capabilities and constraints

- One best day with all seven days visible and an adaptive answer ranging from no recommendation to an all-day recommendation.
- Activity weighting remains available to agent requests through query parameters, not as customer-facing UI.
- Place search, approximate device location, recent places, an automatic location-aware °C/°F toggle with saved user override, and shareable query parameters.
- Seven-image weather-matched Unsplash scene pools that advance on refresh and day selection, with local fallbacks for remote failures.
- Adaptive conversational planning through the server-only v2 inference endpoint, constrained by deterministic severe-weather, forecast-quality, ranking, and output validation guardrails with an immediate local fallback.
- Metric and imperial display defaults to the location's customary weather unit, then honors a saved user override or explicit query parameter.
- Forecast quality depends on upstream data and is not medical or safety advice.
- No account, advertising, first-party analytics, long-range monthly forecast, or primary-screen data dashboard.

## Product principles

1. Give one clear day with a few practical schedule options, not forecast homework.
2. Keep location effortless to change and the week effortless to scan.
3. Make the outing emotionally tangible without implying forecast certainty.
4. Keep evidence and caveats one disclosure away.
5. Preserve privacy, accessibility, and agent-friendly query parameters.
