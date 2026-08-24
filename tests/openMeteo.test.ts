import { describe, expect, it } from "vitest";
import { customaryUnitsForLocation, parseForecastResponses, roundCoordinate } from "../src/openMeteo.ts";

const weather = {
  timezone: "America/Los_Angeles",
  timezone_abbreviation: "PDT",
  hourly_units: {
    time: "iso8601",
    apparent_temperature: "°C",
    precipitation_probability: "%",
    weather_code: "wmo code",
    wind_gusts_10m: "km/h",
    is_day: "",
  },
  hourly: {
    time: ["2026-08-23T09:00", "2026-08-23T10:00", "2026-08-23T11:00"],
    apparent_temperature: [18, 19, 20],
    precipitation_probability: [5, 10, 15],
    weather_code: [1, 2, 3],
    wind_gusts_10m: [10, 15, 20],
    is_day: [1, 1, 1],
  },
};

const air = {
  hourly_units: { time: "iso8601", us_aqi: "USAQI", uv_index: "" },
  hourly: {
    time: ["2026-08-23T10:00", "2026-08-23T11:00", "2026-08-23T12:00"],
    us_aqi: [40, 45, 50],
    uv_index: [2, 3, 4],
  },
};

describe("Open-Meteo parsing", () => {
  it("parses valid responses and merges by timestamp", () => {
    const result = parseForecastResponses(weather, air);
    expect(result.timezone).toBe("America/Los_Angeles");
    expect(result.conditions).toHaveLength(3);
    expect(result.conditions[0]?.usAqi).toBeNull();
    expect(result.conditions[1]?.usAqi).toBe(40);
    expect(result.conditions[2]?.uvIndex).toBe(3);
  });

  it("keeps null and missing arrays as null", () => {
    const sparseWeather = {
      ...weather,
      hourly: { ...weather.hourly, apparent_temperature: [null, 19, 20], precipitation_probability: undefined },
    };
    const result = parseForecastResponses(sparseWeather, null);
    expect(result.conditions[0]?.apparentTemperatureC).toBeNull();
    expect(result.conditions[0]?.precipitationProbability).toBeNull();
    expect(result.conditions[0]?.usAqi).toBeNull();
  });

  it("rejects malformed array lengths", () => {
    const malformed = { ...weather, hourly: { ...weather.hourly, weather_code: [1] } };
    expect(() => parseForecastResponses(malformed, air)).toThrow(/timestamp count/);
  });

  it("rounds positive, negative, and negative-zero coordinates", () => {
    expect(roundCoordinate(34.145)).toBe(34.15);
    expect(roundCoordinate(-118.146)).toBe(-118.15);
    expect(Object.is(roundCoordinate(-0.001), -0)).toBe(false);
  });

  it("chooses customary weather units from the location before falling back to locale", () => {
    expect(customaryUnitsForLocation({ country: "United States", countryCode: "US" }, "fr-FR")).toBe("imperial");
    expect(customaryUnitsForLocation({ country: "Canada", countryCode: "CA" }, "en-US")).toBe("metric");
    expect(customaryUnitsForLocation({ country: "Puerto Rico" }, "es-ES")).toBe("imperial");
    expect(customaryUnitsForLocation(null, "en-US")).toBe("imperial");
    expect(customaryUnitsForLocation(null, "fr-FR")).toBe("metric");
    expect(customaryUnitsForLocation(null, "not a locale")).toBe("metric");
  });
});
