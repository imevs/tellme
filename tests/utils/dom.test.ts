import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { esc, debounce, highlightTerms } from '../../src/ui/dom';

// ── esc() ──────────────────────────────────────────────
describe('esc()', () => {
  it('escapes ampersand', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(esc('a > b')).toBe('a &gt; b');
  });

  it('escapes double quote', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quote', () => {
    expect(esc("it's")).toBe('it&#39;s');
  });

  it('handles all five characters in one string', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('returns empty string for null', () => {
    expect(esc(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(esc(undefined)).toBe('');
  });

  it('returns unchanged string with no special chars', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

// ── debounce() ─────────────────────────────────────────
describe('debounce()', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not fire before the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('fires exactly once after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on repeated calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();               // reset
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled(); // still waiting
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the latest arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('b');
  });
});

// ── highlightTerms() ───────────────────────────────────
describe('highlightTerms()', () => {
  it('wraps a term in a span.term', () => {
    const html = highlightTerms('Visit the Eiffel Tower today.', ['Eiffel Tower']);
    expect(html).toContain('<span class="term"');
    expect(html).toContain('Eiffel Tower');
  });

  it('is case-insensitive when matching', () => {
    const html = highlightTerms('The louvre is famous.', ['Louvre']);
    expect(html).toContain('<span class="term"');
  });

  it('handles multiple terms', () => {
    const html = highlightTerms('Gothic architecture in Paris.', ['Gothic architecture', 'Paris']);
    expect(html.match(/<span class="term"/g)?.length).toBe(2);
  });

  it('does not double-wrap terms already inside a span (longest first wins)', () => {
    const html = highlightTerms('Gothic architecture style.', [
      'architecture',
      'Gothic architecture',
    ]);
    // "Gothic architecture" (longer) is matched first → one span for the whole phrase
    // "architecture" alone should NOT create a nested span inside the first span
    expect(html).not.toContain('class="term" data-term="architecture"');
    // The whole phrase should still be wrapped
    expect(html).toContain('Gothic architecture</span>');
  });


  it('escapes HTML in the surrounding description', () => {
    const html = highlightTerms('A <b>bold</b> place.', []);
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('returns plain escaped text when terms array is empty', () => {
    const html = highlightTerms('Simple place.', []);
    expect(html).toBe('Simple place.');
    expect(html).not.toContain('<span');
  });
});
