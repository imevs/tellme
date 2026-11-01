import type { OverpassTags } from '../types';
import { ADDRESS_DESC_LIMIT } from '../constants';

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
