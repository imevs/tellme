import { describe, it, expect } from 'vitest';
import { parseWikipediaPlaces, inferCategory, DEFAULT_PARIS_POIS } from '../../src/api/places';

describe('inferCategory()', () => {
  it('detects churches and cathedrals as historic', () => {
    expect(inferCategory('Notre-Dame Cathedral', 'Gothic cathedral').cat).toBe('historic');
    expect(inferCategory('Sainte-Chapelle', 'royal chapel').cat).toBe('historic');
  });

  it('detects castles and palaces as historic', () => {
    expect(inferCategory('Palace of Versailles', 'royal residence').cat).toBe('historic');
  });

  it('detects museums as tourism', () => {
    expect(inferCategory('Louvre Museum', 'art museum').cat).toBe('tourism');
  });

  it('detects parks and gardens as leisure', () => {
    expect(inferCategory('Jardin du Luxembourg', 'public park').cat).toBe('leisure');
  });

  it('detects cafes and restaurants as amenity', () => {
    expect(inferCategory('Café de Flore', 'historic Parisian cafe').cat).toBe('amenity');
  });
});

describe('parseWikipediaPlaces()', () => {
  it('parses valid Wikipedia GeoSearch response', () => {
    const data = {
      query: {
        pages: {
          '101': {
            pageid: 101,
            title: 'Eiffel Tower',
            description: 'Wrought-iron lattice tower',
            coordinates: [{ lat: 48.8584, lon: 2.2945 }],
            thumbnail: { source: 'https://example.com/eiffel.jpg' },
          },
        },
      },
    };

    const pois = parseWikipediaPlaces(data, 48.8566, 2.3522);
    expect(pois).toHaveLength(1);
    expect(pois[0]!.tags.name).toBe('Eiffel Tower');
    expect(pois[0]!._lat).toBe(48.8584);
    expect(pois[0]!._lon).toBe(2.2945);
    expect(pois[0]!.tags.image).toBe('https://example.com/eiffel.jpg');
    expect(pois[0]!._dist).toBeGreaterThan(0);
  });

  it('filters by category when specified', () => {
    const data = {
      query: {
        pages: {
          '101': {
            pageid: 101,
            title: 'Louvre Museum',
            description: 'Art museum',
            coordinates: [{ lat: 48.8606, lon: 2.3376 }],
          },
          '102': {
            pageid: 102,
            title: 'Jardin des Tuileries',
            description: 'Public park',
            coordinates: [{ lat: 48.8633, lon: 2.3275 }],
          },
        },
      },
    };

    const leisureOnly = parseWikipediaPlaces(data, 48.8566, 2.3522, 'leisure');
    expect(leisureOnly).toHaveLength(1);
    expect(leisureOnly[0]!.tags.name).toBe('Jardin des Tuileries');
  });

  it('handles empty or malformed responses gracefully', () => {
    expect(parseWikipediaPlaces(null, 0, 0)).toEqual([]);
    expect(parseWikipediaPlaces({}, 0, 0)).toEqual([]);
    expect(parseWikipediaPlaces({ query: {} }, 0, 0)).toEqual([]);
  });
});

describe('DEFAULT_PARIS_POIS', () => {
  it('contains valid curated Paris POIs with coordinates and tags', () => {
    expect(DEFAULT_PARIS_POIS.length).toBeGreaterThan(0);
    for (const poi of DEFAULT_PARIS_POIS) {
      expect(poi.tags.name).toBeTruthy();
      expect(poi._lat).toBeGreaterThan(48);
      expect(poi._lon).toBeGreaterThan(2);
      expect(poi._dist).toBeDefined();
    }
  });
});
