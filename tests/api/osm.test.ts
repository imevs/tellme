import { describe, it, expect } from 'vitest';
import {
  parseNominatimResponse,
  parsePhotonResponse,
  formatOsmAddress,
  inferOsmEmoji,
  mergeWithAddressPrimary,
  pickRichestFeatureAtAddress,
  scoreOsmFeatureRichness,
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

    it('falls back to operator:wikidata and operator:wikipedia when direct wikidata tag is absent (e.g. Latvijas Radio building)', () => {
      const raw = {
        osm_id: 162177619,
        osm_type: 'way',
        lat: '56.94981',
        lon: '24.10633',
        category: 'amenity',
        type: 'studio',
        name: 'Latvijas Radio',
        namedetails: {
          name: 'Latvijas Radio',
          'name:en': 'Radio Latvia',
        },
        address: {
          house_number: '8',
          road: 'Doma laukums',
          suburb: 'Vecrīga',
          city: 'Rīga',
        },
        extratags: {
          building: 'office',
          studio: 'radio',
          'operator:wikidata': 'Q1807092',
          'operator:wikipedia': 'lv:Latvijas Radio',
        },
      };

      const result = parseNominatimResponse(raw, 56.94981, 24.10633);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Radio Latvia');
      expect(result?.localName).toBe('Latvijas Radio');
      expect(result?.wikidataId).toBe('Q1807092');
      expect(result?.wikipedia).toBe('lv:Latvijas Radio');
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

  describe('mergeWithAddressPrimary', () => {
    it('preserves named landmark when address inventory primary is a generic building way', () => {
      const landmark = {
        osmId: 10,
        osmType: 'node' as const,
        name: 'Riga Cathedral',
        category: 'historic',
        type: 'cathedral',
        displayName: 'Riga Cathedral, 6 Herdera laukums',
        address: { road: 'Herdera laukums', houseNumber: '6' },
        tags: {},
        wikidataId: 'Q1146288',
        wikipedia: 'en:Riga Cathedral',
        lat: 56.949,
        lon: 24.104,
      };

      const genericBuilding = {
        osmId: 20,
        osmType: 'way' as const,
        name: 'Map Object',
        category: 'building',
        type: 'yes',
        displayName: '6, Herdera laukums',
        address: { road: 'Herdera laukums', houseNumber: '6' },
        tags: {},
        startDate: '1211',
        lat: 56.9491,
        lon: 24.1041,
      };

      const merged = mergeWithAddressPrimary(landmark, genericBuilding);
      expect(merged.name).toBe('Riga Cathedral');
      expect(merged.wikidataId).toBe('Q1146288');
      expect(merged.startDate).toBe('1211');
    });
  });

  describe('pickRichestFeatureAtAddress', () => {
    const addr = { road: 'Krišjāņa Barona iela', houseNumber: '4', city: 'Rīga', countryCode: 'lv' };
    const drogas = parseNominatimResponse({
      osm_type: 'node', osm_id: 452920037, lat: '56.9495857', lon: '24.1182805',
      category: 'shop', type: 'chemist', name: 'Drogas',
      address: { house_number: '4', road: 'Krišjāņa Barona iela', city: 'Rīga', country_code: 'lv' },
      extratags: { opening_hours: 'Mo-Sa 09:00-21:00', 'brand:wikidata': 'Q15806753', 'brand:wikipedia': 'de:Drogas' },
      namedetails: { name: 'Drogas' },
    }, 0, 0)!;
    const museum = parseNominatimResponse({
      osm_type: 'node', osm_id: 470042272, lat: '56.9494863', lon: '24.1181106',
      category: 'tourism', type: 'museum', name: 'Latvijas Nacionālais dabas muzejs',
      address: { house_number: '4', road: 'Krišjāņa Barona iela', city: 'Rīga', country_code: 'lv' },
      extratags: {
        website: 'https://www.dabasmuzejs.gov.lv/', wikidata: 'Q6497382',
        wikipedia: 'lv:Latvijas Nacionālais dabas muzejs', opening_hours: 'We-Su 10:00-17:00', phone: '+371 67 356 023',
      },
      namedetails: { name: 'Latvijas Nacionālais dabas muzejs', 'name:en': 'Latvian National Museum of Natural History' },
    }, 0, 0)!;
    const atm = parseNominatimResponse({
      osm_type: 'node', osm_id: 445460310, category: 'amenity', type: 'atm', name: 'SEB',
      address: { house_number: '4', road: 'Krišjāņa Barona iela', city: 'Rīga', country_code: 'lv' },
      extratags: { operator: 'SEB', 'operator:wikidata': 'Q975655', opening_hours: '24/7' },
      namedetails: { name: 'SEB' },
    }, 0, 0)!;

    it('scores a museum with wikidata, website and hours above a brand-only shop', () => {
      expect(scoreOsmFeatureRichness(museum)).toBeGreaterThan(scoreOsmFeatureRichness(drogas));
    });

    it('yields the same feature regardless of which co-located feature was tapped', () => {
      const candidates = [drogas, museum, atm];
      for (const tapped of candidates) {
        expect(pickRichestFeatureAtAddress(tapped, candidates).osmId).toBe(museum.osmId);
      }
      expect(addr.houseNumber).toBe('4');
    });

    it('keeps the tapped feature when it is already the richest', () => {
      expect(pickRichestFeatureAtAddress(museum, [drogas])).toBe(museum);
    });

    it('does not replace a generic building with a barely-informative shop', () => {
      const building = { ...drogas, osmId: 1, osmType: 'relation' as const, name: 'Map Object', category: 'building', type: 'apartments', tags: {}, wikidataId: undefined, wikipedia: undefined };
      expect(pickRichestFeatureAtAddress(building, [atm])).toBe(building);
      expect(pickRichestFeatureAtAddress(building, [atm, museum]).osmId).toBe(museum.osmId);
    });

    it('is deterministic on equal scores (stable by OSM id, not tap order)', () => {
      const a = { ...atm, osmId: 10 };
      const b = { ...atm, osmId: 5, name: 'Other' };
      expect(pickRichestFeatureAtAddress(a, [b]).osmId).toBe(5);
      expect(pickRichestFeatureAtAddress(b, [a]).osmId).toBe(5);
    });
  });
});
