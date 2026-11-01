import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCoordinatesFromUrl,
  formatCoordinatesHash,
  updateUrlCoordinates,
  clearUrlCoordinates,
} from '../../src/utils/url';

describe('URL Coordinate Utilities (src/utils/url.ts)', () => {
  beforeEach(() => {
    try {
      window.history.replaceState(null, '', '/');
    } catch {
      window.location.hash = '';
    }
  });

  describe('formatCoordinatesHash', () => {
    it('formats coordinates into hash with precision and zoom', () => {
      expect(formatCoordinatesHash(48.856612, 2.352222, 16)).toBe('#48.85661,2.35222,16');
      expect(formatCoordinatesHash(48.85, 2.35, 15)).toBe('#48.85,2.35,15');
      expect(formatCoordinatesHash(48.85, 2.35)).toBe('#48.85,2.35');
    });

    it('clamps zoom between 1 and 22', () => {
      expect(formatCoordinatesHash(48.85, 2.35, 30)).toBe('#48.85,2.35,22');
      expect(formatCoordinatesHash(48.85, 2.35, -5)).toBe('#48.85,2.35,1');
    });
  });

  describe('parseCoordinatesFromUrl', () => {
    it('parses comma-separated hash #lat,lon,zoom', () => {
      const result = parseCoordinatesFromUrl('http://localhost:5174/#48.8566,2.3522,16');
      expect(result).toEqual({ lat: 48.8566, lon: 2.3522, zoom: 16 });
    });

    it('parses comma-separated hash #lat,lon without zoom', () => {
      const result = parseCoordinatesFromUrl('http://localhost:5174/#48.8584,2.2945');
      expect(result).toEqual({ lat: 48.8584, lon: 2.2945, zoom: undefined });
    });

    it('parses slash-separated hash #lat/lon/zoom', () => {
      const result = parseCoordinatesFromUrl('http://localhost:5174/#48.8566/2.3522/16');
      expect(result).toEqual({ lat: 48.8566, lon: 2.3522, zoom: 16 });
    });

    it('parses hash with leading @ and trailing z', () => {
      const result = parseCoordinatesFromUrl('http://localhost:5174/#@48.8566,2.3522,16z');
      expect(result).toEqual({ lat: 48.8566, lon: 2.3522, zoom: 16 });
    });

    it('parses query params ?lat=...&lon=...', () => {
      const result = parseCoordinatesFromUrl('http://localhost:5174/?lat=48.8584&lon=2.2945&zoom=17');
      expect(result).toEqual({ lat: 48.8584, lon: 2.2945, zoom: 17 });
    });

    it('returns null for invalid or non-numeric inputs', () => {
      expect(parseCoordinatesFromUrl('http://localhost:5174/#paris')).toBeNull();
      expect(parseCoordinatesFromUrl('http://localhost:5174/#')).toBeNull();
      expect(parseCoordinatesFromUrl('http://localhost:5174/')).toBeNull();
      expect(parseCoordinatesFromUrl('http://localhost:5174/#abc,def')).toBeNull();
      expect(parseCoordinatesFromUrl('http://localhost:5174/#120,300')).toBeNull(); // out of bounds
    });

    it('reads from current window.location when no argument is given', () => {
      window.history.replaceState(null, '', '/#48.8530,2.3499,16');
      expect(parseCoordinatesFromUrl()).toEqual({ lat: 48.853, lon: 2.3499, zoom: 16 });
    });
  });

  describe('updateUrlCoordinates and clearUrlCoordinates', () => {
    it('updates window.location.hash with coordinates', () => {
      updateUrlCoordinates(48.8584, 2.2945, 16);
      expect(window.location.hash).toBe('#48.8584,2.2945,16');
    });

    it('clears hash when clearUrlCoordinates is called', () => {
      updateUrlCoordinates(48.8584, 2.2945, 16);
      expect(window.location.hash).toBe('#48.8584,2.2945,16');

      clearUrlCoordinates();
      expect(window.location.hash).toBe('');
    });
  });
});
