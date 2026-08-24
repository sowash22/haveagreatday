import { describe, expect, it } from "vitest";
import { describeConversationDay, describeConversationWindow, fallbackConversationVoice, parseConversationInput, parseConversationVoice, type ConversationInput } from "../src/conversation";

const input: ConversationInput = {
  place: "Portland",
  day: "Saturday",
  date: "2026-08-29",
  assessment: {
    allowedModes: ["windows", "none"],
    defaultMode: "windows",
    defaultWindowCount: 2,
    favorableHourShare: 42,
    blockedHourShare: 18,
    summary: {
      condition: "Partly cloudy",
      temperature: "Feels like 64 to 74 °F",
      rain: "Rain up to 20%",
      aqi: "Air peaks at AQI 31",
      uv: "UV peaks at 4.2",
      light: "Daylight from 7 AM to 8 PM",
    },
  },
  windows: [
    { id: "morning", time: "7 AM to 9 AM", fit: 94, condition: "Partly cloudy", temperature: "68 °F", aqi: "AQI 28", uv: "UV 1.2", light: "Daylight" },
    { id: "evening", time: "5 PM to 7 PM", fit: 88, condition: "Clear", temperature: "74 °F", aqi: "AQI unavailable", uv: "UV unavailable", light: "Around sunset" },
    { id: "night", time: "8 PM to 10 PM", fit: 69, condition: "Clear", temperature: "66 °F", aqi: "AQI 31", uv: "UV unavailable", light: "After dark" },
  ],
};

describe("conversation input", () => {
  it("accepts a grounded adaptive payload", () => {
    expect(parseConversationInput(input)).toEqual(input);
  });

  it("accepts a no-recommendation payload without candidate windows", () => {
    const noneInput = { ...input, assessment: { ...input.assessment, allowedModes: ["none"], defaultMode: "none", defaultWindowCount: 0 }, windows: [] };
    expect(parseConversationInput(noneInput)?.assessment.defaultMode).toBe("none");
  });

  it("rejects mismatched modes and duplicate periods", () => {
    expect(parseConversationInput({ ...input, assessment: { ...input.assessment, allowedModes: ["all_day"], defaultMode: "windows" } })).toBeNull();
    expect(parseConversationInput({ ...input, windows: [input.windows[0], input.windows[0]] })).toBeNull();
  });
});

describe("conversation voice", () => {
  it("can keep only the strongest prefix of worthwhile windows", () => {
    const voice = {
      mode: "windows",
      opening: "Portland has two inviting ways to make Saturday your own.",
      selectedIds: ["morning", "evening"],
      leads: [
        { id: "morning", text: "Your strongest place to start is" },
        { id: "evening", text: "If that gets busy, you could try" },
      ],
    };
    expect(parseConversationVoice(voice, input)).toEqual(voice);
  });

  it("accepts all-day and no-recommendation decisions only when allowed", () => {
    const allDayInput: ConversationInput = { ...input, assessment: { ...input.assessment, allowedModes: ["all_day", "windows"], defaultMode: "all_day", defaultWindowCount: 0 } };
    expect(parseConversationVoice({ mode: "all_day", opening: "Portland gets one of those beautifully open Saturdays.", selectedIds: [], leads: [] }, allDayInput)?.mode).toBe("all_day");
    expect(parseConversationVoice({ mode: "none", opening: "I would save these plans for another day.", selectedIds: [], leads: [] }, input)?.mode).toBe("none");
  });

  it("rejects skipped candidates and model-authored forecast claims", () => {
    expect(parseConversationVoice({ mode: "windows", opening: "A few ideas for Saturday.", selectedIds: ["morning", "night"], leads: [
      { id: "morning", text: "Start with" },
      { id: "night", text: "Then try" },
    ] }, input)).toBeNull();
    expect(parseConversationVoice({ mode: "windows", opening: "Portland should be sunny.", selectedIds: ["morning"], leads: [{ id: "morning", text: "Start with" }] }, input)).toBeNull();
  });

  it("always has an immediate adaptive fallback", () => {
    const fallback = fallbackConversationVoice(input);
    expect(fallback.mode).toBe("windows");
    expect(fallback.selectedIds).toEqual(["morning", "evening"]);
  });
});

describe("forecast narration", () => {
  it("keeps window evidence in a natural sentence", () => {
    expect(describeConversationWindow(input.windows[0]!)).toBe("You can expect partly cloudy skies around 68 °F during daylight, with AQI 28 and UV 1.2.");
  });

  it("states the whole day with every metric", () => {
    expect(describeConversationDay(input.assessment.summary)).toContain("Rain up to 20%. Air peaks at AQI 31. UV peaks at 4.2.");
  });
});
