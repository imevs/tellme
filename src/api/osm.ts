import { NOMINATIM_ENDPOINT, PHOTON_REVERSE_ENDPOINT } from '../constants';
import type { OsmFeature } from '../types';

let osmController: AbortController | null = null;

// ── Pure parsers (easy to test without mocking network) ────

export function parseNominatimResponse(
  raw: unknown,
  fallbackLat: number,
  fallbackLon: number,
): OsmFeature | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  if (data['error']) return null;

  const osmId = Number(data['osm_id']) || 0;
  const rawOsmType = String(data['osm_type'] || 'node').toLowerCase();
  const osmType: 'node' | 'way' | 'relation' =
    rawOsmType === 'way' ? 'way' : rawOsmType === 'relation' ? 'relation' : 'node';

  const extratags = (typeof data['extratags'] === 'object' && data['extratags'] !== null)
    ? (data['extratags'] as Record<string, string>)
    : {};

  const namedetails = (typeof data['namedetails'] === 'object' && data['namedetails'] !== null)
    ? (data['namedetails'] as Record<string, string>)
    : {};

  const addrObj = (typeof data['address'] === 'object' && data['address'] !== null)
    ? (data['address'] as Record<string, string>)
    : {};

  // Best name resolution: English name -> local name -> namedetails -> address POI -> road -> display_name
  const name =
    namedetails['name:en'] ??
    namedetails['name'] ??
    (typeof data['name'] === 'string' && data['name'].trim() ? data['name'].trim() : null) ??
    addrObj['tourism'] ??
    addrObj['historic'] ??
    addrObj['amenity'] ??
    addrObj['leisure'] ??
    addrObj['building'] ??
    addrObj['road'] ??
    (typeof data['display_name'] === 'string' ? data['display_name'].split(',')[0]?.trim() : '') ??
    'Map Object';

  const category = String(data['category'] || (extratags['building'] ? 'building' : 'place'));
  const type     = String(data['type'] || 'feature');
  const displayName = typeof data['display_name'] === 'string' ? data['display_name'] : '';

  const lat = typeof data['lat'] === 'string' ? parseFloat(data['lat']) : fallbackLat;
  const lon = typeof data['lon'] === 'string' ? parseFloat(data['lon']) : fallbackLon;

  const wikidataId =
    extratags['wikidata'] ??
    extratags['subject:wikidata'] ??
    extratags['architect:wikidata'] ??
    undefined;

  const wikipedia = extratags['wikipedia'] ?? extratags['wikipedia:en'] ?? undefined;

  const startDate =
    extratags['start_date'] ??
    extratags['year_of_construction'] ??
    extratags['construction_date'] ??
    extratags['opening_date'] ??
    undefined;

  return {
    osmId,
    osmType,
    name,
    category,
    type,
    displayName,
    address: {
      road:        addrObj['road'],
      houseNumber: addrObj['house_number'] ?? addrObj['housenumber'],
      suburb:      addrObj['suburb'] ?? addrObj['neighbourhood'] ?? addrObj['quarter'],
      city:        addrObj['city'] ?? addrObj['town'] ?? addrObj['village'],
      country:     addrObj['country'],
      postcode:    addrObj['postcode'],
    },
    tags: extratags,
    wikidataId,
    wikipedia,
    startDate,
    lat,
    lon,
  };
}

export function parsePhotonResponse(
  raw: unknown,
  fallbackLat: number,
  fallbackLon: number,
): OsmFeature | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const features = Array.isArray(data['features']) ? (data['features'] as Array<Record<string, unknown>>) : [];
  if (features.length === 0) return null;

  const first = features[0];
  if (!first || typeof first !== 'object') return null;

  const props = (typeof first['properties'] === 'object' && first['properties'] !== null)
    ? (first['properties'] as Record<string, unknown>)
    : {};

  const geom = (typeof first['geometry'] === 'object' && first['geometry'] !== null)
    ? (first['geometry'] as { coordinates?: [number, number] })
    : {};

  const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [fallbackLon, fallbackLat];
  const lon = Number(coords[0]) || fallbackLon;
  const lat = Number(coords[1]) || fallbackLat;

  const osmId = Number(props['osm_id']) || 0;
  const rawType = String(props['osm_type'] || 'N').toUpperCase();
  const osmType: 'node' | 'way' | 'relation' =
    rawType === 'W' ? 'way' : rawType === 'R' ? 'relation' : 'node';

  const name = String(props['name'] || props['street'] || 'Map Object');
  const category = String(props['osm_key'] || 'place');
  const type     = String(props['osm_value'] || 'feature');

  const road = props['street'] ? String(props['street']) : undefined;
  const houseNumber = props['housenumber'] ? String(props['housenumber']) : undefined;
  const city = (props['city'] ?? props['locality'] ?? props['district']) ? String(props['city'] ?? props['locality'] ?? props['district']) : undefined;
  const country = props['country'] ? String(props['country']) : undefined;
  const postcode = props['postcode'] ? String(props['postcode']) : undefined;

  const parts = [name, road, city, country].filter(Boolean);
  const displayName = parts.join(', ');

  return {
    osmId,
    osmType,
    name,
    category,
    type,
    displayName,
    address: {
      road,
      houseNumber,
      city,
      country,
      postcode,
    },
    tags: {},
    lat,
    lon,
  };
}

export function formatOsmAddress(feature: OsmFeature): string {
  const parts: string[] = [];
  const { address } = feature;
  if (address.road) {
    parts.push(address.houseNumber ? `${address.houseNumber} ${address.road}` : address.road);
  }
  if (address.suburb) parts.push(address.suburb);
  if (address.city) parts.push(address.city);
  if (address.country) parts.push(address.country);

  if (parts.length > 0) return parts.join(', ');
  if (feature.displayName) return feature.displayName;
  return `${feature.lat.toFixed(4)}, ${feature.lon.toFixed(4)}`;
}

export function inferOsmEmoji(category: string, type: string): string {
  const text = `${category} ${type}`.toLowerCase();

  if (text.includes('church') || text.includes('cathedral') || text.includes('basilica') || text.includes('chapel')) return '⛪';
  if (text.includes('castle') || text.includes('palace') || text.includes('fortress')) return '🏰';
  if (text.includes('monument') || text.includes('memorial') || text.includes('statue')) return '🗿';
  if (text.includes('museum') || text.includes('gallery')) return '🏛️';
  if (text.includes('viewpoint') || text.includes('tower')) return '🔭';
  if (text.includes('attraction')) return '⭐';
  if (text.includes('park') || text.includes('garden') || text.includes('forest')) return '🌿';
  if (text.includes('restaurant') || text.includes('food') || text.includes('bistro')) return '🍽️';
  if (text.includes('cafe') || text.includes('café') || text.includes('bakery')) return '☕';
  if (text.includes('bar') || text.includes('pub')) return '🍺';
  if (text.includes('shop') || text.includes('mall') || text.includes('supermarket')) return '🛍️';
  if (text.includes('building') || text.includes('architecture')) return '🏢';
  if (text.includes('bridge')) return '🌉';
  return '📍';
}

// ── Network fetcher ────────────────────────────────────────

export async function fetchOsmObjectAt(
  lat: number,
  lon: number,
): Promise<OsmFeature | null> {
  osmController?.abort();
  osmController = new AbortController();
  const signal = osmController.signal;

  // 1. Try Nominatim reverse geocode with extratags
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      extratags: '1',
      namedetails: '1',
      addressdetails: '1',
      zoom: '18',
      email: 'tellme-app@explore.local',
    });
    const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;

    const res = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data: unknown = await res.json();
      const parsed = parseNominatimResponse(data, lat, lon);
      if (parsed) return parsed;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // Fall through to Komoot Photon
  }

  // 2. Fallback to Photon reverse geocode (OpenStreetMap mirror)
  try {
    const photonUrl = `${PHOTON_REVERSE_ENDPOINT}?lat=${lat}&lon=${lon}`;
    const res = await fetch(photonUrl, { signal });
    if (res.ok) {
      const data: unknown = await res.json();
      const parsed = parsePhotonResponse(data, lat, lon);
      if (parsed) return parsed;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }

  return null;
}
