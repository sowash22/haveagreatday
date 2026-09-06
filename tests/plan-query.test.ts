import { describe, expect, it } from "vitest";
import { calendarWeekDates, parsePlanQuery, weatherScene } from "../src/plan-query.ts";

describe("plan query", () => {
  it("parses a complete agent request and rejects unsafe coordinates", () => {
    expect(parsePlanQuery(new URLSearchParams("lat=34.15&lon=-118.14&activity=run&time=morning&units=imperial&date=2026-08-24&place=Pasadena"))).toMatchObject({ activity: "run", time: "morning", units: "imperial", date: "2026-08-24", place: "Pasadena" });
    expect(() => parsePlanQuery(new URLSearchParams("lat=91&lon=0"))).toThrow(/lat/);
    expect(() => parsePlanQuery(new URLSearchParams("lat=0&lon=0&date=2026-02-31"))).toThrow(/date/);
  });

  it("matches the scene to forecast weather before activity", () => {
    expect(weatherScene("cycle", 0)).toBe("cycle");
    expect(weatherScene("cycle", 3)).toBe("cycle");
    expect(weatherScene("family", 45)).toBe("cloudy");
    expect(weatherScene("dog", 61)).toBe("rain");
    expect(weatherScene("walk", 75)).toBe("snow");
  });

  it("builds a Monday-through-Sunday calendar week", () => {
    expect(calendarWeekDates("2026-08-27")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    expect(calendarWeekDates("2026-08-27", 1)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
});
