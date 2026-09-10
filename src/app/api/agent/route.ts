import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { airQualityEvidence, conditionAnalysis, uvEvidence, weatherEvidence } from "../../../agent-tools.ts";
import { parseConversationInput, parseConversationVoice, type ConversationInput } from "../../../conversation.ts";
import { fetchForecast, type ForecastResult } from "../../../openMeteo.ts";

const MAX_REQUEST_BYTES = 8_000;
const AGENT_TIMEOUT_MS = 25_000;
const TOOL_NAMES = ["get_weather", "get_air_quality", "get_uv_index", "analyze_conditions"] as const;

// The agent's final object deliberately matches ConversationVoice. That means
// the existing parser remains the last line of defense for model-generated text.
const voiceSchema = z.object({
  mode: z.enum(["all_day", "windows", "none"]),
  opening: z.string().max(180),
  selectedIds: z.array(z.enum(["morning", "noon", "evening", "night"])).max(3),
  leads: z.array(z.object({
    id: z.enum(["morning", "noon", "evening", "night"]),
    text: z.string().max(100),
  })).max(3),
});

const SYSTEM_PROMPT = `You are the ReAct planning agent for Have a Great Day, an outdoor forecast companion.

Call all four tools before answering. Call get_weather, get_air_quality, and get_uv_index to inspect their evidence, then call analyze_conditions. The tools are already bound to the user's selected place and date, so pass an empty object to each. Do not expose private reasoning. The final response must follow the structured response schema.

The analyze_conditions result contains the application's prevalidated allowed modes and ranked candidate windows. Treat those as authoritative. Never calculate new thresholds, reorder candidates, or invent forecast facts.

Decision rules:
- mode must be one of allowedModes.
- For none, selectedIds and leads must be empty.
- Otherwise select the first two or three candidate window ids without skipping a stronger candidate, and return one lead per id in the same order.
- The opening may be warm and personal, but must not mention weather, air quality, AQI, UV, temperatures, rain, wind, measurements, times, or safety.
- Never say safe, unsafe, dangerous, guaranteed, or suitable for everyone.
- Do not use numbers, emoji, markdown, headings, an em dash, or an en dash.
- Keep the opening under 24 words and every lead under 12 words. Leads must flow into an app-rendered time range.`;

type AgentInput = {
  input: ConversationInput;
  latitude: number;
  longitude: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAgentInput(value: unknown): AgentInput | null {
  if (!isRecord(value)) return null;
  const input = parseConversationInput(value);
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (!input || typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { input, latitude, longitude };
}

function toolsFor(input: AgentInput, signal: AbortSignal, calledTools: string[]) {
  // Every tool reads the same lazy promise. The four tool names expose useful
  // capabilities to the agent while avoiding duplicate Open-Meteo requests.
  let forecastPromise: Promise<ForecastResult> | null = null;
  const forecast = () => forecastPromise ??= fetchForecast(input.latitude, input.longitude, signal);
  const selectedHours = async () => {
    const result = await forecast();
    const hours = result.conditions.filter((hour) => hour.time.startsWith(`${input.input.date}T`));
    if (!hours.length) throw new Error(`No forecast is available for ${input.input.date}.`);
    return hours;
  };
  const used = (name: typeof TOOL_NAMES[number]) => {
    if (!calledTools.includes(name)) calledTools.push(name);
  };
  const empty = z.object({});

  return [
    tool(async () => {
      // Tool arguments are intentionally empty: coordinates and date come
      // from the validated request, not from model-authored arguments.
      used("get_weather");
      return weatherEvidence(await selectedHours());
    }, { name: "get_weather", description: "Get apparent temperature, weather codes, and daylight for the selected place and date.", schema: empty }),
    tool(async () => {
      used("get_air_quality");
      return airQualityEvidence(await selectedHours());
    }, { name: "get_air_quality", description: "Get hourly and peak U.S. AQI for the selected place and date.", schema: empty }),
    tool(async () => {
      used("get_uv_index");
      return uvEvidence(await selectedHours());
    }, { name: "get_uv_index", description: "Get hourly and peak UV index for the selected place and date.", schema: empty }),
    tool(async () => {
      // This tool combines raw hazard signals with the app's already-computed
      // presentation guardrails and candidate windows.
      used("analyze_conditions");
      return {
        hazards: conditionAnalysis(await selectedHours()),
        allowedModes: input.input.assessment.allowedModes,
        defaultMode: input.input.assessment.defaultMode,
        defaultWindowCount: input.input.assessment.defaultWindowCount,
        candidateWindows: input.input.windows,
      };
    }, { name: "analyze_conditions", description: "Analyze rain, snow, storms, and wind, then return the app's deterministic ranked windows and allowed presentation modes.", schema: empty }),
  ];
}

export async function POST(request: Request): Promise<Response> {
  // This route is public, so validate origin, size, JSON, coordinates, and the
  // grounded conversation payload before creating an agent or calling a model.
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json({ error: "Request is too large." }, { status: 413 });

  let rawBody = "";
  try { rawBody = await request.text(); } catch { return Response.json({ error: "Could not read request." }, { status: 400 }); }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return Response.json({ error: "Request is too large." }, { status: 413 });

  let rawInput: unknown;
  try { rawInput = JSON.parse(rawBody); } catch { return Response.json({ error: "Request must be valid JSON." }, { status: 400 }); }
  const parsed = parseAgentInput(rawInput);
  if (!parsed) return Response.json({ error: "Agent input is invalid." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return Response.json({ error: "The planning agent is not configured." }, { status: 503 });

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(AGENT_TIMEOUT_MS)]);
  const calledTools: string[] = [];
  try {
    // createAgent supplies LangGraph's ReAct loop: the model chooses tools,
    // receives their results, and repeats until it produces structured output.
    const agent = createAgent({
      model: new ChatOpenAI({
        apiKey,
        model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
        maxRetries: 1,
        timeout: AGENT_TIMEOUT_MS,
      }),
      tools: toolsFor(parsed, signal, calledTools),
      systemPrompt: SYSTEM_PROMPT,
      responseFormat: voiceSchema,
    });
    const result = await agent.invoke({
      messages: [{ role: "user", content: `Plan ${parsed.input.day.toLowerCase()} in ${parsed.input.place} for ${parsed.input.date}.` }],
    }, { recursionLimit: 12, signal });
    // A successful answer is not enough for this showcase: require evidence
    // from every demonstrated tool before accepting the model's response.
    if (!TOOL_NAMES.every((name) => calledTools.includes(name))) return Response.json({ error: "The planning agent did not inspect every condition." }, { status: 502 });

    const voice = parseConversationVoice(result.structuredResponse, parsed.input);
    if (!voice) return Response.json({ error: "The planning agent response could not be verified." }, { status: 502 });

    return Response.json({ ...voice, _agent: { framework: "LangGraph", pattern: "ReAct", tools: calledTools } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && error.name !== "TimeoutError") console.warn("[agent] Planning run failed.");
    return Response.json({ error: "The planning agent is temporarily unavailable." }, { status: 502 });
  }
}
