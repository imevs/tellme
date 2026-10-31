import { describe, it, expect } from 'vitest';
import {
  buildOverpassQuery,
  parsePOIs,
  poiEmoji,
  poiCategory,
  poiAddress,
  haversineKm,
} from '../../src/api/overpass';
import type { OverpassElement, OverpassTags } from '../../src/types';
import type { LatLng } from 'leaflet';

// ── haversineKm() ──────────────────────────────────────
describe('haversineKm()', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it('calculates Paris → London as roughly 340km', () => {
    const km = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(350);
  });
});

// ── poiEmoji() ─────────────────────────────────────────
describe('poiEmoji()', () => {
  const t = (partial: Partial<OverpassTags>): OverpassTags => partial;

  it('museum → 🏛️', () => expect(poiEmoji(t({ tourism: 'museum' }))).toBe('🏛️'));
  it('attraction → ⭐', () => expect(poiEmoji(t({ tourism: 'attraction' }))).toBe('⭐'));
  it('castle → 🏰', () => expect(poiEmoji(t({ historic: 'castle' }))).toBe('🏰'));
  it('monument → 🗿', () => expect(poiEmoji(t({ historic: 'monument' }))).toBe('🗿'));
  it('restaurant → 🍽️', () => expect(poiEmoji(t({ amenity: 'restaurant' }))).toBe('🍽️'));
  it('cafe → ☕', () => expect(poiEmoji(t({ amenity: 'cafe' }))).toBe('☕'));
  it('bar → 🍺', () => expect(poiEmoji(t({ amenity: 'bar' }))).toBe('🍺'));
  it('park → 🌿', () => expect(poiEmoji(t({ leisure: 'park' }))).toBe('🌿'));
  it('shop (any) → 🛍️', () => expect(poiEmoji(t({ shop: 'clothes' }))).toBe('🛍️'));
  it('unknown → 📍', () => expect(poiEmoji(t({}))).toBe('📍'));
  it('unknown tourism → fallback ⭐', () => expect(poiEmoji(t({ tourism: 'camp_site' }))).toBe('🌟'));
});

// ── poiCategory() ──────────────────────────────────────
describe('poiCategory()', () => {
  it('prefers tourism over historic', () => {
    expect(poiCategory({ tourism: 'museum', historic: 'monument' })).toBe('museum');
  });
  it('falls back to historic', () => {
    expect(poiCategory({ historic: 'castle' })).toBe('castle');
  });
  it('returns "place" for empty tags', () => {
    expect(poiCategory({})).toBe('place');
  });
});

// ── poiAddress() ───────────────────────────────────────
describe('poiAddress()', () => {
  it('formats street + housenumber', () => {
    const addr = poiAddress({ 'addr:street': 'Rue de Rivoli', 'addr:housenumber': '10' }, 0, 0);
    expect(addr).toBe('Rue de Rivoli 10');
  });

  it('includes city when present', () => {
    const addr = poiAddress({ 'addr:street': 'Main St', 'addr:city': 'Paris' }, 0, 0);
    expect(addr).toBe('Main St, Paris');
  });

  it('falls back to coordinates when no address tags', () => {
    const addr = poiAddress({}, 48.8566, 2.3522);
    expect(addr).toBe('48.8566, 2.3522');
  });

  it('uses description if no address and no coords are distinct', () => {
    const addr = poiAddress({ description: 'Near the river bank' }, 0, 0);
    expect(addr).toBe('Near the river bank');
  });
});

// ── buildOverpassQuery() ───────────────────────────────
describe('buildOverpassQuery()', () => {
  const BBOX = '48.8,2.3,48.9,2.4';

  it('contains the bbox', () => {
    const q = buildOverpassQuery(BBOX, 'all');
    expect(q).toContain(BBOX);
  });

  it('includes tourism for "all" category', () => {
    const q = buildOverpassQuery(BBOX, 'all');
    expect(q).toContain('"tourism"');
  });

  it('includes amenity for "amenity" category', () => {
    const q = buildOverpassQuery(BBOX, 'amenity');
    expect(q).toContain('"amenity"');
  });

  it('does NOT include tourism for "amenity" category', () => {
    const q = buildOverpassQuery(BBOX, 'amenity');
    expect(q).not.toContain('"tourism"');
  });

  it('output format includes [out:json]', () => {
    const q = buildOverpassQuery(BBOX, 'all');
    expect(q).toContain('[out:json]');
  });

  it('output format includes timeout', () => {
    const q = buildOverpassQuery(BBOX, 'all');
    expect(q).toContain('[timeout:');
  });
});

// ── parsePOIs() ────────────────────────────────────────
describe('parsePOIs()', () => {
  const center = { lat: 48.8566, lng: 2.3522 } as LatLng;

  const makeElement = (
    id: number,
    lat: number,
    lon: number,
    tags: Partial<OverpassTags> = {},
  ): OverpassElement => ({
    id,
    type: 'node',
    lat,
    lon,
    tags: { name: `Place ${id}`, ...tags },
  });

  it('filters out elements without a name', () => {
    const el: OverpassElement = { id: 1, type: 'node', lat: 48.86, lon: 2.35, tags: {} };
    const result = parsePOIs([el], center);
    expect(result).toHaveLength(0);
  });

  it('filters out elements without coordinates', () => {
    const el: OverpassElement = { id: 1, type: 'way', tags: { name: 'Test' } };
    const result = parsePOIs([el], center);
    expect(result).toHaveLength(0);
  });

  it('uses center coordinates from ways', () => {
    const el: OverpassElement = {
      id: 1, type: 'way',
      center: { lat: 48.86, lon: 2.35 },
      tags: { name: 'Test Way' },
    };
    const result = parsePOIs([el], center);
    expect(result).toHaveLength(1);
    expect(result[0]!._lat).toBe(48.86);
  });

  it('sorts by distance (closest first)', () => {
    const near = makeElement(1, 48.857, 2.352);  // ~100m
    const far  = makeElement(2, 48.900, 2.400);  // ~5km
    const result = parsePOIs([far, near], center);
    expect(result[0]!.id).toBe(1);
  });

  it('caps results at MAX_POIS (24)', () => {
    const elements = Array.from({ length: 30 }, (_, i) =>
      makeElement(i, 48.856 + i * 0.001, 2.352),
    );
    const result = parsePOIs(elements, center);
    expect(result.length).toBeLessThanOrEqual(24);
  });

  it('annotates each POI with _dist', () => {
    const el = makeElement(1, 48.86, 2.35);
    const result = parsePOIs([el], center);
    expect(typeof result[0]!._dist).toBe('number');
    expect(result[0]!._dist).toBeGreaterThan(0);
  });
});
