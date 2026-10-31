import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseGooglePlaceResponse,
  formatPriceLevel,
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
    it('parses valid Google Places response', () => {
      const mockRaw = {
        places: [
          {
            id: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',
            formattedAddress: 'Av. Gustave Eiffel, 75007 Paris, France',
            rating: 4.7,
            userRatingCount: 499618,
            websiteUri: 'https://www.toureiffel.paris/fr',
            nationalPhoneNumber: '0892 70 12 39',
            priceLevel: 'PRICE_LEVEL_MODERATE',
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
      expect(result?.rating).toBe(4.7);
      expect(result?.userRatingCount).toBe(499618);
      expect(result?.openNow).toBe(true);
      expect(result?.websiteUri).toBe('https://www.toureiffel.paris/fr');
      expect(result?.phoneNumber).toBe('0892 70 12 39');
      expect(result?.priceLevel).toBe('$$ (Moderate)');
      expect(result?.formattedAddress).toBe('Av. Gustave Eiffel, 75007 Paris, France');
    });

    it('returns null for empty or error responses', () => {
      expect(parseGooglePlaceResponse(null)).toBeNull();
      expect(parseGooglePlaceResponse({})).toBeNull();
      expect(parseGooglePlaceResponse({ places: [] })).toBeNull();
    });
  });

  describe('formatPriceLevel', () => {
    it('formats price levels correctly', () => {
      expect(formatPriceLevel('PRICE_LEVEL_FREE')).toBe('Free');
      expect(formatPriceLevel('PRICE_LEVEL_INEXPENSIVE')).toBe('$ (Inexpensive)');
      expect(formatPriceLevel('PRICE_LEVEL_MODERATE')).toBe('$$ (Moderate)');
      expect(formatPriceLevel('PRICE_LEVEL_EXPENSIVE')).toBe('$$$ (Expensive)');
      expect(formatPriceLevel('PRICE_LEVEL_VERY_EXPENSIVE')).toBe('$$$$ (Very Expensive)');
      expect(formatPriceLevel(undefined)).toBeUndefined();
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
