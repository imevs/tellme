import type { GeminiResponse, PlaceDescRequest, TermDescRequest } from '../types';
import {
  GEMINI_BASE_URL,
  GEMINI_MODEL,
  GEMINI_TEMPERATURE,
  GEMINI_MAX_TOKENS,
  GEMINI_RESPONSE_MIME,
} from '../constants';

// ── Prompt builders (pure — easy to test) ──────────────

export function buildPlacePrompt(req: PlaceDescRequest): string {
  return `You are a brilliant, enthusiastic travel guide. Write a vivid description for a tourist about "${req.name}" (a ${req.cat}) located at: ${req.addr}.

Return ONLY valid JSON — no markdown fences — with exactly this shape:
{
  "description": "3-4 engaging sentences (130-190 words). Include historical context, a surprising fact, or cultural significance. Make it feel alive.",
  "terms": ["exact phrase from description", "another phrase", "and more"]
}

"terms" must be 4-6 specific phrases that appear VERBATIM (case-insensitive) in the description — architectural styles, historical figures, cultural concepts, local traditions, notable events. These become tappable explore buttons.`;
}

export function buildTermPrompt(req: TermDescRequest): string {
  return `You are a brilliant travel guide. Explain the concept or term "${req.term}" in an engaging way relevant to travel, history, and culture.

Return ONLY valid JSON — no markdown fences — with exactly this shape:
{
  "description": "3-4 captivating sentences (130-190 words) that a curious tourist would love. Connect it to real places, history, and experiences worldwide.",
  "terms": ["exact phrase from description", "another phrase", "more"]
}

"terms" must be 3-5 specific phrases that appear VERBATIM (case-insensitive) in the description.`;
}

// ── Response parser (pure — easy to test) ─────────────

export function parseGeminiResponse(raw: string): GeminiResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: extract JSON from markdown fence or surrounding text
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse AI response as JSON');
    parsed = JSON.parse(match[0]);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['description'] !== 'string'
  ) {
    throw new Error('Unexpected AI response shape');
  }

  const obj = parsed as Record<string, unknown>;
  const description = obj['description'] as string;
  const terms = Array.isArray(obj['terms'])
    ? (obj['terms'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  return { description, terms };
}

// ── Fetch (has side effects — not unit tested directly) ─

let geminiController: AbortController | null = null;

export async function fetchDescription(
  apiKey: string,
  prompt: string,
): Promise<GeminiResponse> {
  // Cancel any in-flight Gemini request
  geminiController?.abort();
  geminiController = new AbortController();

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal:  geminiController.signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:      GEMINI_TEMPERATURE,
        maxOutputTokens:  GEMINI_MAX_TOKENS,
        responseMimeType: GEMINI_RESPONSE_MIME,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Gemini error ${res.status}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Empty response from Gemini');

  return parseGeminiResponse(raw);
}
