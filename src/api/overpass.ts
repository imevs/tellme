import type { OverpassElement, OverpassTags, POI } from '../types';
import type { LatLng } from 'leaflet';
import {
  OVERPASS_ENDPOINT,
  OVERPASS_TIMEOUT_S,
  OVERPASS_MAX_NODES,
  MAX_POIS,
  ADDRESS_DESC_LIMIT,
} from '../constants';

// ── Emoji mapping ──────────────────────────────────────
const TOURISM_EMOJI: Record<string, string> = {
  museum:     '🏛️',
  attraction: '⭐',
  viewpoint:  '🔭',
  gallery:    '🖼️',
  hotel:      '🏨',
  hostel:     '🏨',
  artwork:    '🎨',
};

const HISTORIC_EMOJI: Record<string, string> = {
  castle:   '🏰',
  monument: '🗿',
  church:   '⛪',
};

const AMENITY_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe:       '☕',
  bar:        '🍺',
  pub:        '🍺',
  bakery:     '🥐',
  fast_food:  '🍔',
};

const LEISURE_EMOJI: Record<string, string> = {
  park:   '🌿',
  garden: '🌸',
};

export function poiEmoji(tags: OverpassTags): string {
  if (tags.tourism)  return TOURISM_EMOJI[tags.tourism]  ?? '🌟';
  if (tags.historic) return HISTORIC_EMOJI[tags.historic] ?? '🏺';
  if (tags.amenity)  return AMENITY_EMOJI[tags.amenity]  ?? '🍴';
  if (tags.leisure)  return LEISURE_EMOJI[tags.leisure]  ?? '🎭';
  if (tags.shop)     return '🛍️';
  return '📍';
}

export function poiCategory(tags: OverpassTags): string {
  return tags.tourism ?? tags.historic ?? tags.amenity ?? tags.leisure ?? tags.shop ?? 'place';
}

export function poiAddress(tags: OverpassTags, lat: number, lon: number): string {
  const parts: string[] = [];
  if (tags['addr:street']) {
    parts.push(
      tags['addr:housenumber']
        ? `${tags['addr:street']} ${tags['addr:housenumber']}`
        : tags['addr:street'],
    );
  }
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (parts.length === 0 && tags.description) {
    parts.push(tags.description.slice(0, ADDRESS_DESC_LIMIT));
  }
  if (parts.length === 0) parts.push(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  return parts.join(', ');
}

export function buildOverpassQuery(bbox: string, cat: string): string {
  const parts: string[] = [];

  const add = (key: string, value?: string): void => {
    const filter = value ? `["${key}"="${value}"]` : `["${key}"]`;
    parts.push(`node${filter}(${bbox});`, `way${filter}(${bbox});`);
  };

  if (cat === 'all' || cat === 'tourism')  add('tourism');
  if (cat === 'all' || cat === 'historic') add('historic');
  if (cat === 'all' || cat === 'amenity') {
    for (const v of ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'bakery']) {
      add('amenity', v);
    }
  }
  if (cat === 'all' || cat === 'leisure') add('leisure');
  if (cat === 'all' || cat === 'shop')    add('shop');

  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(${parts.join('')});out center ${OVERPASS_MAX_NODES};`;
}

export function parsePOIs(elements: OverpassElement[], center: LatLng): POI[] {
  return elements
    .filter((e): e is OverpassElement & { tags: OverpassTags } => {
      const name = e.tags?.name ?? e.tags?.['name:en'];
      return !!name && (e.lat != null || e.center?.lat != null);
    })
    .map(e => {
      const lat  = e.lat  ?? e.center!.lat;
      const lon  = e.lon  ?? e.center!.lon;
      // Use Haversine approximation without Leaflet dependency for pure testability
      const dist = haversineKm(center.lat, center.lng, lat, lon);
      return { ...e, tags: e.tags!, _lat: lat, _lon: lon, _dist: dist };
    })
    .sort((a, b) => a._dist - b._dist)
    .slice(0, MAX_POIS);
}

/** Haversine distance in km — pure function, no Leaflet dependency */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R  = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dO = ((lon2 - lon1) * Math.PI) / 180;
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let overpassController: AbortController | null = null;

export async function fetchPOIs(
  bbox: string,
  cat: string,
): Promise<OverpassElement[]> {
  // Cancel any in-flight Overpass request
  overpassController?.abort();
  overpassController = new AbortController();

  const query = buildOverpassQuery(bbox, cat);
  const url   = `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`;

  const res = await fetch(url, { signal: overpassController.signal });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited — slow down a moment');
    throw new Error(`Overpass error ${res.status}`);
  }

  const data = await res.json() as { elements?: OverpassElement[] };
  return data.elements ?? [];
}
