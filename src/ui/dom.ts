/** Get element by ID — throws in dev if not found */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

/** Get element by ID safely — returns null if not found */
export function $safe<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ── Visibility helpers (HTML hidden attribute) ─────────
export const showEl = (id: string): void => $safe(id)?.removeAttribute('hidden');
export const hideEl = (id: string): void => $safe(id)?.setAttribute('hidden', '');

/** Escape HTML special characters to prevent XSS */
export function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/** Return a debounced version of fn that fires after ms of silence */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Highlight terms in a description string and return HTML with
 * <span class="term"> wrappers. Terms are sorted longest-first to prevent
 * partial matches. Each character position can only be covered by one term,
 * so nested/overlapping spans are impossible.
 */
export function highlightTerms(description: string, terms: string[]): string {
  const escaped = esc(description);
  const lower   = escaped.toLowerCase();

  // Build a list of [start, end] ranges to wrap, no overlaps allowed
  const ranges: Array<{ start: number; end: number; term: string }> = [];
  const covered = new Uint8Array(escaped.length); // 1 = already covered

  // Longest first so "Gothic architecture" wins over "architecture"
  [...terms]
    .sort((a, b) => b.length - a.length)
    .forEach(term => {
      const escapedTerm = esc(term).toLowerCase();
      let idx = 0;
      while (idx < lower.length) {
        const pos = lower.indexOf(escapedTerm, idx);
        if (pos === -1) break;
        const end = pos + escapedTerm.length;
        // Skip if any position in this range is already covered
        if (!covered.slice(pos, end).some(v => v)) {
          ranges.push({ start: pos, end, term: esc(term) });
          covered.fill(1, pos, end);
        }
        idx = pos + 1;
      }
    });

  if (ranges.length === 0) return escaped;

  // Sort ranges by start position and assemble the final HTML
  ranges.sort((a, b) => a.start - b.start);

  let result = '';
  let cursor = 0;
  for (const { start, end, term } of ranges) {
    result += escaped.slice(cursor, start);
    const match = escaped.slice(start, end);
    result +=
      `<span class="term" ` +
      `data-term="${term}" ` +
      `role="button" tabindex="0" ` +
      `aria-label="Explore ${term}">${match}</span>`;
    cursor = end;
  }
  result += escaped.slice(cursor);
  return result;
}

