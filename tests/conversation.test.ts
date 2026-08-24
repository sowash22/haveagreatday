import { describe, expect, it } from "vitest";
import { describeConversationWindow, fallbackConversationVoice, parseConversationInput, parseConversationVoice, type ConversationInput } from "../src/conversation";

const input: ConversationInput = {
  place: "Portland",
  day: "Saturday",
  date: "2026-08-29",
  windows: [
    { id: "morning", time: "7 AM to 9 AM", condition: "Partly cloudy", temperature: "68 °F", aqi: "AQI 28", uv: "UV 1.2", light: "Daylight" },
    { id: "evening", time: "5 PM to 7 PM", condition: "Clear", temperature: "74 °F", aqi: "AQI unavailable", uv: "UV unavailable", light: "Around sunset" },
    { id: "night", time: "8 PM to 10 PM", condition: "Clear", temperature: "66 °F", aqi: "AQI 31", uv: "UV unavailable", light: "After dark" },
  ],
};

describe("conversation input", () => {
  it("accepts a small grounded recommendation payload", () => {
    expect(parseConversationInput(input)).toEqual(input);
  });

  it("rejects duplicate periods and oversized place names", () => {
    expect(parseConversationInput({ ...input, place: "x".repeat(121) })).toBeNull();
    expect(parseConversationInput({ ...input, windows: [input.windows[0], input.windows[0]] })).toBeNull();
  });
});

describe("conversation voice", () => {
  it("accepts style-only copy in the supplied order", () => {
    const voice = {
      opening: "Portland has a few inviting ways to make Saturday your own.",
      leads: [
        { id: "morning", text: "Your strongest place to start is" },
        { id: "evening", text: "If that gets busy, you could try" },
        { id: "night", text: "There is one more easy option at" },
      ],
    };
    expect(parseConversationVoice(voice, input)).toEqual(voice);
  });

  it("rejects reordered leads and model-authored forecast claims", () => {
    expect(parseConversationVoice({ opening: "A few ideas for Saturday.", leads: [
      { id: "evening", text: "Start with" },
      { id: "morning", text: "Then try" },
      { id: "night", text: "Or choose" },
    ] }, input)).toBeNull();
    expect(parseConversationVoice({ opening: "Portland should be sunny.", leads: [
      { id: "morning", text: "Start with" },
      { id: "evening", text: "Then try" },
      { id: "night", text: "Or choose" },
    ] }, input)).toBeNull();
  });

  it("always has an immediate deterministic fallback", () => {
    const fallback = fallbackConversationVoice(input);
    expect(fallback.opening).toContain("Portland");
    expect(fallback.leads.map((lead) => lead.id)).toEqual(["morning", "evening", "night"]);
  });
});

describe("window narration", () => {
  it("keeps available evidence in a natural sentence", () => {
    expect(describeConversationWindow(input.windows[0]!)).toBe("You can expect partly cloudy skies around 68 °F during daylight, with AQI 28 and UV 1.2.");
  });

  it("states missing data without inventing it", () => {
    expect(describeConversationWindow(input.windows[1]!)).toBe("You can expect clear skies around 74 °F around sunset. Air quality and UV data are unavailable.");
  });
});
