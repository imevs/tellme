import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isBuildingFeature,
  extractStreetName,
  searchWikidataStreet,
  fetchStreetWikipedia,
  fetchStreetInfo,
} from '../../src/api/street';
import type { OsmFeature } from '../../src/types';

describe('street api', () => {
  describe('isBuildingFeature', () => {
    it('returns true when category is building', () => {
      expect(isBuildingFeature(null, 'building')).toBe(true);
    });

    it('returns true when osm.category is building', () => {
      const osm = { category: 'building', tags: {} } as unknown as OsmFeature;
      expect(isBuildingFeature(osm)).toBe(true);
    });

    it('returns true when osm.type is building or residential type', () => {
      const osm = { category: 'place', type: 'apartments', tags: {} } as unknown as OsmFeature;
      expect(isBuildingFeature(osm)).toBe(true);
    });

    it('returns true when osm has houseNumber', () => {
      const osm = {
        category: 'place',
        type: 'feature',
        address: { houseNumber: '42', road: 'Baker Street' },
        tags: {},
      } as unknown as OsmFeature;
      expect(isBuildingFeature(osm)).toBe(true);
    });

    it('returns true when tags contain building=yes', () => {
      const osm = {
        category: 'place',
        type: 'feature',
        tags: { building: 'yes' },
      } as unknown as OsmFeature;
      expect(isBuildingFeature(osm)).toBe(true);
    });

    it('returns false for park or natural features without building tags', () => {
      const osm = {
        category: 'leisure',
        type: 'park',
        tags: { leisure: 'park' },
      } as unknown as OsmFeature;
      expect(isBuildingFeature(osm, 'leisure')).toBe(false);
    });
  });

  describe('extractStreetName', () => {
    it('extracts road from osm.address', () => {
      const osm = {
        address: { road: 'Rue de Rivoli', houseNumber: '14' },
      } as unknown as OsmFeature;
      expect(extractStreetName(osm)).toBe('Rue de Rivoli');
    });

    it('extracts addr:street tag when address.road is missing', () => {
      const osm = {
        address: {},
        tags: { 'addr:street': 'Champs-Élysées' },
      } as unknown as OsmFeature;
      expect(extractStreetName(osm)).toBe('Champs-Élysées');
    });

    it('extracts street from address string with house number', () => {
      expect(extractStreetName(null, '14 Rue Saint-Denis, 75001 Paris')).toBe('Rue Saint-Denis');
    });

    it('returns null for unnamed road or empty string', () => {
      expect(extractStreetName(null, 'unnamed road')).toBe(null);
      expect(extractStreetName(null, '')).toBe(null);
    });
  });

  describe('searchWikidataStreet', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('finds street entity matching city', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            search: [
              { id: 'Q1', label: 'Other Thing', description: 'album' },
              { id: 'Q141747', label: 'rue de Rivoli', description: 'street in Paris, France' },
            ],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            entities: {
              Q141747: {
                sitelinks: {
                  enwiki: { title: 'Rue de Rivoli' },
                },
              },
            },
          }),
        } as Response);

      const result = await searchWikidataStreet('Rue de Rivoli', 'Paris');
      expect(result).not.toBeNull();
      expect(result?.qid).toBe('Q141747');
      expect(result?.sitelink).toBe('Rue de Rivoli');
      expect(result?.description).toBe('street in Paris, France');
    });
  });

  describe('fetchStreetWikipedia', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches wikipedia extract and thumbnail for street', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              123: {
                title: 'Rue de Rivoli',
                extract: 'The Rue de Rivoli is a famous commercial street in central Paris.',
                thumbnail: { source: 'https://example.com/rivoli.jpg' },
                links: [{ title: 'Paris' }, { title: 'Napoleon' }],
              },
            },
          },
        }),
      } as Response);

      const result = await fetchStreetWikipedia('Rue de Rivoli', 'Paris');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Rue de Rivoli');
      expect(result?.description).toContain('Rue de Rivoli is a famous commercial street');
      expect(result?.thumbnail).toBe('https://example.com/rivoli.jpg');
      expect(result?.url).toBe('https://en.wikipedia.org/wiki/Rue_de_Rivoli');
    });
  });

  describe('fetchStreetInfo', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns enriched StreetInfo with highlighted terms', async () => {
      const mockFetch = vi.mocked(fetch);
      // 1. Wikidata search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          search: [
            { id: 'Q141747', label: 'rue de Rivoli', description: 'street in Paris, France' },
          ],
        }),
      } as Response);
      // 2. Wikidata sitelink
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q141747: {
              sitelinks: {
                enwiki: { title: 'Rue de Rivoli' },
              },
            },
          },
        }),
      } as Response);
      // 3. Wikipedia extract
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              123: {
                title: 'Rue de Rivoli',
                extract: 'The Rue de Rivoli is a famous commercial street in central Paris.',
                thumbnail: { source: 'https://example.com/rivoli.jpg' },
                links: [{ title: 'Paris' }],
              },
            },
          },
        }),
      } as Response);

      const info = await fetchStreetInfo('Rue de Rivoli', 'Paris');
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Rue de Rivoli');
      expect(info?.thumbnail).toBe('https://example.com/rivoli.jpg');
      expect(info?.subtitle).toContain('street in Paris, France');
      expect(info?.descriptionHtml).toContain('class="term"');
      expect(info?.wikipediaUrl).toBe('https://en.wikipedia.org/wiki/Rue_de_Rivoli');
    });
  });
});
