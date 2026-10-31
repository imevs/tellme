import type { GeminiResponse, PlaceDescRequest, TermDescRequest, POI } from '../types';
import {
  GEMINI_BASE_URL,
  GEMINI_MODEL,
  GEMINI_MAX_TOKENS,
  GEMINI_DISCOVER_MAX_TOKENS,
  GEMINI_RESPONSE_MIME,
} from '../constants';
import { haversineKm } from './overpass';

// ── Default curated places (shown before API key is set) ──
export const DEFAULT_PARIS_POIS: POI[] = [
  {
    id: 1,
    type: 'node',
    _lat: 48.8584,
    _lon: 2.2945,
    _dist: 4.1,
    tags: {
      name: 'Eiffel Tower',
      tourism: 'attraction',
      'addr:street': 'Champ de Mars, 5 Av. Anatole France',
      description: 'Iconic 330-metre 19th-century wrought-iron tower offering panoramic city views.',
    },
  },
  {
    id: 2,
    type: 'node',
    _lat: 48.8606,
    _lon: 2.3376,
    _dist: 1.1,
    tags: {
      name: 'Louvre Museum',
      tourism: 'museum',
      'addr:street': 'Rue de Rivoli, 75001 Paris',
      description: 'World’s most-visited museum housing the Mona Lisa and thousands of masterworks.',
    },
  },
  {
    id: 3,
    type: 'node',
    _lat: 48.8530,
    _lon: 2.3499,
    _dist: 0.4,
    tags: {
      name: 'Cathédrale Notre-Dame de Paris',
      historic: 'monument',
      'addr:street': '6 Parvis Notre-Dame - Pl. Jean-Paul II',
      description: 'Medieval Catholic cathedral renowned for its French Gothic architecture and gargoyles.',
    },
  },
  {
    id: 4,
    type: 'node',
    _lat: 48.8555,
    _lon: 2.3444,
    _dist: 0.6,
    tags: {
      name: 'Sainte-Chapelle',
      historic: 'church',
      'addr:street': '10 Bd du Palais, 75001 Paris',
      description: '13th-century Gothic royal chapel famed for its breathtaking stained-glass windows.',
    },
  },
  {
    id: 5,
    type: 'node',
    _lat: 48.8462,
    _lon: 2.3449,
    _dist: 1.3,
    tags: {
      name: 'Panthéon',
      historic: 'monument',
      'addr:street': 'Pl. du Panthéon, 75005 Paris',
      description: 'Neoclassical monument and mausoleum honoring France’s most illustrious figures.',
    },
  },
  {
    id: 6,
    type: 'node',
    _lat: 48.8468,
    _lon: 2.3372,
    _dist: 1.5,
    tags: {
      name: 'Jardin du Luxembourg',
      leisure: 'park',
      'addr:street': '75006 Paris',
      description: 'Lush 17th-century palace gardens with tree-lined promenades and model-sailboat pond.',
    },
  },
  {
    id: 7,
    type: 'node',
    _lat: 48.8540,
    _lon: 2.3332,
    _dist: 1.4,
    tags: {
      name: 'Café de Flore',
      amenity: 'cafe',
      'addr:street': '172 Bd Saint-Germain, 75006 Paris',
      description: 'Historic café frequented by Sartre, Simone de Beauvoir, and legendary intellectuals.',
    },
  },
  {
    id: 8,
    type: 'node',
    _lat: 48.8656,
    _lon: 2.3212,
    _dist: 2.5,
    tags: {
      name: 'Place de la Concorde',
      historic: 'monument',
      'addr:street': '75008 Paris',
      description: 'Major public square featuring the 3,300-year-old Luxor Obelisk and monumental fountains.',
    },
  },
];

// ── Discover Places Prompts & Parsing ─────────────────────

export function buildDiscoverPlacesPrompt(lat: number, lon: number, cat: string): string {
  const categoryClause = cat === 'all'
    ? 'a diverse mix of famous sights, historic monuments, local food/cafes, and parks'
    : `places focused on category "${cat}" (e.g. ${
        cat === 'tourism' ? 'sights, viewpoints, museums'
        : cat === 'historic' ? 'castles, monuments, churches'
        : cat === 'amenity' ? 'cafes, bakeries, restaurants'
        : cat === 'leisure' ? 'parks, gardens'
        : 'local shops and boutiques'
      })`;

  return `You are a world-class travel guide and local cartographer.
List 12-16 real, interesting places to visit near coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}).
Focus on: ${categoryClause}.

Return ONLY a valid JSON object with this exact shape:
{
  "places": [
    {
      "name": "Exact Name of Place",
      "cat": "tourism",
      "subcat": "museum",
      "lat": 48.8584,
      "lon": 2.2945,
      "address": "Street address or neighborhood",
      "teaser": "One engaging sentence about this place."
    }
  ]
}

"cat" must be one of: "tourism", "historic", "amenity", "leisure", "shop".
Coordinates must be realistic and close to (${lat.toFixed(4)}, ${lon.toFixed(4)}).`;
}

export interface DiscoveredPlaceRaw {
  name: string;
  cat?: string;
  subcat?: string;
  lat: number;
  lon: number;
  address?: string;
  teaser?: string;
}

export function parseDiscoveredPlaces(
  raw: string,
  centerLat: number,
  centerLon: number,
): POI[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse places from AI response');
    parsed = JSON.parse(match[0]);
  }

  const obj = parsed as Record<string, unknown>;
  const list = Array.isArray(obj?.['places']) ? (obj['places'] as unknown[]) : [];

  return list
    .filter((item): item is DiscoveredPlaceRaw => {
      if (typeof item !== 'object' || item === null) return false;
      const p = item as Record<string, unknown>;
      return (
        typeof p['name'] === 'string' &&
        typeof p['lat'] === 'number' &&
        typeof p['lon'] === 'number' &&
        !isNaN(p['lat']) &&
        !isNaN(p['lon'])
      );
    })
    .map((p, idx) => {
      const cat = p.cat || 'tourism';
      const subcat = p.subcat || cat;
      const dist = haversineKm(centerLat, centerLon, p.lat, p.lon);
      return {
        id: idx + 1,
        type: 'node' as const,
        _lat: p.lat,
        _lon: p.lon,
        _dist: dist,
        tags: {
          name: p.name,
          [cat]: subcat,
          description: p.teaser ?? '',
          'addr:street': p.address ?? '',
        },
      };
    })
    .sort((a, b) => a._dist - b._dist);
}

// ── Resilient Gemini Request Helper ───────────────────────

async function requestGeminiContent(
  apiKey: string,
  prompt: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const execute = async (): Promise<string> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  };

  try {
    return await execute();
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') throw err;
    const msg = (err as Error).message || '';
    // If temporary demand spike or 503, retry once after a short delay
    if (msg.includes('high demand') || msg.includes('503') || msg.includes('spikes in demand')) {
      await new Promise(r => setTimeout(r, 1200));
      if (signal.aborted) throw new Error('Request cancelled');
      return await execute();
    }
    throw err;
  }
}

// ── Fetch discovered places ───────────────────────────────

let discoverController: AbortController | null = null;

export async function fetchDiscoveredPlaces(
  apiKey: string,
  lat: number,
  lon: number,
  cat: string,
): Promise<POI[]> {
  discoverController?.abort();
  discoverController = new AbortController();

  const prompt = buildDiscoverPlacesPrompt(lat, lon, cat);
  const raw = await requestGeminiContent(
    apiKey,
    prompt,
    GEMINI_DISCOVER_MAX_TOKENS,
    discoverController.signal,
  );

  return parseDiscoveredPlaces(raw, lat, lon);
}

// ── Description Prompt builders ───────────────────────────

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

// ── Description response parser ───────────────────────────

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

// ── Fetch place/term description ──────────────────────────

let geminiController: AbortController | null = null;

export async function fetchDescription(
  apiKey: string,
  prompt: string,
): Promise<GeminiResponse> {
  // Cancel any in-flight Gemini request
  geminiController?.abort();
  geminiController = new AbortController();

  const raw = await requestGeminiContent(
    apiKey,
    prompt,
    GEMINI_MAX_TOKENS,
    geminiController.signal,
  );

  return parseGeminiResponse(raw);
}
