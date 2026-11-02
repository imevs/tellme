import { WIKIDATA_API_ENDPOINT, WIKIPEDIA_API_ENDPOINT } from '../constants';
import { cleanWikiExtract, extractMatchingTerms, normalizeDiacritics } from './wiki';
import { highlightTerms } from '../ui/dom';
import type { OsmFeature, StreetInfo } from '../types';

// ── In-Memory Cache for Street Lookups ──────────────────────
const streetCache = new Map<string, StreetInfo | null>();

/**
 * Checks whether an inspected place or OSM feature is a specific building.
 */
export function isBuildingFeature(
  osm?: OsmFeature | null,
  category?: string,
  tags?: Record<string, string>,
): boolean {
  if (category === 'building') return true;

  if (osm) {
    if (osm.category === 'building') return true;
    if (osm.type === 'building') return true;
    if (osm.address?.houseNumber) return true;

    const t = { ...osm.tags, ...(tags || {}) };
    if (t['building'] && t['building'] !== 'no') return true;
    if (t['addr:housenumber']) return true;
    if (t['building:levels'] || t['building:use']) return true;

    const buildingTypes = new Set([
      'apartments',
      'house',
      'residential',
      'commercial',
      'office',
      'retail',
      'hotel',
      'dormitory',
      'school',
      'civic',
      'hospital',
      'detached',
      'terrace',
      'barracks',
    ]);
    if (buildingTypes.has(osm.type)) return true;
  }

  if (tags) {
    if (tags['building'] && tags['building'] !== 'no') return true;
    if (tags['addr:housenumber']) return true;
  }

  return false;
}

/**
 * Extracts and cleans the street name from an OSM feature or address string.
 */
export function extractStreetName(
  osm?: OsmFeature | null,
  address?: string,
): string | null {
  let candidate = osm?.address?.road || osm?.tags?.['addr:street'];

  if (!candidate && address) {
    // Attempt parsing street from address string like "14 Rue Saint-Denis, 75001 Paris"
    // or "Rue de Rivoli, Paris"
    const trimmed = address.trim();
    const houseNumberMatch = trimmed.match(/^\d+[\w-]*\s+([^,]+)/);
    if (houseNumberMatch?.[1]) {
      candidate = houseNumberMatch[1];
    } else {
      const firstSegment = trimmed.split(',')[0]?.trim();
      if (firstSegment && !/^\d+$/.test(firstSegment)) {
        candidate = firstSegment;
      }
    }
  }

  if (!candidate) return null;

  const clean = candidate.trim().replace(/^[\d\s,]+/, '').replace(/[\d\s,]+$/, '');
  if (clean.length < 3) return null;

  // Filter out non-street generic terms
  const genericRoads = new Set(['unnamed road', 'service road', 'path', 'track', 'footway', 'cycleway']);
  if (genericRoads.has(clean.toLowerCase())) return null;

  return clean;
}

const STREET_TYPE_REGEX = /\b(street|road|avenue|boulevard|rue|thoroughfare|lane|drive|way|alley|strada|calle|straße|route|plaza|square|place|corso|via)\b/i;

/**
 * Searches Wikidata for a street entity matching the street name and optional city.
 */
export async function searchWikidataStreet(
  streetName: string,
  city?: string,
  signal?: AbortSignal,
): Promise<{ qid: string; label: string; description: string; sitelink?: string | undefined } | null> {
  try {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: streetName,
      language: 'en',
      format: 'json',
      origin: '*',
      limit: '7',
    });

    const res = await fetch(`${WIKIDATA_API_ENDPOINT}?${params.toString()}`, signal ? { signal } : {});
    if (!res.ok) return null;

    const data = await res.json() as { search?: Array<{ id?: string; label?: string; description?: string }> };
    const items = data.search || [];
    if (items.length === 0) return null;

    // Prioritize match whose description mentions street and city (normalized for diacritics, e.g. "Rīga" -> "riga")
    const cityNorm = city ? normalizeDiacritics(city) : '';
    let chosen = items.find(item => {
      const desc = item.description || '';
      return STREET_TYPE_REGEX.test(desc) && (!cityNorm || normalizeDiacritics(desc).includes(cityNorm));
    });

    if (!chosen) {
      chosen = items.find(item => {
        const desc = item.description || '';
        if (!STREET_TYPE_REGEX.test(desc)) return false;
        // If we know the target city, never pick a street whose description explicitly places it in a different city
        if (cityNorm && /\b(?:in|at)\s+[a-z]/i.test(desc) && !normalizeDiacritics(desc).includes(cityNorm)) {
          return false;
        }
        return true;
      });
    }

    if (!chosen || !chosen.id) return null;

    // Fetch English Wikipedia sitelink for the chosen entity
    let sitelink: string | undefined;
    try {
      const getParams = new URLSearchParams({
        action: 'wbgetentities',
        ids: chosen.id,
        props: 'sitelinks',
        format: 'json',
        origin: '*',
      });
      const getRes = await fetch(`${WIKIDATA_API_ENDPOINT}?${getParams.toString()}`, signal ? { signal } : {});
      if (getRes.ok) {
        const getData = await getRes.json() as {
          entities?: Record<string, { sitelinks?: { enwiki?: { title?: string } } }>;
        };
        sitelink = getData.entities?.[chosen.id]?.sitelinks?.enwiki?.title;
      }
    } catch {
      // Sitelink lookup failure is non-fatal
    }

    return {
      qid: chosen.id,
      label: chosen.label || streetName,
      description: chosen.description || 'Street',
      sitelink,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches Wikipedia article summary, image, and terms for a street.
 */
export async function fetchStreetWikipedia(
  streetName: string,
  city?: string,
  preferredTitle?: string,
  signal?: AbortSignal,
): Promise<{ title: string; description: string; terms: string[]; thumbnail?: string | undefined; url?: string | undefined } | null> {
  // 1. Try preferredTitle or direct streetName lookup
  const titlesToTry = [preferredTitle, streetName].filter((t): t is string => Boolean(t && t.trim()));

  for (const t of titlesToTry) {
    try {
      const params = new URLSearchParams({
        action: 'query',
        prop: 'extracts|pageimages|links',
        exintro: '1',
        explaintext: '1',
        pllimit: '40',
        plnamespace: '0',
        titles: t,
        pithumbsize: '600',
        redirects: '1',
        format: 'json',
        origin: '*',
      });

      const res = await fetch(`${WIKIPEDIA_API_ENDPOINT}?${params.toString()}`, signal ? { signal } : {});
      if (!res.ok) continue;

      const data = await res.json() as {
        query?: {
          pages?: Record<string, {
            missing?: boolean;
            title?: string;
            extract?: string;
            links?: Array<{ title?: string }>;
            thumbnail?: { source?: string };
          }>;
        };
      };

      const pages = data.query?.pages;
      if (!pages) continue;

      const page = Object.values(pages)[0];
      if (!page || page.missing || !page.extract) continue;

      const rawExtract = page.extract.trim();
      // Avoid disambiguation page
      if (rawExtract.toLowerCase().includes('may refer to:')) continue;

      const title = page.title || t;
      const description = cleanWikiExtract(rawExtract);
      const rawLinks = (page.links || []).map(l => l.title || '').filter(Boolean);
      const terms = extractMatchingTerms(description, rawLinks);
      const thumbnail = page.thumbnail?.source;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

      return { title, description, terms, thumbnail, url };
    } catch {
      // Try next
    }
  }

  // 2. Fallback: generator search on Wikipedia for "${streetName} ${city}"
  try {
    const searchTerms = `${streetName} ${city || ''}`.trim();
    const searchParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: searchTerms,
      gsrlimit: '4',
      prop: 'extracts|pageimages|links',
      exintro: '1',
      explaintext: '1',
      pithumbsize: '600',
      format: 'json',
      origin: '*',
    });

    const res = await fetch(`${WIKIPEDIA_API_ENDPOINT}?${searchParams.toString()}`, signal ? { signal } : {});
    if (res.ok) {
      const data = await res.json() as {
        query?: {
          pages?: Record<string, {
            title?: string;
            extract?: string;
            links?: Array<{ title?: string }>;
            thumbnail?: { source?: string };
          }>;
        };
      };

      const pages = Object.values(data.query?.pages || {});
      for (const p of pages) {
        if (!p.extract || p.extract.toLowerCase().includes('may refer to:')) continue;

        const title = p.title || streetName;
        // Check if page title contains the street name or city
        const titleLower = title.toLowerCase();
        const streetLower = streetName.toLowerCase();
        if (titleLower.includes(streetLower) || streetLower.includes(titleLower)) {
          const description = cleanWikiExtract(p.extract);
          const rawLinks = (p.links || []).map(l => l.title || '').filter(Boolean);
          const terms = extractMatchingTerms(description, rawLinks);
          const thumbnail = p.thumbnail?.source;
          const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

          return { title, description, terms, thumbnail, url };
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}

/**
 * Fetches structured and narrative information about a street.
 * Returns null if no descriptive information is available.
 */
export async function fetchStreetInfo(
  streetName: string,
  city?: string,
  signal?: AbortSignal,
): Promise<StreetInfo | null> {
  const cacheKey = `${streetName.toLowerCase()}|${(city || '').toLowerCase()}`;
  if (streetCache.has(cacheKey)) {
    return streetCache.get(cacheKey)!;
  }

  try {
    // 1. Search Wikidata for entity & sitelink
    const wdMatch = await searchWikidataStreet(streetName, city, signal);

    // 2. Fetch Wikipedia using sitelink or street name
    const wikiResult = await fetchStreetWikipedia(
      streetName,
      city,
      wdMatch?.sitelink,
      signal,
    );

    if (wikiResult) {
      const terms = wikiResult.terms.length > 0 ? wikiResult.terms : [streetName];
      const descriptionHtml = highlightTerms(wikiResult.description, terms);

      const info: StreetInfo = {
        name: streetName,
        title: wikiResult.title,
        subtitle: wdMatch?.description ? wdMatch.description : (city ? `Street in ${city}` : 'Street Guide'),
        descriptionHtml,
        rawDescription: wikiResult.description,
        thumbnail: wikiResult.thumbnail,
        terms,
        wikipediaUrl: wikiResult.url,
        wikidataId: wdMatch?.qid,
        source: 'wikipedia',
      };

      streetCache.set(cacheKey, info);
      return info;
    }

    // 3. Fallback to Wikidata description only if it is a meaningful narrative (> 60 chars)
    if (wdMatch && wdMatch.description && wdMatch.description.trim().length > 60) {
      const info: StreetInfo = {
        name: streetName,
        title: wdMatch.label,
        subtitle: city ? `Street in ${city}` : 'Street Guide',
        descriptionHtml: `<p>${wdMatch.description}</p>`,
        rawDescription: wdMatch.description,
        wikidataId: wdMatch.qid,
        terms: [streetName],
        source: 'wikidata',
      };

      streetCache.set(cacheKey, info);
      return info;
    }

    // No rich information found
    streetCache.set(cacheKey, null);
    return null;
  } catch {
    streetCache.set(cacheKey, null);
    return null;
  }
}
