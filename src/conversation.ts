export const PERIOD_IDS = ["morning", "noon", "evening", "night"] as const;

export type ConversationPeriodId = typeof PERIOD_IDS[number];

export type ConversationWindow = {
  id: ConversationPeriodId;
  time: string;
  condition: string;
  temperature: string;
  aqi: string;
  uv: string;
  light: string;
};

export type ConversationInput = {
  place: string;
  day: string;
  date: string;
  windows: ConversationWindow[];
};

export type ConversationVoice = {
  opening: string;
  leads: Array<{ id: ConversationPeriodId; text: string }>;
};

const FORECAST_LANGUAGE = /\b(?:weather|air quality|aqi|uv|temperature|degrees?|rain|drizzle|snow|storm|thunder|cloud|clear|sunny|fog|wind|humid|hot|warm|cold|cool|daylight|dark|sunrise|sunset)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || /[<>\u0000-\u001f]/.test(normalized)) return null;
  return normalized;
}

function periodId(value: unknown): ConversationPeriodId | null {
  return typeof value === "string" && PERIOD_IDS.includes(value as ConversationPeriodId) ? value as ConversationPeriodId : null;
}

export function parseConversationInput(value: unknown): ConversationInput | null {
  if (!isRecord(value)) return null;
  const place = plainText(value.place, 120);
  const day = plainText(value.day, 30);
  const date = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
  if (!place || !day || !date || !Array.isArray(value.windows) || value.windows.length < 1 || value.windows.length > 3) return null;

  const windows: ConversationWindow[] = [];
  for (const rawWindow of value.windows) {
    if (!isRecord(rawWindow)) return null;
    const id = periodId(rawWindow.id);
    const time = plainText(rawWindow.time, 40);
    const condition = plainText(rawWindow.condition, 60);
    const temperature = plainText(rawWindow.temperature, 40);
    const aqi = plainText(rawWindow.aqi, 40);
    const uv = plainText(rawWindow.uv, 40);
    const light = plainText(rawWindow.light, 40);
    if (!id || !time || !condition || !temperature || !aqi || !uv || !light || windows.some((window) => window.id === id)) return null;
    windows.push({ id, time, condition, temperature, aqi, uv, light });
  }

  return { place, day, date, windows };
}

export function fallbackConversationVoice(input: ConversationInput): ConversationVoice {
  const day = /^(Today|Tomorrow)$/i.test(input.day) ? input.day.toLowerCase() : input.day;
  const preposition = /^(today|tomorrow)$/i.test(day) ? "" : "on ";
  const count = input.windows.length === 1 ? "one good opening" : input.windows.length === 2 ? "two good openings" : "a few good openings";
  const fallbackLeads = [
    "Your strongest option is",
    "If that does not fit your day, try",
    "You have one more good chance at",
  ];
  return {
    opening: `${input.place} has ${count} ${preposition}${day}. Pick the one that feels easiest for you.`,
    leads: input.windows.map((window, index) => ({ id: window.id, text: fallbackLeads[index] ?? "Another option is" })),
  };
}

export function parseConversationVoice(value: unknown, input: ConversationInput): ConversationVoice | null {
  if (!isRecord(value)) return null;
  const opening = plainText(value.opening, 180);
  if (!opening || FORECAST_LANGUAGE.test(opening) || /\d/.test(opening) || !Array.isArray(value.leads) || value.leads.length !== input.windows.length) return null;

  const leads: ConversationVoice["leads"] = [];
  for (let index = 0; index < value.leads.length; index += 1) {
    const rawLead = value.leads[index];
    const expectedWindow = input.windows[index];
    if (!isRecord(rawLead) || !expectedWindow) return null;
    const id = periodId(rawLead.id);
    const text = plainText(rawLead.text, 100)?.replace(/[.!,:;]+$/, "") ?? null;
    if (id !== expectedWindow.id || !text || /\d/.test(text) || FORECAST_LANGUAGE.test(text)) return null;
    leads.push({ id, text });
  }

  return { opening, leads };
}

function naturalCondition(condition: string): string {
  const normalized = condition.toLowerCase();
  if (normalized === "clear") return "clear skies";
  if (normalized === "partly cloudy") return "partly cloudy skies";
  if (normalized === "overcast") return "overcast skies";
  if (normalized === "weather unavailable") return "weather details unavailable";
  return normalized;
}

function naturalLight(light: string): string {
  switch (light) {
    case "Daylight": return "during daylight";
    case "After dark": return "after dark";
    case "Around sunrise": return "around sunrise";
    case "Around sunset": return "around sunset";
    case "Changing light": return "as the light changes";
    default: return "with light conditions unavailable";
  }
}

export function describeConversationWindow(window: ConversationWindow): string {
  const temperature = window.temperature === "No temp" || window.temperature === "Unavailable" ? "" : ` around ${window.temperature}`;
  const scene = `${naturalCondition(window.condition)}${temperature} ${naturalLight(window.light)}`;
  const aqiUnavailable = window.aqi.toLowerCase().includes("unavailable");
  const uvUnavailable = window.uv.toLowerCase().includes("unavailable");

  if (!aqiUnavailable && !uvUnavailable) return `You can expect ${scene}, with ${window.aqi} and ${window.uv}.`;
  if (aqiUnavailable && uvUnavailable) return `You can expect ${scene}. Air quality and UV data are unavailable.`;
  if (aqiUnavailable) return `You can expect ${scene}, with ${window.uv}. Air quality data is unavailable.`;
  return `You can expect ${scene}, with ${window.aqi}. UV data is unavailable.`;
}
