import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { POI } from '../../src/types';

// jsdom is active (configured in vite.config.ts)
// We set up a minimal DOM before testing renderCards

function makePOI(id: number, name: string): POI {
  return {
    id,
    type: 'node',
    lat: 48.85,
    lon: 2.35,
    tags: { name, tourism: 'attraction' },
    _lat: 48.85,
    _lon: 2.35,
    _dist: id * 100,
  };
}

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="cards-scroll"></div>
    <div id="empty-state" class="hidden">
      <span id="empty-msg">default</span>
    </div>
  `;
}

describe('renderCards()', () => {
  beforeEach(setupDOM);

  it('renders a button for each POI', async () => {
    // Dynamic import to avoid module-level side effects in jsdom
    const { renderCards } = await import('../../src/ui/cards');
    // Stub store to avoid localStorage
    vi.mock('../../src/store', () => ({
      store: { get: () => ({ activeIdx: -1 }) },
    }));

    const pois = [makePOI(1, 'Museum A'), makePOI(2, 'Cafe B')];
    renderCards(pois, vi.fn());

    const buttons = document.querySelectorAll('.poi-card');
    expect(buttons).toHaveLength(2);
  });

  it('renders the POI name', async () => {
    const { renderCards } = await import('../../src/ui/cards');
    const pois = [makePOI(1, 'Louvre Museum')];
    renderCards(pois, vi.fn());

    expect(document.body.textContent).toContain('Louvre Museum');
  });

  it('shows empty state when pois array is empty', async () => {
    const { renderCards } = await import('../../src/ui/cards');
    renderCards([], vi.fn());

    const emptyState = document.getElementById('empty-state');
    expect(emptyState?.classList.contains('hidden')).toBe(false);
  });

  it('calls onSelect with the correct index on click', async () => {
    const { renderCards } = await import('../../src/ui/cards');
    const onSelect = vi.fn();
    const pois = [makePOI(1, 'Tower A'), makePOI(2, 'Tower B')];
    renderCards(pois, onSelect);

    const secondCard = document.querySelectorAll<HTMLButtonElement>('.poi-card')[1];
    secondCard?.click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('uses <button> elements (not article)', async () => {
    const { renderCards } = await import('../../src/ui/cards');
    const pois = [makePOI(1, 'Test Place')];
    renderCards(pois, vi.fn());

    const card = document.querySelector('.poi-card');
    expect(card?.tagName.toLowerCase()).toBe('button');
  });

  it('escapes HTML in POI names to prevent XSS', async () => {
    const { renderCards } = await import('../../src/ui/cards');
    const xssPOI = makePOI(1, '<script>alert(1)</script>');
    renderCards([xssPOI], vi.fn());

    // The card-name div should have escaped HTML entities, not live tags
    const nameEl = document.querySelector('.card-name');
    // textContent returns the decoded text (that's fine — it's not injected as HTML)
    // innerHTML should contain escaped entities
    expect(nameEl?.innerHTML).toContain('&lt;script&gt;');
    expect(nameEl?.innerHTML).not.toContain('<script>');
  });

});
