import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseGooglePlaceResponse,
  parseGooglePlacesList,
  resolvePlacesAtAddress,
  getDailyCallCount,
  incrementDailyCallCount,
  canMakeGooglePlacesCall,
} from '../../src/api/googlePlaces';
import { GOOGLE_PLACES_MAX_DAILY_CALLS } from '../../src/constants';

describe('Google Places API integration (src/api/googlePlaces.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('parseGooglePlaceResponse', () => {
    it('parses valid Google Places response without ratings, prices, or phone numbers', () => {
      const mockRaw = {
        places: [
          {
            id: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',
            formattedAddress: 'Av. Gustave Eiffel, 75007 Paris, France',
            websiteUri: 'https://www.toureiffel.paris/fr',
            editorialSummary: {
              text: 'Iconic 1889 Eiffel Tower with city views & dining.',
              languageCode: 'en',
            },
            displayName: {
              text: 'Eiffel Tower',
              languageCode: 'en',
            },
            currentOpeningHours: {
              openNow: true,
            },
          },
        ],
      };

      const result = parseGooglePlaceResponse(mockRaw);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('ChIJLU7jZClu5kcR4PcOOO6p3I0');
      expect(result?.name).toBe('Eiffel Tower');
      expect(result?.openNow).toBe(true);
      expect(result?.websiteUri).toBe('https://www.toureiffel.paris/fr');
      expect(result?.formattedAddress).toBe('Av. Gustave Eiffel, 75007 Paris, France');
      expect(result?.editorialSummary).toBe('Iconic 1889 Eiffel Tower with city views & dining.');

      // Verify excluded fields are not present
      expect((result as Record<string, unknown>)['rating']).toBeUndefined();
      expect((result as Record<string, unknown>)['userRatingCount']).toBeUndefined();
      expect((result as Record<string, unknown>)['phoneNumber']).toBeUndefined();
      expect((result as Record<string, unknown>)['priceLevel']).toBeUndefined();
    });

    it('returns null for empty or error responses', () => {
      expect(parseGooglePlaceResponse(null)).toBeNull();
      expect(parseGooglePlaceResponse({})).toBeNull();
      expect(parseGooglePlaceResponse({ places: [] })).toBeNull();
    });
  });

  describe('parseGooglePlacesList', () => {
    it('parses multiple places located at address with category and open status', () => {
      const mockRaw = {
        places: [
          {
            id: 'place_1',
            displayName: { text: 'Boulangerie Eric Kayser' },
            primaryTypeDisplayName: { text: 'Bakery' },
            formattedAddress: '14 Rue de Rivoli, Paris',
            currentOpeningHours: { openNow: true },
            websiteUri: 'https://example.com/kayser',
          },
          {
            id: 'place_2',
            displayName: { text: 'Pharmacie de Rivoli' },
            primaryType: 'pharmacy',
            formattedAddress: '14 Rue de Rivoli, Paris',
            currentOpeningHours: { openNow: false },
          },
        ],
      };

      const list = parseGooglePlacesList(mockRaw);
      expect(list).toHaveLength(2);
      expect(list[0]?.name).toBe('Boulangerie Eric Kayser');
      expect(list[0]?.category).toBe('Bakery');
      expect(list[0]?.openNow).toBe(true);
      expect(list[0]?.websiteUri).toBe('https://example.com/kayser');

      expect(list[1]?.name).toBe('Pharmacie de Rivoli');
      expect(list[1]?.category).toBe('pharmacy');
      expect(list[1]?.openNow).toBe(false);
    });

    it('returns empty array for invalid response', () => {
      expect(parseGooglePlacesList(null)).toEqual([]);
      expect(parseGooglePlacesList({})).toEqual([]);
    });
  });

  describe('resolvePlacesAtAddress', () => {
    it('combines Google Places, store POIs, and OSM tags deduplicating by name', () => {
      const result = resolvePlacesAtAddress({
        address: '14 Rue de Rivoli, Paris',
        lat: 48.855,
        lon: 2.355,
        googlePlaces: [
          { name: 'Boutique Alpha', category: 'Clothing store', source: 'google' },
        ],
        storePois: [
          {
            id: 1,
            type: 'node',
            tags: { name: 'Boutique Alpha', shop: 'clothes' },
            _lat: 48.85501,
            _lon: 2.35501,
            _dist: 0.01,
          },
          {
            id: 2,
            type: 'node',
            tags: { name: 'Café Parisien', amenity: 'cafe' },
            _lat: 48.85502,
            _lon: 2.35502,
            _dist: 0.02,
          },
        ],
        osm: {
          osmId: 100,
          osmType: 'way',
          name: '14 Rue de Rivoli',
          category: 'building',
          type: 'building',
          displayName: '14 Rue de Rivoli',
          address: {},
          tags: { operator: 'Immobilier Rivoli' },
          lat: 48.855,
          lon: 2.355,
        },
      });

      expect(result).toHaveLength(3);
      expect(result.map(r => r.name)).toEqual(['Boutique Alpha', 'Café Parisien', 'Immobilier Rivoli']);
    });
  });

  describe('Daily Quota and Rate Limiting', () => {
    it('tracks and increments daily calls correctly', () => {
      expect(getDailyCallCount()).toBe(0);
      expect(canMakeGooglePlacesCall()).toBe(true);

      incrementDailyCallCount();
      expect(getDailyCallCount()).toBe(1);

      incrementDailyCallCount();
      expect(getDailyCallCount()).toBe(2);
    });

    it('blocks calls once limit is reached', () => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`gp_calls_${today}`, String(GOOGLE_PLACES_MAX_DAILY_CALLS));

      expect(getDailyCallCount()).toBe(GOOGLE_PLACES_MAX_DAILY_CALLS);
      expect(canMakeGooglePlacesCall()).toBe(false);
    });
  });
});
