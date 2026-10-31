import { describe, it, expect } from 'vitest';
import { parseGeminiResponse, buildPlacePrompt, buildTermPrompt } from '../../src/api/gemini';
import type { PlaceDescRequest, TermDescRequest } from '../../src/types';

// ── parseGeminiResponse() ──────────────────────────────
describe('parseGeminiResponse()', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      description: 'A beautiful place.',
      terms: ['beautiful place'],
    });
    const result = parseGeminiResponse(raw);
    expect(result.description).toBe('A beautiful place.');
    expect(result.terms).toEqual(['beautiful place']);
  });

  it('extracts JSON from markdown fence', () => {
    const raw = '```json\n{"description":"Hello.","terms":["Hello"]}\n```';
    const result = parseGeminiResponse(raw);
    expect(result.description).toBe('Hello.');
  });

  it('extracts JSON embedded in surrounding text', () => {
    const raw = 'Here is the response: {"description":"Test.","terms":[]} enjoy!';
    const result = parseGeminiResponse(raw);
    expect(result.description).toBe('Test.');
  });

  it('returns empty terms array when terms is missing', () => {
    const raw = JSON.stringify({ description: 'Only description.' });
    const result = parseGeminiResponse(raw);
    expect(result.terms).toEqual([]);
  });

  it('filters non-string items from terms', () => {
    const raw = JSON.stringify({
      description: 'A place.',
      terms: ['valid', 42, null, 'also valid'],
    });
    const result = parseGeminiResponse(raw);
    expect(result.terms).toEqual(['valid', 'also valid']);
  });

  it('throws on completely invalid JSON', () => {
    expect(() => parseGeminiResponse('not json at all')).toThrow();
  });

  it('throws when description field is missing', () => {
    const raw = JSON.stringify({ terms: ['x'] });
    expect(() => parseGeminiResponse(raw)).toThrow('Unexpected AI response shape');
  });

  it('throws when description is not a string', () => {
    const raw = JSON.stringify({ description: 42, terms: [] });
    expect(() => parseGeminiResponse(raw)).toThrow('Unexpected AI response shape');
  });
});

// ── buildPlacePrompt() ─────────────────────────────────
describe('buildPlacePrompt()', () => {
  const req: PlaceDescRequest = {
    type: 'place',
    name: 'Eiffel Tower',
    addr: 'Champ de Mars, Paris',
    cat:  'attraction',
  };

  it('includes the place name', () => {
    expect(buildPlacePrompt(req)).toContain('Eiffel Tower');
  });

  it('includes the address', () => {
    expect(buildPlacePrompt(req)).toContain('Champ de Mars, Paris');
  });

  it('includes the category', () => {
    expect(buildPlacePrompt(req)).toContain('attraction');
  });

  it('instructs to return JSON with description and terms fields', () => {
    const prompt = buildPlacePrompt(req);
    expect(prompt).toContain('"description"');
    expect(prompt).toContain('"terms"');
  });

  it('instructs terms to appear VERBATIM in description', () => {
    expect(buildPlacePrompt(req)).toContain('VERBATIM');
  });
});

// ── buildTermPrompt() ──────────────────────────────────
describe('buildTermPrompt()', () => {
  const req: TermDescRequest = { type: 'term', term: 'Gothic architecture' };

  it('includes the term', () => {
    expect(buildTermPrompt(req)).toContain('Gothic architecture');
  });

  it('instructs to return JSON with description and terms fields', () => {
    const prompt = buildTermPrompt(req);
    expect(prompt).toContain('"description"');
    expect(prompt).toContain('"terms"');
  });

  it('instructs VERBATIM matching', () => {
    expect(buildTermPrompt(req)).toContain('VERBATIM');
  });
});
