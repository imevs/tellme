import {
  GOOGLE_PLACES_API_KEY,
  GOOGLE_PLACES_SEARCH_URL,
  GOOGLE_PLACES_MAX_DAILY_CALLS,
} from '../constants';
import { poiCategory, poiAddress } from './overpass';
import type { GooglePlaceDetails, AddressPlaceOrganization, OsmFeature, POI } from '../types';

// ── In-Memory Cache ─────────────────────────────────────────
interface CachedPlacesData {
  primary: GooglePlaceDetails | null;
  places: AddressPlaceOrganization[];
}

const memoryCache = new Map<string, { data: CachedPlacesData; expiresAt: number }>();
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

export function parseGooglePlacesList(raw: unknown): AddressPlaceOrganization[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const data = raw as Record<string, unknown>;

  const places = Array.isArray(data['places']) ? (data['places'] as Array<Record<string, unknown>>) : [];
  if (places.length === 0) return [];

  const result: AddressPlaceOrganization[] = [];

  for (const p of places) {
    if (typeof p !== 'object' || p === null) continue;
    const displayName = typeof p['displayName'] === 'object' && p['displayName'] !== null
      ? String((p['displayName'] as Record<string, unknown>)['text'] || '')
      : undefined;

    if (!displayName || !displayName.trim()) continue;

    const primaryTypeDisplayName = typeof p['primaryTypeDisplayName'] === 'object' && p['primaryTypeDisplayName'] !== null
      ? String((p['primaryTypeDisplayName'] as Record<string, unknown>)['text'] || '')
      : undefined;
    const primaryType = typeof p['primaryType'] === 'string'
      ? p['primaryType'].replace(/_/g, ' ')
      : undefined;

    const currentOpeningHours = typeof p['currentOpeningHours'] === 'object' && p['currentOpeningHours'] !== null
      ? (p['currentOpeningHours'] as Record<string, unknown>)
      : undefined;
    const openNow = typeof currentOpeningHours?.['openNow'] === 'boolean' ? currentOpeningHours['openNow'] : undefined;

    const websiteUri = typeof p['websiteUri'] === 'string' && p['websiteUri'].startsWith('http')
      ? p['websiteUri']
      : undefined;

    const formattedAddress = typeof p['formattedAddress'] === 'string'
      ? p['formattedAddress']
      : undefined;

    const editorialSummary = typeof p['editorialSummary'] === 'object' && p['editorialSummary'] !== null
      ? String((p['editorialSummary'] as Record<string, unknown>)['text'] || '') || undefined
      : undefined;

    const org: AddressPlaceOrganization = {
      name: displayName,
      category: primaryTypeDisplayName || primaryType || 'Organization',
      openNow,
      websiteUri,
      formattedAddress,
      description: editorialSummary,
      source: 'google',
    };

    if (typeof p['id'] === 'string') {
      org.id = p['id'];
    }

    result.push(org);
  }

  return result;
}

// ── Cache Helpers ───────────────────────────────────────────

function getCacheKey(name: string, lat?: number, lon?: number): string {
  const normName = name.trim().toLowerCase();
  if (lat != null && lon != null && lat !== 0 && lon !== 0) {
    return `${normName}_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  }
  return normName;
}

function getFromCache(key: string): CachedPlacesData | null {
  // 1. Memory cache
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.data;
  }

  // 2. LocalStorage cache
  try {
    const raw = localStorage.getItem(`gp_cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: CachedPlacesData; expiresAt: number };
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

function saveToCache(key: string, data: CachedPlacesData): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  memoryCache.set(key, { data, expiresAt });
  try {
    localStorage.setItem(`gp_cache_${key}`, JSON.stringify({ data, expiresAt }));
  } catch {
    // Storage might be full
  }
}

// ── Main Network Fetchers ───────────────────────────────────

export async function fetchGooglePlacesAtAddress(
  query: string,
  lat?: number,
  lon?: number,
): Promise<{ primary: GooglePlaceDetails | null; places: AddressPlaceOrganization[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 3 || cleanQuery === 'Map Object') {
    return { primary: null, places: [] };
  }

  const cacheKey = getCacheKey(cleanQuery, lat, lon);

  // 1. Check Cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Strict Quota Check
  if (!canMakeGooglePlacesCall()) {
    console.warn(`[Google Places] Daily call quota reached (${GOOGLE_PLACES_MAX_DAILY_CALLS}). Using fallback.`);
    return { primary: null, places: [] };
  }

  // 3. Perform API Call with minimal lean FieldMask
  placesController?.abort();
  placesController = new AbortController();

  try {
    const bodyPayload: Record<string, unknown> = {
      textQuery: cleanQuery,
      maxResultCount: 8,
    };

    if (lat != null && lon != null && (lat !== 0 || lon !== 0)) {
      bodyPayload['locationBias'] = {
        circle: {
          center: {
            latitude: lat,
            longitude: lon,
          },
          radius: 60.0,
        },
      };
    }

    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.primaryType',
      'places.primaryTypeDisplayName',
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
      return { primary: null, places: [] };
    }

    // Increment quota counter on success
    incrementDailyCallCount();

    const data: unknown = await res.json();
    const primary = parseGooglePlaceResponse(data);
    const places = parseGooglePlacesList(data);

    const result = { primary, places };
    saveToCache(cacheKey, result);
    return result;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { primary: null, places: [] };
    console.warn('[Google Places] Request error:', err);
  }

  return { primary: null, places: [] };
}

export async function fetchGooglePlaceDetails(
  name: string,
  lat?: number,
  lon?: number,
): Promise<GooglePlaceDetails | null> {
  const res = await fetchGooglePlacesAtAddress(name, lat, lon);
  return res.primary;
}

/**
 * Consolidates organizations/places at this address from Google Places,
 * nearby memory POIs, and OSM feature tags without using Overpass.
 */
export function resolvePlacesAtAddress(options: {
  address?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
  osm?: OsmFeature | null | undefined;
  googlePlaces?: AddressPlaceOrganization[] | undefined;
  storePois?: POI[] | undefined;
}): AddressPlaceOrganization[] {
  const result: AddressPlaceOrganization[] = [];
  const seenNames = new Set<string>();

  const normAddress = options.address ? options.address.trim().toLowerCase() : '';
  const road = options.osm?.address?.road?.trim().toLowerCase() || '';
  const houseNum = options.osm?.address?.houseNumber?.trim().toLowerCase() || '';

  const isSelfBuildingAddress = (name: string, category?: string | undefined): boolean => {
    const norm = name.trim().toLowerCase();
    if (!norm) return true;
    if (normAddress && (norm === normAddress || normAddress.startsWith(norm) || norm.startsWith(normAddress))) {
      return true;
    }
    if (road && houseNum) {
      const roadHouse = `${road} ${houseNum}`;
      const houseRoad = `${houseNum} ${road}`;
      if (norm === roadHouse || norm === houseRoad || norm.includes(roadHouse) || norm.includes(houseRoad)) {
        return true;
      }
    }
    if (category && /^(building|house|residential|place)$/i.test(category.trim())) {
      if (road && norm.includes(road)) return true;
      if (houseNum && norm.includes(houseNum)) return true;
    }
    return false;
  };

  const addIfUnique = (p: AddressPlaceOrganization) => {
    const key = p.name.trim().toLowerCase();
    if (!key || seenNames.has(key)) return;
    if (isSelfBuildingAddress(p.name, p.category)) return;
    seenNames.add(key);
    result.push(p);
  };

  // 0. Places from OSM address inventory (all organizations at this address)
  for (const org of options.osm?.addressOrganizations || []) {
    addIfUnique(org);
  }

  // 1. Places from Google Places
  for (const gp of options.googlePlaces || []) {
    addIfUnique(gp);
  }

  // 2. Places from in-memory store POIs if within 40m (0.04 km) and has physical organization tag
  if (options.storePois && options.lat != null && options.lon != null) {
    for (const poi of options.storePois) {
      const name = poi.tags.name ?? poi.tags['name:en'];
      if (!name) continue;

      const isPhysicalOrg = Boolean(
        poi.tags.shop ||
        poi.tags.amenity ||
        poi.tags.office ||
        poi.tags.craft ||
        poi.tags.operator
      );
      if (!isPhysicalOrg) continue;

      if (poi._dist != null && poi._dist <= 0.04) {
        addIfUnique({
          name,
          category: poiCategory(poi.tags),
          formattedAddress: poiAddress(poi.tags, poi._lat, poi._lon),
          source: 'osm',
        });
      }
    }
  }

  // 3. OSM tags (operator, brand)
  if (options.osm) {
    const brand = options.osm.tags['brand'] || options.osm.tags['operator'];
    if (brand && !isSelfBuildingAddress(brand)) {
      addIfUnique({
        name: brand,
        category: options.osm.category || 'Organization',
        source: 'osm',
      });
    }
  }

  return result;
}
