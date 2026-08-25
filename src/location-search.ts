import type { LocationChoice } from "./openMeteo";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(first: string, second: string): number {
  if (!first.length) return second.length;
  if (!second.length) return first.length;
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = first[firstIndex - 1] === second[secondIndex - 1]
        ? previous[secondIndex - 1] ?? 0
        : 1 + Math.min(previous[secondIndex - 1] ?? 0, previous[secondIndex] ?? secondIndex, current[secondIndex - 1] ?? firstIndex);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length] ?? first.length;
}

function similarity(first: string, second: string): number {
  const longest = Math.max(first.length, second.length);
  return longest === 0 ? 1 : 1 - editDistance(first, second) / longest;
}

function locationText(location: LocationChoice): string {
  return normalize([location.name, location.region, location.country].filter(Boolean).join(" "));
}

export function locationMatchScore(query: string, location: LocationChoice): number {
  const needle = normalize(query);
  const name = normalize(location.name);
  const full = locationText(location);
  if (!needle) return 0;
  if (name === needle) return 1;
  if (name.startsWith(needle)) return 0.96;
  if (full.startsWith(needle)) return 0.94;

  const words = full.split(" ");
  if (words.some((word) => word.startsWith(needle))) return 0.9;
  if (name.includes(needle)) return 0.86;
  if (full.includes(needle)) return 0.82;

  return Math.max(similarity(needle, name), ...words.map((word) => similarity(needle, word)));
}

export function locationMatchesQuery(query: string, location: LocationChoice): boolean {
  return locationMatchScore(query, location) >= 0.58;
}

export function rankLocationSuggestions(query: string, locations: LocationChoice[], limit = 6): LocationChoice[] {
  const unique = new Map<string, LocationChoice>();
  for (const location of locations) {
    const key = `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
    if (!unique.has(key)) unique.set(key, location);
  }
  return [...unique.values()]
    .map((location, index) => ({ location, index, score: locationMatchScore(query, location) }))
    .toSorted((first, second) => second.score - first.score || first.index - second.index)
    .slice(0, limit)
    .map(({ location }) => location);
}
