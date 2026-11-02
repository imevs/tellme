import { describe, it, expect } from 'vitest';
import {
  cleanWikiExtract,
  extractMatchingTerms,
  parseWikiDescriptionResponse,
  resolveWikiTitleFromTag,
  isGenericOrWrongLocationArticle,
  resolveEnglishCountryName,
} from '../../src/api/wiki';

describe('cleanWikiExtract()', () => {
  it('cleans pronunciation guides and brackets', () => {
    const raw = 'The Eiffel Tower ( EYE-fəl; French: Tour Eiffel [tuʁ ɛfɛl] ) is a wrought-iron tower.';
    const cleaned = cleanWikiExtract(raw);
    expect(cleaned).toContain('The Eiffel Tower');
    expect(cleaned).toContain('is a wrought-iron tower.');
    expect(cleaned).not.toContain('EYE-fəl');
  });

  it('cleans Latvian and German parenthetical translations', () => {
    const raw = 'Riga Cathedral (Latvian: Rīgas Doms; German: Dom zu Riga) is the Evangelical Lutheran cathedral in Riga, Latvia.';
    const cleaned = cleanWikiExtract(raw);
    expect(cleaned).toBe('Riga Cathedral is the Evangelical Lutheran cathedral in Riga, Latvia.');
  });

  it('preserves clean sentences', () => {
    const raw = 'The Louvre Museum is the world’s most-visited museum. It is located in Paris.';
    expect(cleanWikiExtract(raw)).toBe(raw);
  });
});

describe('resolveWikiTitleFromTag()', () => {
  it('extracts English title and returns null for non-English prefix so Wikidata sitelink is preferred', () => {
    expect(resolveWikiTitleFromTag('en:Riga Cathedral')).toBe('Riga Cathedral');
    expect(resolveWikiTitleFromTag('Riga Cathedral')).toBe('Riga Cathedral');
    expect(resolveWikiTitleFromTag('lv:Rīgas Doms')).toBeNull();
    expect(resolveWikiTitleFromTag(null)).toBeNull();
  });
});

describe('extractMatchingTerms()', () => {
  it('extracts terms from links that appear in description', () => {
    const desc = 'Gustave Eiffel designed the Eiffel Tower for the World’s Fair during the French Revolution.';
    const links = ['Eiffel Tower', 'French Revolution', 'Statue of Liberty', 'Tokyo Tower'];

    const terms = extractMatchingTerms(desc, links);
    expect(terms).toContain('Eiffel Tower');
    expect(terms).toContain('French Revolution');
    expect(terms).not.toContain('Tokyo Tower');
  });

  it('falls back to capitalized phrases if few links match', () => {
    const desc = 'Built near Champ de Mars and Notre Dame in central Paris.';
    const terms = extractMatchingTerms(desc, []);
    expect(terms.length).toBeGreaterThan(0);
  });
});

describe('parseWikiDescriptionResponse()', () => {
  it('parses valid Wikipedia API response', () => {
    const data = {
      query: {
        pages: {
          '101': {
            pageid: 101,
            title: 'Louvre Museum',
            extract: 'The Louvre Museum is a national art museum in Paris.',
            links: [{ title: 'Paris' }, { title: 'Art museum' }],
            thumbnail: { source: 'https://example.com/louvre.jpg' },
          },
        },
      },
    };

    const res = parseWikiDescriptionResponse(data);
    expect(res.title).toBe('Louvre Museum');
    expect(res.description).toContain('art museum in Paris');
    expect(res.thumbnail).toBe('https://example.com/louvre.jpg');
    expect(res.terms).toContain('Paris');
  });

  it('throws when page is missing or invalid', () => {
    expect(() => parseWikiDescriptionResponse(null)).toThrow();
    expect(() => parseWikiDescriptionResponse({})).toThrow();
    expect(() =>
      parseWikiDescriptionResponse({
        query: { pages: { '-1': { missing: true } } },
      }),
    ).toThrow();
  });
});

describe('isGenericOrWrongLocationArticle()', () => {
  it('rejects generic global concept article "Ministry of defence" (Astana photo) when inspecting Riga, Latvia', () => {
    const context = {
      city: 'Rīga',
      country: 'Latvija',
      countryCode: 'lv',
      localName: 'Aizsardzības ministrija',
    };

    expect(resolveEnglishCountryName('Latvija', 'lv')).toBe('Latvia');

    // Global concept article (which has the Astana photo on Wikipedia)
    expect(
      isGenericOrWrongLocationArticle(
        'Ministry of defence',
        'A ministry of defence or defense ministry is the common name for a part of a government found in states where the government is divided into ministries, responsible for matters of military defence.',
        context,
      ),
    ).toBe(true);

    // Wrong-country Ministry of Defence (e.g. Kazakhstan or UK)
    expect(
      isGenericOrWrongLocationArticle(
        'Ministry of Defense (Kazakhstan)',
        'The Ministry of Defense of the Republic of Kazakhstan is the central executive agency in Astana, Kazakhstan.',
        context,
      ),
    ).toBe(true);

    // Correct local article "Ministry of Defence (Latvia)"
    expect(
      isGenericOrWrongLocationArticle(
        'Ministry of Defence (Latvia)',
        'The Ministry of Defence of the Republic of Latvia is the government ministry in charge of national security and defence policy in Riga, Latvia.',
        context,
      ),
    ).toBe(false);
  });

  it('rejects foreign namesake article "Garden Palace" (Sydney, Australia) when inspecting 28 Grēcinieku iela in Riga', () => {
    const context = {
      city: 'Rīga',
      country: 'Latvija',
      countryCode: 'lv',
      lat: 56.94651,
      lon: 24.10707,
    };

    expect(
      isGenericOrWrongLocationArticle(
        'Garden Palace',
        'The Garden Palace was a large, purpose-built exhibition building constructed to house the Sydney International Exhibition in 1879 in Sydney, Australia.',
        context,
        { lat: -33.8647, lon: 151.2119 },
      ),
    ).toBe(true);
  });
});
