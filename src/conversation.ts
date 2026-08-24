export const PERIOD_IDS = ["morning", "noon", "evening", "night"] as const;
export const SUGGESTION_MODES = ["all_day", "windows", "none"] as const;

export type ConversationPeriodId = typeof PERIOD_IDS[number];
export type SuggestionMode = typeof SUGGESTION_MODES[number];

export type ConversationWindow = {
  id: ConversationPeriodId;
  time: string;
  fit: number;
  condition: string;
  temperature: string;
  aqi: string;
  uv: string;
  light: string;
};

export type ConversationDaySummary = {
  condition: string;
  temperature: string;
  rain: string;
  aqi: string;
  uv: string;
  light: string;
};

export type ConversationInput = {
  place: string;
  day: string;
  date: string;
  assessment: {
    allowedModes: SuggestionMode[];
    defaultMode: SuggestionMode;
    defaultWindowCount: number;
    favorableHourShare: number;
    blockedHourShare: number;
    summary: ConversationDaySummary;
  };
  windows: ConversationWindow[];
};

export type ConversationVoice = {
  mode: SuggestionMode;
  opening: string;
  selectedIds: ConversationPeriodId[];
  leads: Array<{ id: ConversationPeriodId; text: string }>;
};

const FORECAST_LANGUAGE = /\b(?:weather|air quality|aqi|uv|temperature|degrees?|rain|drizzle|snow|storm|thunder|cloud|clear|sunny|fog|wind|humid|hot|warm|cold|cool|daylight|dark|sunrise|sunset|safe|unsafe|dangerous)\b/i;

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

function suggestionMode(value: unknown): SuggestionMode | null {
  return typeof value === "string" && SUGGESTION_MODES.includes(value as SuggestionMode) ? value as SuggestionMode : null;
}

function percentage(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

function parseDaySummary(value: unknown): ConversationDaySummary | null {
  if (!isRecord(value)) return null;
  const condition = plainText(value.condition, 80);
  const temperature = plainText(value.temperature, 80);
  const rain = plainText(value.rain, 80);
  const aqi = plainText(value.aqi, 80);
  const uv = plainText(value.uv, 80);
  const light = plainText(value.light, 80);
  return condition && temperature && rain && aqi && uv && light ? { condition, temperature, rain, aqi, uv, light } : null;
}

export function parseConversationInput(value: unknown): ConversationInput | null {
  if (!isRecord(value) || !isRecord(value.assessment)) return null;
  const place = plainText(value.place, 120);
  const day = plainText(value.day, 30);
  const date = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
  const defaultMode = suggestionMode(value.assessment.defaultMode);
  const defaultWindowCount = value.assessment.defaultWindowCount;
  const favorableHourShare = percentage(value.assessment.favorableHourShare);
  const blockedHourShare = percentage(value.assessment.blockedHourShare);
  const summary = parseDaySummary(value.assessment.summary);
  if (!place || !day || !date || !defaultMode || favorableHourShare === null || blockedHourShare === null || !summary) return null;
  if (!Array.isArray(value.assessment.allowedModes) || value.assessment.allowedModes.length < 1 || value.assessment.allowedModes.length > 3) return null;
  const allowedModes = value.assessment.allowedModes.map(suggestionMode);
  if (allowedModes.some((mode) => mode === null) || new Set(allowedModes).size !== allowedModes.length || !allowedModes.includes(defaultMode)) return null;
  if (!Number.isInteger(defaultWindowCount) || typeof defaultWindowCount !== "number" || defaultWindowCount < 0 || defaultWindowCount > 3) return null;
  if (!Array.isArray(value.windows) || value.windows.length > 3) return null;

  const windows: ConversationWindow[] = [];
  for (const rawWindow of value.windows) {
    if (!isRecord(rawWindow)) return null;
    const id = periodId(rawWindow.id);
    const time = plainText(rawWindow.time, 40);
    const fit = rawWindow.fit;
    const condition = plainText(rawWindow.condition, 60);
    const temperature = plainText(rawWindow.temperature, 40);
    const aqi = plainText(rawWindow.aqi, 40);
    const uv = plainText(rawWindow.uv, 40);
    const light = plainText(rawWindow.light, 40);
    if (!id || !time || typeof fit !== "number" || !Number.isInteger(fit) || fit < 0 || fit > 100 || !condition || !temperature || !aqi || !uv || !light || windows.some((window) => window.id === id)) return null;
    windows.push({ id, time, fit, condition, temperature, aqi, uv, light });
  }

  if (allowedModes.includes("windows") !== (windows.length > 0)) return null;
  if (defaultMode === "windows" && (defaultWindowCount < 1 || defaultWindowCount > windows.length)) return null;
  if (defaultMode !== "windows" && defaultWindowCount !== 0) return null;

  return { place, day, date, assessment: { allowedModes: allowedModes as SuggestionMode[], defaultMode, defaultWindowCount, favorableHourShare, blockedHourShare, summary }, windows };
}

export function fallbackConversationVoice(input: ConversationInput): ConversationVoice {
  const day = /^(Today|Tomorrow)$/i.test(input.day) ? input.day.toLowerCase() : input.day;
  const preposition = /^(today|tomorrow)$/i.test(day) ? "" : "on ";
  if (input.assessment.defaultMode === "all_day") {
    return { mode: "all_day", opening: `${input.place} has one of those rare, easygoing days ${preposition}${day}.`, selectedIds: [], leads: [] };
  }
  if (input.assessment.defaultMode === "none") {
    return { mode: "none", opening: `I’d choose another day for outdoor plans in ${input.place}.`, selectedIds: [], leads: [] };
  }

  const selected = input.windows.slice(0, input.assessment.defaultWindowCount);
  const count = selected.length === 1 ? "one worthwhile opening" : selected.length === 2 ? "two worthwhile openings" : "a few worthwhile openings";
  const fallbackLeads = ["Your strongest option is", "If that does not fit your day, try", "One more good chance comes at"];
  return {
    mode: "windows",
    opening: `${input.place} has ${count} ${preposition}${day}.`,
    selectedIds: selected.map((window) => window.id),
    leads: selected.map((window, index) => ({ id: window.id, text: fallbackLeads[index] ?? "Another option is" })),
  };
}

export function parseConversationVoice(value: unknown, input: ConversationInput): ConversationVoice | null {
  if (!isRecord(value)) return null;
  const mode = suggestionMode(value.mode);
  const opening = plainText(value.opening, 180);
  if (!mode || !input.assessment.allowedModes.includes(mode) || !opening || FORECAST_LANGUAGE.test(opening) || /\d/.test(opening)) return null;
  if (!Array.isArray(value.selectedIds) || !Array.isArray(value.leads)) return null;

  const selectedIds = value.selectedIds.map(periodId);
  if (selectedIds.some((id) => id === null)) return null;
  if (mode !== "windows") {
    return selectedIds.length === 0 && value.leads.length === 0 ? { mode, opening, selectedIds: [], leads: [] } : null;
  }

  if (selectedIds.length < 1 || selectedIds.length > input.windows.length || value.leads.length !== selectedIds.length) return null;
  const expectedPrefix = input.windows.slice(0, selectedIds.length).map((window) => window.id);
  if (!selectedIds.every((id, index) => id === expectedPrefix[index])) return null;

  const leads: ConversationVoice["leads"] = [];
  for (let index = 0; index < value.leads.length; index += 1) {
    const rawLead = value.leads[index];
    const expectedId = expectedPrefix[index];
    if (!isRecord(rawLead) || !expectedId) return null;
    const id = periodId(rawLead.id);
    const text = plainText(rawLead.text, 100)?.replace(/[.!,:;]+$/, "") ?? null;
    if (id !== expectedId || !text || /\d/.test(text) || FORECAST_LANGUAGE.test(text)) return null;
    leads.push({ id, text });
  }

  return { mode, opening, selectedIds: selectedIds as ConversationPeriodId[], leads };
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

export function describeConversationDay(summary: ConversationDaySummary): string {
  return `${summary.condition}. ${summary.temperature}. ${summary.rain}. ${summary.aqi}. ${summary.uv}. ${summary.light}.`;
}
