export type Profile = "general" | "air" | "temperature" | "strenuous";
export type Units = "metric" | "imperial";
export type TimePreference = "any" | "morning" | "afternoon" | "evening";

export type HourConditions = {
  time: string;
  apparentTemperatureC: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  windGustKph: number | null;
  isDay: boolean | null;
  usAqi: number | null;
  uvIndex: number | null;
};

export type ComponentName = "air" | "temperature" | "weather" | "uv";

export type HourRating = {
  time: string;
  score: number;
  label: "More favorable" | "Mixed conditions" | "Less favorable" | "Poor conditions";
  incomplete: boolean;
  reasons: string[];
  missing: ComponentName[];
  components: Partial<Record<ComponentName, number>>;
};

export type Recommendation = {
  ratings: HourRating[];
  hours: number[];
  limited: boolean;
  limitation: string | null;
};

export type DayPlan = {
  date: string;
  conditions: HourConditions[];
  recommendation: Recommendation;
  score: number | null;
};

export const PROFILE_WEIGHTS: Record<Profile, Record<ComponentName, number>> = {
  general: { air: 0.25, temperature: 0.25, weather: 0.35, uv: 0.15 },
  air: { air: 0.5, temperature: 0.2, weather: 0.2, uv: 0.1 },
  temperature: { air: 0.25, temperature: 0.45, weather: 0.2, uv: 0.1 },
  strenuous: { air: 0.35, temperature: 0.35, weather: 0.2, uv: 0.1 },
};

export const PROFILES: Record<Profile, { name: string; description: string }> = {
  general: { name: "General", description: "Balanced across all conditions" },
  air: { name: "Air quality", description: "Gives AQI the most influence" },
  temperature: { name: "Temperature", description: "Emphasizes apparent temperature" },
  strenuous: { name: "Strenuous activity", description: "Emphasizes heat and air quality" },
};

export function aqiPenalty(aqi: number): number {
  if (aqi <= 50) return 0;
  if (aqi <= 100) return 25;
  if (aqi <= 150) return 55;
  if (aqi <= 200) return 75;
  if (aqi <= 300) return 90;
  return 100;
}

export function uvPenalty(uv: number): number {
  if (uv <= 2) return 0;
  if (uv <= 5) return 30;
  if (uv <= 7) return 55;
  if (uv <= 10) return 80;
  return 100;
}

export function temperaturePenalty(celsius: number): number {
  if (celsius >= 40) return 100;
  if (celsius < -5 || celsius >= 36) return 80;
  if (celsius < 0 || celsius >= 33) return 60;
  if (celsius < 5 || celsius >= 30) return 40;
  if (celsius < 10 || celsius > 26) return 20;
  return 0;
}

export function windPenalty(kph: number): number {
  if (kph <= 20) return 0;
  if (kph >= 60) return 100;
  return (kph - 20) * 2.5;
}

export function weatherPenalty(precipitationProbability: number, windGustKph: number, weatherCode: number): number {
  if ([95, 96, 99].includes(weatherCode)) return 100;
  return Math.max(Math.min(Math.max(precipitationProbability, 0), 80), windPenalty(windGustKph));
}

const REASON_LABELS: Record<ComponentName, string> = {
  air: "Air quality",
  temperature: "Apparent temperature",
  weather: "Rain, wind, or storms",
  uv: "UV",
};

export function rateHour(hour: HourConditions, profile: Profile): HourRating {
  const components: HourRating["components"] = {};
  if (hour.usAqi !== null) components.air = aqiPenalty(hour.usAqi);
  if (hour.apparentTemperatureC !== null) components.temperature = temperaturePenalty(hour.apparentTemperatureC);
  if (hour.precipitationProbability !== null && hour.windGustKph !== null && hour.weatherCode !== null) {
    components.weather = weatherPenalty(hour.precipitationProbability, hour.windGustKph, hour.weatherCode);
  }
  if (hour.uvIndex !== null) components.uv = uvPenalty(hour.uvIndex);

  const names = Object.keys(components) as ComponentName[];
  const missing = (Object.keys(PROFILE_WEIGHTS[profile]) as ComponentName[]).filter((name) => components[name] === undefined);
  const weightTotal = names.reduce((sum, name) => sum + PROFILE_WEIGHTS[profile][name], 0);
  const weighted = names.map((name) => ({
    name,
    contribution: (components[name] ?? 0) * PROFILE_WEIGHTS[profile][name] / (weightTotal || 1),
  }));
  const score = names.length ? Math.round(weighted.reduce((sum, item) => sum + item.contribution, 0)) : 100;
  const label = score < 25 && names.length >= 3
    ? "More favorable"
    : score < 50
      ? "Mixed conditions"
      : score < 75
        ? "Less favorable"
        : "Poor conditions";
  const reasons = weighted
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map(({ name, contribution }) => `${REASON_LABELS[name]} contributes ${Math.round(contribution)} points`);

  return { time: hour.time, score, label, incomplete: missing.length > 0, reasons, missing, components };
}

export function recommend(conditions: HourConditions[], profile: Profile, currentLocalHour: string): Recommendation {
  const ratings = conditions.map((hour) => rateHour(hour, profile));
  const eligible = (index: number) => {
    const hour = conditions[index];
    const rating = ratings[index];
    return Boolean(hour && rating && hour.time > currentLocalHour && hour.isDay === true && rating.components.weather !== undefined);
  };
  let best: { hours: number[]; mean: number } | null = null;

  for (let index = 0; index < conditions.length - 1; index += 1) {
    if (!eligible(index) || !eligible(index + 1)) continue;
    const first = ratings[index];
    const second = ratings[index + 1];
    if (!first || !second) continue;
    const mean = (first.score + second.score) / 2;
    if (!best || mean < best.mean) best = { hours: [index, index + 1], mean };
  }

  if (best) return { ratings, hours: best.hours, limited: false, limitation: null };

  const daylight = ratings
    .map((rating, index) => ({ rating, index }))
    .filter(({ index }) => eligible(index))
    .sort((a, b) => a.rating.score - b.rating.score || a.index - b.index);
  if (daylight[0]) {
    return {
      ratings,
      hours: [daylight[0].index],
      limited: true,
      limitation: "No two consecutive daylight hours were available, so this is the best single daylight hour.",
    };
  }

  return {
    ratings,
    hours: [],
    limited: true,
    limitation: "No future daylight hour with complete weather data was available in this forecast.",
  };
}

const TIME_RANGES: Record<TimePreference, [number, number]> = {
  any: [0, 24],
  morning: [5, 12],
  afternoon: [12, 17],
  evening: [17, 22],
};

export function recommendDays(conditions: HourConditions[], profile: Profile, currentLocalHour: string, timePreference: TimePreference): DayPlan[] {
  const days = new Map<string, HourConditions[]>();
  const [startHour, endHour] = TIME_RANGES[timePreference];

  for (const condition of conditions) {
    const hour = Number(condition.time.slice(11, 13));
    if (condition.isDay !== true || hour < startHour || hour >= endHour) continue;
    const date = condition.time.slice(0, 10);
    const day = days.get(date) ?? [];
    day.push(condition);
    days.set(date, day);
  }

  return [...days].map(([date, dayConditions]) => {
    const recommendation = recommend(dayConditions, profile, currentLocalHour);
    const selected = recommendation.hours.flatMap((index) => recommendation.ratings[index] ? [recommendation.ratings[index]] : []);
    const score = selected.length ? Math.round(selected.reduce((sum, rating) => sum + rating.score, 0) / selected.length) : null;
    return { date, conditions: dayConditions, recommendation, score };
  });
}
