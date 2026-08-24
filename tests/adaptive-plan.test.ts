import { describe, expect, it } from "vitest";
import { assessAdaptiveDay, isOutdoorBlockingHour, type AdaptivePeriod } from "../src/adaptive-plan";
import type { HourConditions } from "../src/suitability";

function hour(hourNumber: number, overrides: Partial<HourConditions> = {}): HourConditions {
  return {
    time: `2026-08-29T${String(hourNumber).padStart(2, "0")}:00`,
    apparentTemperatureC: 20,
    precipitationProbability: 0,
    weatherCode: 0,
    windGustKph: 8,
    isDay: true,
    usAqi: 24,
    uvIndex: 1,
    ...overrides,
  };
}

function period(id: AdaptivePeriod["id"], score: number, hours: HourConditions[]): AdaptivePeriod {
  return { id, score, hours };
}

describe("adaptive day assessment", () => {
  it("recognizes a consistently favorable whole day", () => {
    const hours = Array.from({ length: 10 }, (_, index) => hour(index + 7));
    const decision = assessAdaptiveDay(hours, [period("morning", 2, hours.slice(0, 2)), period("noon", 5, hours.slice(4, 6)), period("evening", 3, hours.slice(8, 10))], "general");
    expect(decision.allowedModes).toContain("all_day");
    expect(decision.defaultMode).toBe("all_day");
    expect(decision.defaultWindowCount).toBe(3);
  });

  it("offers no token windows during a storm-dominated day", () => {
    const hours = Array.from({ length: 10 }, (_, index) => hour(index + 7, { weatherCode: 95, precipitationProbability: 90, windGustKph: 65 }));
    const decision = assessAdaptiveDay(hours, [period("morning", 35, hours.slice(0, 2)), period("evening", 35, hours.slice(7, 9))], "general");
    expect(decision).toMatchObject({ allowedModes: ["none"], defaultMode: "none", candidateIds: [] });
  });

  it("keeps only similarly worthwhile windows in its fallback", () => {
    const good = Array.from({ length: 5 }, (_, index) => hour(index + 7));
    const blocked = Array.from({ length: 3 }, (_, index) => hour(index + 15, { weatherCode: 63, precipitationProbability: 70 }));
    const decision = assessAdaptiveDay([...good, ...blocked], [period("morning", 5, good.slice(0, 2)), period("noon", 12, good.slice(2, 4)), period("evening", 30, good.slice(3, 5))], "general");
    expect(decision.defaultMode).toBe("windows");
    expect(decision.defaultWindowCount).toBe(2);
    expect(decision.candidateIds).toEqual(["morning", "noon", "evening"]);
  });

  it("does not offer a single narrow window as a practical plan", () => {
    const good = [hour(8), hour(9)];
    const blocked = Array.from({ length: 6 }, (_, index) => hour(index + 10, { weatherCode: 63, precipitationProbability: 70 }));
    const decision = assessAdaptiveDay([...good, ...blocked], [period("morning", 5, good)], "general");
    expect(decision).toMatchObject({ allowedModes: ["none"], defaultMode: "none", defaultWindowCount: 0 });
  });

  it("blocks severe air, weather, wind, and temperature hours", () => {
    expect(isOutdoorBlockingHour(hour(12, { usAqi: 180 }))).toBe(true);
    expect(isOutdoorBlockingHour(hour(12, { weatherCode: 75 }))).toBe(true);
    expect(isOutdoorBlockingHour(hour(12, { windGustKph: 60 }))).toBe(true);
    expect(isOutdoorBlockingHour(hour(12, { apparentTemperatureC: 37 }))).toBe(true);
  });
});
