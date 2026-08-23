import { describe, expect, it } from "vitest";
import { parsePlanQuery } from "../src/plan-query.ts";

describe("plan query", () => {
  it("parses a complete agent request and rejects unsafe coordinates", () => {
    expect(parsePlanQuery(new URLSearchParams("lat=34.15&lon=-118.14&activity=run&time=morning&units=imperial&date=2026-08-24&place=Pasadena"))).toMatchObject({ activity: "run", time: "morning", units: "imperial", date: "2026-08-24", place: "Pasadena" });
    expect(() => parsePlanQuery(new URLSearchParams("lat=91&lon=0"))).toThrow(/lat/);
    expect(() => parsePlanQuery(new URLSearchParams("lat=0&lon=0&date=2026-02-31"))).toThrow(/date/);
  });
});
