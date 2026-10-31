import { WIKIPEDIA_API_ENDPOINT } from '../constants';

export interface WikiDescriptionResult {
  title: string;
  description: string;
  terms: string[];
  thumbnail?: string | undefined;
}

/** Clean Wikipedia pronunciation guides and bracketed clutter for a crisp reading experience */
export function cleanWikiExtract(text: string): string {
  return text
    // Remove phonetic guides like ( EYE-fəl; French: Tour Eiffel [tuʁ ɛfɛl] )
    .replace(/\(\s*([A-Z]{2,}-[^;)]*;?[^)]*|French:[^)]*|listen\s*\([^)]*\))\s*\)/gi, '')
    // Remove empty brackets left over
    .replace(/\(\s*\)/g, '')
    // Collapse extra spaces
    .replace(/[ \t]{2,}/g, ' ')
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

  return {
    title,
    description,
    terms,
    thumbnail,
  };
}

let wikiController: AbortController | null = null;

export async function fetchWikiDescription(titleOrQuery: string): Promise<WikiDescriptionResult> {
  wikiController?.abort();
  wikiController = new AbortController();

  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts|pageimages|links',
    exintro: '1',
    explaintext: '1',
    pllimit: '80',
    plnamespace: '0',
    titles: titleOrQuery,
    pithumbsize: '600',
    redirects: '1',
    format: 'json',
    origin: '*',
  });

  const url = `${WIKIPEDIA_API_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, { signal: wikiController.signal });

  if (!res.ok) {
    throw new Error(`Wikipedia error ${res.status}`);
  }

  const data: unknown = await res.json();
  return parseWikiDescriptionResponse(data);
}
