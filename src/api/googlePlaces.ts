import {
  GOOGLE_PLACES_API_KEY,
  GOOGLE_PLACES_SEARCH_URL,
  GOOGLE_PLACES_MAX_DAILY_CALLS,
} from '../constants';
import type { GooglePlaceDetails } from '../types';

// ── In-Memory Cache ─────────────────────────────────────────
const memoryCache = new Map<string, { data: GooglePlaceDetails; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let placesController: AbortController | null = null;

// ── Daily Quota Rate Limiter ────────────────────────────────

export function getDailyCallCount(): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `gp_calls_${today}`;
    const count = parseInt(localStorage.getItem(key) ?? '0', 10);
    return isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}

export function incrementDailyCallCount(): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `gp_calls_${today}`;
    const next = getDailyCallCount() + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function canMakeGooglePlacesCall(): boolean {
  return getDailyCallCount() < GOOGLE_PLACES_MAX_DAILY_CALLS;
}

// ── Pure Helpers & Formatters ───────────────────────────────

export function parseGooglePlaceResponse(raw: unknown): GooglePlaceDetails | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const places = Array.isArray(data['places']) ? (data['places'] as Array<Record<string, unknown>>) : [];
  if (places.length === 0) return null;

  const first = places[0];
  if (!first || typeof first !== 'object') return null;

  const id = typeof first['id'] === 'string' ? first['id'] : undefined;
  const displayName = typeof first['displayName'] === 'object' && first['displayName'] !== null
    ? String((first['displayName'] as Record<string, unknown>)['text'] || '')
    : undefined;

  const currentOpeningHours = typeof first['currentOpeningHours'] === 'object' && first['currentOpeningHours'] !== null
    ? (first['currentOpeningHours'] as Record<string, unknown>)
    : undefined;
  const openNow = typeof currentOpeningHours?.['openNow'] === 'boolean' ? currentOpeningHours['openNow'] : undefined;

  const websiteUri = typeof first['websiteUri'] === 'string' && first['websiteUri'].startsWith('http')
    ? first['websiteUri']
    : undefined;

  const formattedAddress = typeof first['formattedAddress'] === 'string'
    ? first['formattedAddress']
    : undefined;

  const editorialSummary = typeof first['editorialSummary'] === 'object' && first['editorialSummary'] !== null
    ? String((first['editorialSummary'] as Record<string, unknown>)['text'] || '') || undefined
    : undefined;

  return {
    id,
    name: displayName,
    openNow,
    websiteUri,
    formattedAddress,
    editorialSummary,
  };
}

// ── Cache Helpers ───────────────────────────────────────────

function getCacheKey(name: string, lat?: number, lon?: number): string {
  const normName = name.trim().toLowerCase();
  if (lat != null && lon != null && lat !== 0 && lon !== 0) {
    return `${normName}_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  }
  return normName;
}

function getFromCache(key: string): GooglePlaceDetails | null {
  // 1. Memory cache
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.data;
  }

  // 2. LocalStorage cache
  try {
    const raw = localStorage.getItem(`gp_cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: GooglePlaceDetails; expiresAt: number };
      if (parsed.expiresAt > Date.now()) {
        memoryCache.set(key, parsed);
        return parsed.data;
      }
      localStorage.removeItem(`gp_cache_${key}`);
    }
  } catch {
    // Ignore storage parse error
  }

  return null;
}

function saveToCache(key: string, data: GooglePlaceDetails): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  memoryCache.set(key, { data, expiresAt });
  try {
    localStorage.setItem(`gp_cache_${key}`, JSON.stringify({ data, expiresAt }));
  } catch {
    // Storage might be full
  }
}

// ── Main Network Fetcher ────────────────────────────────────

export async function fetchGooglePlaceDetails(
  name: string,
  lat?: number,
  lon?: number,
): Promise<GooglePlaceDetails | null> {
  const cleanName = name.trim();
  // Filter generic or empty names to prevent wasting quota
  if (!cleanName || cleanName.length < 3 || cleanName === 'Map Object') {
    return null;
  }

  const cacheKey = getCacheKey(cleanName, lat, lon);

  // 1. Check Cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Strict Quota Check — don't hit API if quota exceeded
  if (!canMakeGooglePlacesCall()) {
    console.warn(`[Google Places] Daily call quota reached (${GOOGLE_PLACES_MAX_DAILY_CALLS}). Using fallback.`);
    return null;
  }

  // 3. Perform API Call with minimal lean FieldMask
  placesController?.abort();
  placesController = new AbortController();

  try {
    const bodyPayload: Record<string, unknown> = {
      textQuery: cleanName,
    };

    if (lat != null && lon != null && (lat !== 0 || lon !== 0)) {
      bodyPayload['locationBias'] = {
        circle: {
          center: {
            latitude: lat,
            longitude: lon,
          },
          radius: 1000.0,
        },
      };
    }

    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.currentOpeningHours.openNow',
      'places.websiteUri',
      'places.editorialSummary',
    ].join(',');

    const res = await fetch(GOOGLE_PLACES_SEARCH_URL, {
      method: 'POST',
      signal: placesController.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      console.warn(`[Google Places] API error: ${res.status}`);
      return null;
    }

    // Increment quota counter on success
    incrementDailyCallCount();

    const data: unknown = await res.json();
    const parsed = parseGooglePlaceResponse(data);
    if (parsed) {
      saveToCache(cacheKey, parsed);
      return parsed;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    console.warn('[Google Places] Request error:', err);
  }

  return null;
}
