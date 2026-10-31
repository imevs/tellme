import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseGooglePlaceResponse,
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
