import { WIKIPEDIA_API_ENDPOINT } from '../constants';
import { apiFetch, anySignal, throwIfAborted } from './http';

export interface WikiDescriptionResult {
  title: string;
  description: string;
  terms: string[];
  thumbnail?: string | undefined;
  coordinates?: { lat: number; lon: number } | undefined;
}

export interface WikiLookupContext {
  city?: string | undefined;
  country?: string | undefined;
  countryCode?: string | undefined;
  localName?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
}

const COUNTRY_CODE_TO_ENGLISH: Record<string, string> = {
  lv: 'Latvia',
  ee: 'Estonia',
  lt: 'Lithuania',
  fr: 'France',
  de: 'Germany',
  es: 'Spain',
  it: 'Italy',
  pl: 'Poland',
  gb: 'United Kingdom',
  uk: 'United Kingdom',
  us: 'United States',
  nl: 'Netherlands',
  be: 'Belgium',
  at: 'Austria',
  ch: 'Switzerland',
  cz: 'Czech Republic',
  sk: 'Slovakia',
  hu: 'Hungary',
  se: 'Sweden',
  no: 'Norway',
  fi: 'Finland',
  dk: 'Denmark',
  pt: 'Portugal',
  gr: 'Greece',
  ie: 'Ireland',
  ro: 'Romania',
  bg: 'Bulgaria',
  hr: 'Croatia',
  si: 'Slovenia',
  ua: 'Ukraine',
  ge: 'Georgia',
  kz: 'Kazakhstan',
};

export function normalizeDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolveEnglishCountryName(
  country?: string,
  countryCode?: string,
): string | null {
  if (countryCode) {
    const mapped = COUNTRY_CODE_TO_ENGLISH[countryCode.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  if (!country || !country.trim()) return null;
  const norm = normalizeDiacritics(country);
  if (norm === 'latvija' || norm === 'latvia') return 'Latvia';
  if (norm === 'eesti' || norm === 'estonia') return 'Estonia';
  if (norm === 'lietuva' || norm === 'lithuania') return 'Lithuania';
  if (norm === 'deutschland' || norm === 'germany') return 'Germany';
  if (norm === 'espana' || norm === 'spain') return 'Spain';
  if (norm === 'italia' || norm === 'italy') return 'Italy';
  if (norm === 'polska' || norm === 'poland') return 'Poland';
  if (norm === 'sverige' || norm === 'sweden') return 'Sweden';
  if (norm === 'suomi' || norm === 'finland') return 'Finland';
  return country.trim();
}

const GENERIC_INSTITUTION_TITLE_REGEX =
  /\b(ministry|department|embassy|consulate|parliament|supreme court|constitutional court|central bank|national bank|city hall|town hall|national library|national museum|national opera|national theatre|national theater|state police|municipal police|academy of sciences)\b/i;

/**
 * Detects whether a Wikipedia article is a disambiguation page, a generic global concept
 * article (e.g. "Ministry of defence" showing a photo from Astana when inspecting Riga),
 * or an article about a namesake place in a different city/country (e.g. "Garden Palace" in Sydney, Australia).
 */
export function isGenericOrWrongLocationArticle(
  title: string,
  rawExtract: string,
  context?: WikiLookupContext,
  articleCoords?: { lat: number; lon: number },
): boolean {
  const extract = rawExtract.trim();
  if (!extract) return true;

  // 1. Disambiguation page
  if (/\b(may refer to|most commonly refers to|can refer to):/i.test(extract)) {
    return true;
  }

  // 2. If article has explicit coordinates and target context has coordinates, reject if > 25 km (~0.25 deg) away
  if (
    articleCoords &&
    context?.lat != null &&
    context?.lon != null &&
    (Math.abs(articleCoords.lat - context.lat) > 0.25 ||
      Math.abs(articleCoords.lon - context.lon) > 0.35)
  ) {
    return true;
  }

  // 3. Generic global concept definition (e.g. "A ministry of defence or defense ministry is the common name for a part of a government...")
  const firstSentence = extract.split(/\.\s+/)[0] || extract;
  const isGenericConceptSentence =
    /^(?:A|An)\s+[^.]{2,75}\s+is\s+(?:a|an|the\s+common\s+name|a\s+type\s+of|any|part\s+of\s+a\s+government|a\s+government\s+ministry|an?\s+executive\s+department|a\s+generic\s+term)\b/i.test(
      firstSentence,
    );

  const locationTokens: string[] = [];
  if (context?.city) {
    locationTokens.push(normalizeDiacritics(context.city));
  }
  const engCountry = resolveEnglishCountryName(context?.country, context?.countryCode);
  if (engCountry) {
    const normCountry = normalizeDiacritics(engCountry);
    locationTokens.push(normCountry);
    if (normCountry.endsWith('ia') || normCountry.endsWith('ya')) {
      locationTokens.push(normCountry.slice(0, -1)); // e.g. "latvia" -> "latvi" (matches "Latvian")
    }
  }
  if (context?.country) {
    locationTokens.push(normalizeDiacritics(context.country));
  }
  if (context?.localName) {
    locationTokens.push(normalizeDiacritics(context.localName));
  }

  const uniqueTokens = Array.from(new Set(locationTokens.filter(t => t.length >= 3)));
  const combinedNorm = normalizeDiacritics(`${title} ${extract}`);
  const mentionsLocalContext =
    uniqueTokens.length === 0 || uniqueTokens.some(tok => combinedNorm.includes(tok));

  if (isGenericConceptSentence && !mentionsLocalContext) {
    return true;
  }

  // 4. When inspecting a specific geographic location (context has city/country),
  // reject articles that do not mention the local city/country/localName at all
  if (uniqueTokens.length > 0 && !mentionsLocalContext) {
    return true;
  }

  // 5. Generic institutional title (e.g. "Ministry of Defence", "City Hall") that does not mention the local city/country
  if (
    uniqueTokens.length > 0 &&
    GENERIC_INSTITUTION_TITLE_REGEX.test(title) &&
    !mentionsLocalContext
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts an English-compatible Wikipedia article title from an OSM `wikipedia` tag
 * (e.g. "en:Riga Cathedral" -> "Riga Cathedral", "lv:Rīgas Doms" -> null so Wikidata sitelink is preferred).
 */
export function resolveWikiTitleFromTag(rawTag?: string | null): string | null {
  if (!rawTag || !rawTag.trim()) return null;
  const trimmed = rawTag.trim();
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    const lang = trimmed.slice(0, colonIdx).toLowerCase();
    const title = trimmed.slice(colonIdx + 1).trim();
    if (!title) return null;
    return lang === 'en' ? title : null;
  }
  return trimmed;
}


/** Clean Wikipedia pronunciation guides and bracketed clutter for a crisp reading experience */
export function cleanWikiExtract(text: string): string {
  return text
    // Remove phonetic guides and language translations like ( EYE-fəl; French: Tour Eiffel ) or (Latvian: Rīgas Doms; German: Dom zu Riga)
    .replace(
      /\(\s*([A-Z]{2,}-[^;)]*;?[^)]*|(?:French|Latvian|German|Russian|Spanish|Italian|Latin|Polish|Estonian|Lithuanian|Swedish|Low German|Livonian):[^)]*|listen\s*\([^)]*\))\s*\)/gi,
      '',
    )
    // Remove empty brackets left over
    .replace(/\(\s*\)/g, '')
    // Collapse extra spaces
    .replace(/[ \t]{2,}/g, ' ')
    // Clean space before punctuation left by removed parenthetical
    .replace(/\s+([,.;:])/g, '$1')
    // Limit to first 2-3 engaging paragraphs
    .split('\n\n')
    .filter(p => p.trim().length > 20)
    .slice(0, 3)
    .join('\n\n')
    .trim();
}

/** Extract matching terms from Wikipedia links that appear in the description */
export function extractMatchingTerms(description: string, linkTitles: string[]): string[] {
  const descLower = description.toLowerCase();
  const matched: string[] = [];

  // Sort longest first
  const sorted = [...linkTitles].sort((a, b) => b.length - a.length);

  for (const title of sorted) {
    if (title.length < 3 || title.length > 40) continue;
    // Check if title or simplified title is in text
    const cleanTitle = title.replace(/\s*\([^)]*\)$/, '').trim();
    if (!cleanTitle || cleanTitle.length < 3) continue;

    const idx = descLower.indexOf(cleanTitle.toLowerCase());
    if (idx !== -1) {
      // Extract exact casing from description
      const exactPhrase = description.slice(idx, idx + cleanTitle.length);
      if (!matched.some(m => m.toLowerCase() === exactPhrase.toLowerCase())) {
        matched.push(exactPhrase);
      }
    }

    if (matched.length >= 6) break;
  }

  // Fallback: if fewer than 3 terms found, match capitalized multi-word phrases
  if (matched.length < 3) {
    const capitalizedMatches = description.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    for (const phrase of capitalizedMatches) {
      if (phrase.length > 4 && !matched.some(m => m.toLowerCase() === phrase.toLowerCase())) {
        matched.push(phrase);
      }
      if (matched.length >= 6) break;
    }
  }

  return matched;
}

export function parseWikiDescriptionResponse(raw: unknown): WikiDescriptionResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid Wikipedia response');
  }

  const query = (raw as Record<string, unknown>)['query'] as Record<string, unknown> | undefined;
  const pages = query?.['pages'] as Record<string, Record<string, unknown>> | undefined;
  if (!pages) {
    throw new Error('No page found on Wikipedia');
  }

  const page = Object.values(pages)[0];
  if (!page || (page['missing'] !== undefined && page['missing'] !== false)) {
    throw new Error('Article not found on Wikipedia');
  }

  const title = (page['title'] as string) || 'Explore';
  const rawExtract = (page['extract'] as string) || 'No description available.';
  const description = cleanWikiExtract(rawExtract);

  const rawLinks = Array.isArray(page['links'])
    ? (page['links'] as Array<{ title?: string }>).map(l => l.title || '').filter(Boolean)
    : [];

  const terms = extractMatchingTerms(description, rawLinks);

  const thumbnail = (page['thumbnail'] as { source?: string } | undefined)?.source;
  const rawCoords = Array.isArray(page['coordinates'])
    ? (page['coordinates'] as Array<{ lat?: number; lon?: number }>)[0]
    : undefined;
  const coordinates =
    rawCoords && typeof rawCoords.lat === 'number' && typeof rawCoords.lon === 'number'
      ? { lat: rawCoords.lat, lon: rawCoords.lon }
      : undefined;

  return {
    title,
    description,
    terms,
    thumbnail,
    coordinates,
  };
}

let wikiController: AbortController | null = null;

async function fetchSingleWikiTitle(
  title: string,
  signal: AbortSignal,
): Promise<WikiDescriptionResult | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts|pageimages|links|coordinates',
    exintro: '1',
    explaintext: '1',
    pllimit: '80',
    plnamespace: '0',
    titles: title,
    pithumbsize: '600',
    redirects: '1',
    format: 'json',
    origin: '*',
  });

  const url = `${WIKIPEDIA_API_ENDPOINT}?${params.toString()}`;
  const res = await apiFetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Wikipedia error ${res.status}`);
  }

  const data: unknown = await res.json();
  try {
    return parseWikiDescriptionResponse(data);
  } catch {
    return null;
  }
}

export async function fetchWikiDescription(
  titleOrQuery: string,
  context?: WikiLookupContext,
  externalSignal?: AbortSignal,
): Promise<WikiDescriptionResult> {
  wikiController?.abort();
  wikiController = new AbortController();
  const signal = anySignal(wikiController.signal, externalSignal) ?? wikiController.signal;

  const direct = await fetchSingleWikiTitle(titleOrQuery, signal);
  if (
    direct &&
    !isGenericOrWrongLocationArticle(direct.title, direct.description, context, direct.coordinates)
  ) {
    return direct;
  }

  // If direct lookup missing or returned a generic global concept / wrong-country article,
  // try location-qualified titles when context is provided
  if (context) {
    const engCountry = resolveEnglishCountryName(context.country, context.countryCode);
    const city = context.city?.trim();
    const candidates: string[] = [];

    if (engCountry) {
      candidates.push(`${titleOrQuery} (${engCountry})`);
      candidates.push(`${titleOrQuery} of ${engCountry}`);
      candidates.push(`${titleOrQuery} of the Republic of ${engCountry}`);
    }
    if (city) {
      candidates.push(`${titleOrQuery} (${city})`);
      candidates.push(`${titleOrQuery}, ${city}`);
    }
    if (context.localName && context.localName !== titleOrQuery) {
      candidates.push(context.localName);
    }

    for (const candidate of candidates) {
      const res = await fetchSingleWikiTitle(candidate, signal).catch(() => null);
      throwIfAborted(signal);
      if (
        res &&
        !isGenericOrWrongLocationArticle(res.title, res.description, context, res.coordinates)
      ) {
        return res;
      }
    }
  }

  if (direct && !context) {
    return direct;
  }

  throw new Error('Article not found on Wikipedia');
}
