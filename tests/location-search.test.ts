import { describe, expect, it } from "vitest";
import { locationMatchesQuery, rankLocationSuggestions } from "../src/location-search";
import type { LocationChoice } from "../src/openMeteo";

const portland: LocationChoice = { name: "Portland", region: "Oregon", country: "United States", latitude: 45.52, longitude: -122.68 };
const sanFrancisco: LocationChoice = { name: "San Francisco", region: "California", country: "United States", latitude: 37.77, longitude: -122.42 };
const saoPaulo: LocationChoice = { name: "São Paulo", region: "São Paulo", country: "Brazil", latitude: -23.55, longitude: -46.63 };
const locations: LocationChoice[] = [
  portland,
  { name: "Portland", region: "Maine", country: "United States", latitude: 43.66, longitude: -70.25 },
  sanFrancisco,
  saoPaulo,
];

describe("location suggestions", () => {
  it("tolerates a missing letter", () => {
    expect(locationMatchesQuery("portlnd", portland)).toBe(true);
    expect(rankLocationSuggestions("portlnd", locations)[0]?.name).toBe("Portland");
  });

  it("supports partial multi-word names and diacritics", () => {
    expect(locationMatchesQuery("san fran", sanFrancisco)).toBe(true);
    expect(locationMatchesQuery("sao", saoPaulo)).toBe(true);
  });

  it("deduplicates identical coordinates", () => {
    expect(rankLocationSuggestions("portland", [portland, { ...portland }])).toHaveLength(1);
  });
});
