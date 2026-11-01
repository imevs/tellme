import { describe, it, expect } from 'vitest';
import {
  poiEmoji,
  poiCategory,
  poiAddress,
  haversineKm,
} from '../../src/api/overpass';
import type { OverpassTags } from '../../src/types';

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
