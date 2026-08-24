import { parseConversationInput, parseConversationVoice, type ConversationInput } from "../../../conversation";

const MAX_REQUEST_BYTES = 6_000;
const INFERENCE_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You write the warm connective copy for Have a Great Day, a simple outdoor planner.

The app has already ranked the forecast windows. You must not rank, calculate, summarize, or change any supplied fact. You are only writing an inviting opening and a short lead-in before each app-rendered time.

Return JSON only in this exact shape:
{"opening":"string","leads":[{"id":"morning|noon|evening|night","text":"string"}]}

Rules:
- Return one lead for every supplied window, in the same order, with the exact same id.
- The opening should feel personal to the supplied place and day, but make no weather or safety claim.
- Each lead should flow grammatically into a time range, such as "The best fit for your day is".
- The first lead should signal the strongest option. Later leads should feel like flexible alternatives.
- Do not include times, numbers, weather, temperature, air quality, UV, daylight, dayparts, scores, medical advice, or safety claims.
- Do not use emoji, markdown, labels, headings, or hype.
- Keep the opening under 22 words and every lead under 12 words.
- Use contractions naturally when helpful. Never use an em dash or en dash.`;

type CompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

function v2Endpoint(): string | null {
  const raw = process.env.BACKEND_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/$/, "");
    if (path !== "/v2/chat/completions" || (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function jsonFromCompletion(content: string): unknown {
  const unfenced = content.replace(/```(?:json)?|```/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(unfenced.slice(start, end + 1)); } catch { return null; }
}

function promptData(input: ConversationInput): string {
  return JSON.stringify({ place: input.place, day: input.day, windows: input.windows.map(({ id }) => ({ id })) });
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json({ error: "Request is too large." }, { status: 413 });

  let rawBody = "";
  try { rawBody = await request.text(); } catch { return Response.json({ error: "Could not read request." }, { status: 400 }); }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return Response.json({ error: "Request is too large." }, { status: 413 });

  let rawInput: unknown;
  try { rawInput = JSON.parse(rawBody); } catch { return Response.json({ error: "Request must be valid JSON." }, { status: 400 }); }
  const input = parseConversationInput(rawInput);
  if (!input) return Response.json({ error: "Recommendation data is invalid." }, { status: 400 });

  const endpoint = v2Endpoint();
  const apiKey = process.env.CLIENT_API_KEY?.trim();
  if (!endpoint || !apiKey) return Response.json({ error: "Conversational wording is not configured." }, { status: 503 });

  const provider = process.env.PROVIDER?.trim();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Client-ID": process.env.CLIENT_ID?.trim() || "haveagreatday",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: promptData(input) },
        ],
        stream: false,
        temperature: 0.65,
        max_tokens: 800,
        ...(provider ? { provider } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(INFERENCE_TIMEOUT_MS)]),
    });

    if (!response.ok) {
      console.warn(`[conversation] Inference request failed with status ${response.status}.`);
      return Response.json({ error: "Conversational wording is temporarily unavailable." }, { status: 502 });
    }

    const completion = await response.json() as CompletionResponse;
    const content = completion.choices?.[0]?.message?.content;
    const voice = typeof content === "string" ? parseConversationVoice(jsonFromCompletion(content), input) : null;
    if (!voice) return Response.json({ error: "Conversational wording could not be verified." }, { status: 502 });

    return Response.json(voice, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && error.name !== "TimeoutError") console.warn("[conversation] Inference request failed.");
    return Response.json({ error: "Conversational wording is temporarily unavailable." }, { status: 502 });
  }
}
