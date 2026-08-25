import { describe, expect, it } from "vitest";
import {
  aqiPenalty,
  aqiCategory,
  rateHour,
  recommend,
  recommendDays,
  temperaturePenalty,
  uvPenalty,
  uvCategory,
  uvProtectionAdvice,
  weatherPenalty,
  type HourConditions,
} from "../src/suitability.ts";

const completeHour = (time: string, overrides: Partial<HourConditions> = {}): HourConditions => ({
  time,
  apparentTemperatureC: 20,
  precipitationProbability: 0,
  weatherCode: 0,
  windGustKph: 10,
  isDay: true,
  usAqi: 20,
  uvIndex: 1,
  ...overrides,
});

describe("component penalties", () => {
  it("uses every AQI boundary", () => {
    expect([50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiPenalty)).toEqual([0, 25, 25, 55, 55, 75, 75, 90, 90, 100]);
  });

  it("uses every UV boundary", () => {
    expect([2, 3, 5, 6, 7, 8, 10, 11].map(uvPenalty)).toEqual([0, 30, 30, 55, 55, 80, 80, 100]);
  });

  it("uses public UV and AQI category boundaries", () => {
    expect([2, 3, 5, 6, 7, 8, 10, 11].map(uvCategory)).toEqual(["Low", "Moderate", "Moderate", "High", "High", "Very high", "Very high", "Extreme"]);
    expect([50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiCategory)).toEqual(["Good", "Moderate", "Moderate", "Unhealthy for sensitive groups", "Unhealthy for sensitive groups", "Unhealthy", "Unhealthy", "Very unhealthy", "Very unhealthy", "Hazardous"]);
  });

  it("adds practical protection only when UV reaches three", () => {
    expect(uvProtectionAdvice(null)).toBeNull();
    expect(uvProtectionAdvice(2.9)).toBeNull();
    expect(uvProtectionAdvice(3)).toContain("Sun protection recommended");
    expect(uvProtectionAdvice(6)).toContain("High UV");
    expect(uvProtectionAdvice(8)).toContain("Very high UV");
  });

  it("uses the hot and cold temperature boundaries", () => {
    expect([-5.1, -5, -0.1, 0, 4.9, 5, 9.9, 10, 26, 26.1, 30, 33, 36, 40].map(temperaturePenalty))
      .toEqual([80, 60, 60, 40, 40, 20, 20, 0, 0, 20, 40, 60, 80, 100]);
  });

  it("forces thunderstorm weather to 100", () => {
    expect(weatherPenalty(0, 0, 95)).toBe(100);
    expect(weatherPenalty(0, 0, 96)).toBe(100);
    expect(weatherPenalty(0, 0, 99)).toBe(100);
  });
});

describe("hour rating", () => {
  it("re-normalizes missing data instead of treating it as zero", () => {
    const full = rateHour(completeHour("2026-08-23T10:00", { usAqi: 120 }), "general");
    const missing = rateHour(completeHour("2026-08-23T10:00", { usAqi: 120, uvIndex: null }), "general");
    expect(full.score).toBe(14);
    expect(missing.score).toBe(16);
    expect(missing.missing).toEqual(["uv"]);
  });

  it("does not call fewer than three components more favorable", () => {
    const rating = rateHour(completeHour("2026-08-23T10:00", { usAqi: null, uvIndex: null }), "general");
    expect(rating.score).toBe(0);
    expect(rating.label).toBe("Mixed conditions");
  });
});

describe("recommendation windows", () => {
  it("selects consecutive daylight hours and excludes weather gaps", () => {
    const hours = [
      completeHour("2026-08-23T09:00", { isDay: false }),
      completeHour("2026-08-23T10:00", { precipitationProbability: 70 }),
      completeHour("2026-08-23T11:00", { precipitationProbability: 70 }),
      completeHour("2026-08-23T12:00", { windGustKph: null }),
      completeHour("2026-08-23T13:00", { windGustKph: null }),
    ];
    expect(recommend(hours, "general", "2026-08-23T08:00").hours).toEqual([1, 2]);
  });

  it("selects the earlier window when scores tie", () => {
    const hours = [9, 10, 11, 12].map((hour) => completeHour(`2026-08-23T${hour}:00`));
    expect(recommend(hours, "general", "2026-08-23T08:00").hours).toEqual([0, 1]);
  });

  it("falls back to one daylight hour with a clear limitation", () => {
    const hours = [
      completeHour("2026-08-23T18:00", { isDay: true }),
      completeHour("2026-08-23T19:00", { isDay: false }),
    ];
    const result = recommend(hours, "general", "2026-08-23T17:00");
    expect(result.hours).toEqual([0]);
    expect(result.limited).toBe(true);
  });

  it("can recommend an after-dark window when explicitly requested", () => {
    const hours = [
      completeHour("2026-08-23T20:00", { isDay: false }),
      completeHour("2026-08-23T21:00", { isDay: false }),
    ];
    expect(recommend(hours, "general", "2026-08-23T19:00").hours).toEqual([]);
    expect(recommend(hours, "general", "2026-08-23T19:00", { daylightOnly: false }).hours).toEqual([0, 1]);
  });

  it("builds separate day plans and respects the preferred time of day", () => {
    const hours = [
      completeHour("2026-08-23T09:00", { precipitationProbability: 80 }),
      completeHour("2026-08-23T10:00", { precipitationProbability: 80 }),
      completeHour("2026-08-23T18:00"),
      completeHour("2026-08-23T19:00"),
      completeHour("2026-08-24T18:00", { precipitationProbability: 30 }),
      completeHour("2026-08-24T19:00", { precipitationProbability: 30 }),
    ];

    const plans = recommendDays(hours, "general", "2026-08-23T08:00", "evening");
    expect(plans.map((plan) => plan.date)).toEqual(["2026-08-23", "2026-08-24"]);
    expect(plans[0]?.conditions.map((hour) => hour.time)).toEqual(["2026-08-23T18:00", "2026-08-23T19:00"]);
    expect(plans[0]?.score).toBeLessThan(plans[1]?.score ?? 100);
  });

  it("leaves elapsed days and earlier same-day hours out of the recommendation", () => {
    const hours = [
      completeHour("2026-08-22T16:00"),
      completeHour("2026-08-22T17:00"),
      completeHour("2026-08-23T08:00"),
      completeHour("2026-08-23T09:00"),
      completeHour("2026-08-23T15:00"),
      completeHour("2026-08-23T16:00"),
    ];

    const plans = recommendDays(hours, "general", "2026-08-23T13:00", "any");
    expect(plans[0]?.score).toBeNull();
    expect(plans[1]?.recommendation.hours).toEqual([2, 3]);
    expect(plans[1]?.recommendation.hours.map((index) => plans[1]?.conditions[index]?.time)).toEqual(["2026-08-23T15:00", "2026-08-23T16:00"]);
  });
});
