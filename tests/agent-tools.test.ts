import { describe, expect, it } from "vitest";
import { airQualityEvidence, conditionAnalysis, uvEvidence, weatherEvidence } from "../src/agent-tools.ts";
import type { HourConditions } from "../src/suitability.ts";

const hours: HourConditions[] = [
  { time: "2026-09-10T09:00", apparentTemperatureC: 17, precipitationProbability: 10, weatherCode: 1, windGustKph: 12, isDay: true, usAqi: 42, uvIndex: 2 },
  { time: "2026-09-10T10:00", apparentTemperatureC: 20, precipitationProbability: 65, weatherCode: 61, windGustKph: 44, isDay: true, usAqi: 78, uvIndex: 6 },
  { time: "2026-09-10T11:00", apparentTemperatureC: 19, precipitationProbability: 55, weatherCode: 95, windGustKph: 52, isDay: true, usAqi: null, uvIndex: null },
];

describe("agent tool evidence", () => {
  it("projects independent evidence and deterministic weather hazards", () => {
    expect(weatherEvidence(hours).apparentTemperatureC).toEqual({ low: 17, high: 20 });
    expect(airQualityEvidence(hours)).toMatchObject({ peak: 78, category: "Moderate" });
    expect(uvEvidence(hours)).toMatchObject({ peak: 6, category: "High" });
    expect(conditionAnalysis(hours)).toMatchObject({
      peakPrecipitationProbability: 65,
      peakWindGustKph: 52,
      rainHours: ["2026-09-10T10:00", "2026-09-10T11:00"],
      stormHours: ["2026-09-10T11:00"],
      strongWindHours: ["2026-09-10T10:00", "2026-09-10T11:00"],
    });
  });
});
