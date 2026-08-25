import { fetchForecast, ProviderError, roundCoordinate } from "../../../openMeteo.ts";
import { ACTIVITIES, calendarWeekDates, parsePlanQuery, PlanQueryError } from "../../../plan-query.ts";
import { recommendDays, type DayPlan, type Units } from "../../../suitability.ts";

export const dynamic = "force-dynamic";

function currentHourInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:00`;
}

function summarize(day: DayPlan, units: Units) {
  const ratings = day.recommendation.hours.flatMap((index) => day.recommendation.ratings[index] ? [day.recommendation.ratings[index]] : []);
  const conditions = day.recommendation.hours.flatMap((index) => day.conditions[index] ? [day.conditions[index]] : []);
  return {
    date: day.date,
    score: day.score,
    label: ratings[0]?.label ?? "No matching window",
    window: conditions.map((hour) => hour.time),
    conditions: conditions.map((hour) => ({
      time: hour.time,
      apparentTemperature: hour.apparentTemperatureC === null ? null : units === "imperial" ? Math.round((hour.apparentTemperatureC * 9 / 5 + 32) * 10) / 10 : hour.apparentTemperatureC,
      precipitationProbability: hour.precipitationProbability,
      weatherCode: hour.weatherCode,
      windGust: hour.windGustKph === null ? null : units === "imperial" ? Math.round(hour.windGustKph * 0.621371 * 10) / 10 : hour.windGustKph,
      usAqi: hour.usAqi,
      uvIndex: hour.uvIndex,
    })),
    reasons: [...new Set(ratings.flatMap((rating) => rating.reasons))],
    limitation: day.recommendation.limitation,
  };
}

export async function GET(request: Request) {
  try {
    const query = parsePlanQuery(new URL(request.url).searchParams);
    const forecast = await fetchForecast(query.latitude, query.longitude);
    const currentLocalHour = currentHourInTimezone(forecast.timezone);
    const calendarDateSet = new Set(calendarWeekDates(currentLocalHour.slice(0, 10)));
    const days = recommendDays(forecast.conditions, ACTIVITIES[query.activity].profile, currentLocalHour, query.time).filter((day) => calendarDateSet.has(day.date));
    const ranked = days.filter((day) => day.score !== null).toSorted((a, b) => (a.score ?? 100) - (b.score ?? 100));
    const selected = query.date ? days.find((day) => day.date === query.date) : ranked[0] ?? days[0];
    if (query.date && !selected) return Response.json({ error: `No forecast is available for ${query.date}.`, availableDates: days.map((day) => day.date) }, { status: 404 });

    return Response.json({
      query: { ...query, latitude: roundCoordinate(query.latitude), longitude: roundCoordinate(query.longitude), activityLabel: ACTIVITIES[query.activity].label },
      units: { apparentTemperature: query.units === "imperial" ? "°F" : "°C", windGust: query.units === "imperial" ? "mph" : "km/h", precipitationProbability: "%", airQuality: "USAQI" },
      timezone: forecast.timezone,
      updatedAt: forecast.fetchedAt,
      recommendation: selected ? summarize(selected, query.units) : null,
      days: days.map((day) => summarize(day, query.units)),
      warnings: forecast.warnings,
      disclaimer: "Forecast comparison only; check local guidance before you go.",
    }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch (error) {
    if (error instanceof PlanQueryError) return Response.json({ error: error.message, example: "/?format=json&lat=34.15&lon=-118.14&activity=run&time=morning&units=imperial" }, { status: 400 });
    const message = error instanceof ProviderError ? error.message : "The forecast could not be loaded.";
    return Response.json({ error: message }, { status: 502 });
  }
}
