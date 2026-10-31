import { describe, it, expect } from 'vitest';
import {
  parseNominatimResponse,
  parsePhotonResponse,
  formatOsmAddress,
  inferOsmEmoji,
} from '../../src/api/osm';

describe('OpenStreetMap API parser (src/api/osm.ts)', () => {
  describe('parseNominatimResponse', () => {
    it('parses rich Nominatim response with extratags and namedetails', () => {
      const raw = {
        place_id: 123456,
        osm_id: 243243,
        osm_type: 'way',
        lat: '48.8584',
        lon: '2.2945',
        category: 'tourism',
        type: 'attraction',
        display_name: 'Tour Eiffel, 5, Avenue Anatole France, Gros-Caillou, Paris 7e Arrondissement, Paris, Île-de-France, 75007, France',
        namedetails: {
          'name': 'Tour Eiffel',
          'name:en': 'Eiffel Tower',
        },
        address: {
          road: 'Avenue Anatole France',
          house_number: '5',
          suburb: 'Gros-Caillou',
          city: 'Paris',
          country: 'France',
          postcode: '75007',
        },
        extratags: {
          wikidata: 'Q243',
          wikipedia: 'fr:Tour Eiffel',
          start_date: '1887-01-28',
          height: '330',
          architect: 'Stéphen Sauvestre',
        },
      };

      const result = parseNominatimResponse(raw, 48.8584, 2.2945);
      expect(result).not.toBeNull();
      expect(result?.osmId).toBe(243243);
      expect(result?.osmType).toBe('way');
      expect(result?.name).toBe('Eiffel Tower');
      expect(result?.category).toBe('tourism');
      expect(result?.type).toBe('attraction');
      expect(result?.wikidataId).toBe('Q243');
      expect(result?.wikipedia).toBe('fr:Tour Eiffel');
      expect(result?.startDate).toBe('1887-01-28');
      expect(result?.address.road).toBe('Avenue Anatole France');
      expect(result?.address.houseNumber).toBe('5');
      expect(result?.address.city).toBe('Paris');
    });

    it('falls back gracefully when fields are missing', () => {
      const raw = {
        osm_id: '999',
        osm_type: 'node',
        display_name: 'Unknown Spot, Paris, France',
      };

      const result = parseNominatimResponse(raw, 48.85, 2.35);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Unknown Spot');
      expect(result?.osmId).toBe(999);
      expect(result?.osmType).toBe('node');
      expect(result?.wikidataId).toBeUndefined();
    });

    it('returns null for invalid or error responses', () => {
      expect(parseNominatimResponse(null, 0, 0)).toBeNull();
      expect(parseNominatimResponse({ error: 'Unable to geocode' }, 0, 0)).toBeNull();
    });
  });

  describe('parsePhotonResponse', () => {
    it('parses Komoot Photon GeoJSON feature', () => {
      const raw = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [2.2945, 48.8584],
            },
            properties: {
              osm_id: 13665571861,
              osm_type: 'N',
              osm_key: 'amenity',
              osm_value: 'fast_food',
              name: 'Madame Brasserie',
              street: 'Avenue Anatole France',
              housenumber: '5',
              city: 'Paris',
              country: 'France',
              postcode: '75007',
            },
          },
        ],
      };

      const result = parsePhotonResponse(raw, 48.8584, 2.2945);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Madame Brasserie');
      expect(result?.osmId).toBe(13665571861);
      expect(result?.osmType).toBe('node');
      expect(result?.category).toBe('amenity');
      expect(result?.type).toBe('fast_food');
      expect(result?.address.road).toBe('Avenue Anatole France');
      expect(result?.address.city).toBe('Paris');
    });

    it('returns null if features array is empty', () => {
      expect(parsePhotonResponse({ type: 'FeatureCollection', features: [] }, 0, 0)).toBeNull();
      expect(parsePhotonResponse(null, 0, 0)).toBeNull();
    });
  });

  describe('formatOsmAddress', () => {
    it('formats house number, street, suburb, city and country', () => {
      const feature = {
        osmId: 1,
        osmType: 'way' as const,
        name: 'Test',
        category: 'building',
        type: 'yes',
        displayName: '5 Avenue Anatole France, Paris',
        address: {
          houseNumber: '5',
          road: 'Avenue Anatole France',
          suburb: 'Gros-Caillou',
          city: 'Paris',
          country: 'France',
        },
        tags: {},
        lat: 48.8584,
        lon: 2.2945,
      };

      expect(formatOsmAddress(feature)).toBe('5 Avenue Anatole France, Gros-Caillou, Paris, France');
    });

    it('falls back to coordinates if address is empty', () => {
      const feature = {
        osmId: 1,
        osmType: 'node' as const,
        name: 'Open Area',
        category: 'natural',
        type: 'wood',
        displayName: '',
        address: {},
        tags: {},
        lat: 48.8500,
        lon: 2.3400,
      };

      expect(formatOsmAddress(feature)).toBe('48.8500, 2.3400');
    });
  });

  describe('inferOsmEmoji', () => {
    it('returns correct emoji for various categories', () => {
      expect(inferOsmEmoji('historic', 'castle')).toBe('🏰');
      expect(inferOsmEmoji('amenity', 'cathedral')).toBe('⛪');
      expect(inferOsmEmoji('tourism', 'museum')).toBe('🏛️');
      expect(inferOsmEmoji('amenity', 'restaurant')).toBe('🍽️');
      expect(inferOsmEmoji('amenity', 'cafe')).toBe('☕');
      expect(inferOsmEmoji('leisure', 'park')).toBe('🌿');
      expect(inferOsmEmoji('tourism', 'viewpoint')).toBe('🔭');
      expect(inferOsmEmoji('highway', 'bridge')).toBe('🌉');
      expect(inferOsmEmoji('building', 'yes')).toBe('🏢');
    });
  });
});
