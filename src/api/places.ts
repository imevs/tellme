import type { POI, OverpassTags } from '../types';
import { WIKIPEDIA_API_ENDPOINT, MAX_POIS } from '../constants';
import { haversineKm } from './overpass';

// ── Category heuristics from Wikipedia title & description ──

export function inferCategory(title: string, desc = ''): { cat: string; subcat: string } {
  const text = `${title} ${desc}`.toLowerCase();

  if (
    text.includes('church') ||
    text.includes('cathedral') ||
    text.includes('basilica') ||
    text.includes('abbey') ||
    text.includes('chapel')
  ) {
    return { cat: 'historic', subcat: 'church' };
  }

  if (
    text.includes('castle') ||
    text.includes('palace') ||
    text.includes('château') ||
    text.includes('fortress') ||
    text.includes('bastion')
  ) {
    return { cat: 'historic', subcat: 'castle' };
  }

  if (
    text.includes('monument') ||
    text.includes('memorial') ||
    text.includes('statue') ||
    text.includes('pantheon') ||
    text.includes('tomb') ||
    text.includes('cemetery')
  ) {
    return { cat: 'historic', subcat: 'monument' };
  }

  if (text.includes('museum') || text.includes('gallery') || text.includes('collection')) {
    return { cat: 'tourism', subcat: 'museum' };
  }

  if (
    text.includes('park') ||
    text.includes('garden') ||
    text.includes('jardin') ||
    text.includes('forest') ||
    text.includes('promenade') ||
    text.includes('square')
  ) {
    return { cat: 'leisure', subcat: 'park' };
  }

  if (
    text.includes('cafe') ||
    text.includes('café') ||
    text.includes('restaurant') ||
    text.includes('bistro') ||
    text.includes('brasserie') ||
    text.includes('bakery')
  ) {
    return { cat: 'amenity', subcat: 'restaurant' };
  }

  if (
    text.includes('market') ||
    text.includes('mall') ||
    text.includes('bazaar') ||
    text.includes('shop') ||
    text.includes('boutique')
  ) {
    return { cat: 'shop', subcat: 'shop' };
  }

  if (
    text.includes('tower') ||
    text.includes('bridge') ||
    text.includes('pont') ||
    text.includes('viewpoint') ||
    text.includes('arch')
  ) {
    return { cat: 'tourism', subcat: 'viewpoint' };
  }

  return { cat: 'tourism', subcat: 'attraction' };
}

// ── Wikipedia response parsing (pure — easy to test) ─────────

interface WikiPageRaw {
  pageid: number;
  title: string;
  description?: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  thumbnail?: { source: string };
}

export function parseWikipediaPlaces(
  data: unknown,
  centerLat: number,
  centerLon: number,
  filterCat = 'all',
): POI[] {
  if (typeof data !== 'object' || data === null) return [];

  const query = (data as Record<string, unknown>)['query'] as Record<string, unknown> | undefined;
  const pages = query?.['pages'] as Record<string, WikiPageRaw> | undefined;
  if (!pages) return [];

  const rawList = Object.values(pages);

  return rawList
    .filter(p => {
      const coord = p.coordinates?.[0];
      return !!coord && typeof coord.lat === 'number' && typeof coord.lon === 'number' && !!p.title;
    })
    .map((p, idx) => {
      const coord = p.coordinates![0]!;
      const dist = haversineKm(centerLat, centerLon, coord.lat, coord.lon);
      const { cat, subcat } = inferCategory(p.title, p.description ?? '');

      const tags: OverpassTags = {
        name: p.title,
        description: p.description || 'Famous landmark and cultural destination.',
        [cat]: subcat,
      };

      if (p.thumbnail?.source) {
        tags['image'] = p.thumbnail.source;
      }

      return {
        id: p.pageid || idx + 1,
        type: 'node' as const,
        _lat: coord.lat,
        _lon: coord.lon,
        _dist: dist,
        tags,
      };
    })
    .filter(poi => {
      if (!filterCat || filterCat === 'all') return true;
      return !!poi.tags[filterCat];
    })
    .sort((a, b) => a._dist - b._dist)
    .slice(0, MAX_POIS);
}

// ── Fetch nearby places via Wikipedia GeoSearch ─────────────

let placesController: AbortController | null = null;

export async function fetchNearbyPlaces(
  lat: number,
  lon: number,
  cat = 'all',
  radiusMeters = 8000,
): Promise<POI[]> {
  placesController?.abort();
  placesController = new AbortController();

  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: String(radiusMeters),
    ggslimit: '24',
    prop: 'coordinates|description|pageimages',
    piprop: 'thumbnail',
    pithumbsize: '240',
    format: 'json',
    origin: '*',
  });

  const url = `${WIKIPEDIA_API_ENDPOINT}?${params.toString()}`;

  const res = await fetch(url, { signal: placesController.signal });
  if (!res.ok) {
    throw new Error(`Wikipedia error ${res.status}`);
  }

  const json: unknown = await res.json();
  return parseWikipediaPlaces(json, lat, lon, cat);
}
