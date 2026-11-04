import type { POI, OverpassTags } from '../types';
import { WIKIPEDIA_API_ENDPOINT, MAX_POIS } from '../constants';
import { haversineKm } from './overpass';
import { apiFetch } from './http';

// ── Category heuristics from Wikipedia title & description ──

export function inferCategory(title: string, desc = ''): { cat: string; subcat: string } {
  const text = `${title} ${desc}`.toLowerCase();

  if (/\b(church|cathedral|basilica|abbey|chapel)\b/.test(text)) {
    return { cat: 'historic', subcat: 'church' };
  }

  if (/\b(castle|palace|château|fortress|bastion)\b/.test(text)) {
    return { cat: 'historic', subcat: 'castle' };
  }

  if (/\b(monument|memorial|statue|pantheon|tomb|cemetery)\b/.test(text)) {
    return { cat: 'historic', subcat: 'monument' };
  }

  if (/\b(museum|gallery|collection)\b/.test(text)) {
    return { cat: 'tourism', subcat: 'museum' };
  }

  if (/\b(park|garden|jardin|forest|promenade|square)\b/.test(text)) {
    return { cat: 'leisure', subcat: 'park' };
  }

  if (/\b(cafe|café|coffee|restaurant|bistro|brasserie|bakery)\b/.test(text)) {
    return { cat: 'amenity', subcat: 'restaurant' };
  }

  if (/\b(market|mall|bazaar|shop|shops|boutique|store|stores)\b/.test(text)) {
    return { cat: 'shop', subcat: 'shop' };
  }

  if (/\b(tower|bridge|pont|viewpoint|arch)\b/.test(text)) {
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

  const res = await apiFetch(url, { signal: placesController.signal });
  if (!res.ok) {
    throw new Error(`Wikipedia error ${res.status}`);
  }

  const json: unknown = await res.json();
  return parseWikipediaPlaces(json, lat, lon, cat);
}

// ── Default curated places (shown as fallback for Paris) ──
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
