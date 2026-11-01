import { describe, it, expect, beforeEach } from 'vitest';
import { renderEnrichedPlace, closeSheet, openSheet, renderDesc, renderError } from '../../src/ui/sheet';
import { store } from '../../src/store';
import { IDS } from '../../src/constants';
import type { EnrichedPlaceInfo } from '../../src/types';

describe('Sheet UI (src/ui/sheet.ts)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="desc-sheet" class="">
        <div id="sheet-subtitle"></div>
        <div id="sheet-title"></div>
        <div id="sheet-address" hidden></div>
        <div id="sheet-loading"></div>
        <div id="sheet-desc" hidden></div>
        <div id="sheet-back" hidden></div>
        <div id="breadcrumb" hidden></div>
        <div id="explore-hint" hidden></div>
        <div id="sheet-drag-handle"></div>
        <div id="sheet-body"></div>
      </div>
      <div id="cards-wrap"></div>
    `;
    store.update({ activeIdx: -1, history: [], markers: [] });
  });

  it('renders enriched place info with construction date, height, and facts, without data sources', () => {
    const info: EnrichedPlaceInfo = {
      name: 'Eiffel Tower',
      subtitle: '⭐ Attraction • Paris',
      category: 'tourism',
      emoji: '⭐',
      lat: 48.8584,
      lon: 2.2945,
      address: '5 Avenue Anatole France, Paris',
      osm: {
        osmId: 243243,
        osmType: 'way',
        name: 'Eiffel Tower',
        category: 'tourism',
        type: 'attraction',
        displayName: '5 Avenue Anatole France',
        address: { road: 'Avenue Anatole France', city: 'Paris' },
        tags: {},
        lat: 48.8584,
        lon: 2.2945,
      },
      wikidata: {
        qid: 'Q243',
        label: 'Eiffel Tower',
        description: 'Iconic lattice tower',
        inceptionDate: 'January 28, 1887',
        openingDate: 'March 31, 1889',
        height: '330 m',
        architects: ['Stéphen Sauvestre'],
        styles: ['Structural Expressionism'],
        namedAfter: ['Gustave Eiffel'],
        heritage: ['Historical Monument'],
        instances: ['lattice tower'],
        materials: ['wrought iron'],
        interestingFacts: [
          'Construction began around January 28, 1887, and it officially opened in March 31, 1889.',
          'Reaches a structural height of 330 m.',
          'Designed by acclaimed architect(s) Stéphen Sauvestre.',
        ],
      },
      googlePlace: {
        id: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',
        openNow: true,
        websiteUri: 'https://www.toureiffel.paris/fr',
        editorialSummary: 'Iconic 1889 Eiffel Tower with city views & dining.',
      },
      descriptionHtml: 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars.',
      terms: ['Eiffel Tower'],
      thumbnail: 'https://example.com/eiffel.jpg',
    };

    renderEnrichedPlace(info);

    const titleEl = document.getElementById(IDS.SHEET_TITLE);
    expect(titleEl?.textContent).toBe('Eiffel Tower');

    const descEl = document.getElementById(IDS.SHEET_DESC);
    expect(descEl?.hidden).toBe(false);

    const html = descEl?.innerHTML ?? '';
    // Editorial Summary
    expect(html).toContain('sheet-editorial-summary');
    expect(html).toContain('Iconic 1889 Eiffel Tower with city views &amp; dining.');

    // Date of construction
    expect(html).toContain('Date of Construction');
    expect(html).toContain('January 28, 1887');

    // Height & Architect
    expect(html).toContain('330 m');
    expect(html).toContain('Stéphen Sauvestre');

    // Google Places data (open status and website action)
    expect(html).toContain('Open Now');
    expect(html).toContain('https://www.toureiffel.paris/fr');

    // Excluded from sheet: rating, reviews, prices, and phone numbers
    expect(html).not.toContain('Google Rating');
    expect(html).not.toContain('Price Level');
    expect(html).not.toContain('tel:');

    // Interesting facts
    expect(html).toContain('Interesting Facts &amp; Highlights');
    expect(html).toContain('Reaches a structural height of 330 m.');

    // Data sources MUST NOT be shown
    expect(html).not.toContain('Data Sources:');
    expect(html).not.toContain('OpenStreetMap (way #243243)');
    expect(html).not.toContain('Wikidata (Q243)');

    // Hero image
    expect(html).toContain('https://example.com/eiffel.jpg');
  });

  it('hides explore-hint if there are no blue terms in the popup', () => {
    const hintEl = document.getElementById(IDS.EXPLORE_HINT);

    // 1. Plain text with NO blue words/terms
    renderDesc('Plain description with no terms at all.', []);
    expect(hintEl?.hasAttribute('hidden')).toBe(true);

    // 2. renderEnrichedPlace with NO terms
    const infoNoTerms: EnrichedPlaceInfo = {
      name: 'Place without terms',
      subtitle: 'Spot',
      category: 'place',
      emoji: '📍',
      lat: 0,
      lon: 0,
      descriptionHtml: 'Just plain text without any term span tags.',
      terms: [],
    };
    renderEnrichedPlace(infoNoTerms);
    expect(hintEl?.hasAttribute('hidden')).toBe(true);

    // 3. renderError also hides hint
    renderError('Some error occurred');
    expect(hintEl?.hasAttribute('hidden')).toBe(true);
  });

  it('shows explore-hint when there are blue terms in the popup', () => {
    const hintEl = document.getElementById(IDS.EXPLORE_HINT);

    renderDesc('Here is Paris with an Eiffel Tower.', ['Paris', 'Eiffel Tower']);
    expect(hintEl?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps explore-hint hidden during initial openSheet loading', () => {
    const hintEl = document.getElementById(IDS.EXPLORE_HINT);
    openSheet('Loading Place', 'Inspecting…');
    expect(hintEl?.hasAttribute('hidden')).toBe(true);
  });

  it('closes sheet and resets activeIdx to -1', () => {
    openSheet('Sample Title', 'Sample Sub');
    expect(document.getElementById(IDS.DESC_SHEET)?.classList.contains('open')).toBe(true);

    closeSheet();
    expect(document.getElementById(IDS.DESC_SHEET)?.classList.contains('open')).toBe(false);
    expect(store.get().activeIdx).toBe(-1);
  });

  it('shows address in title when card object has generic or missing name', () => {
    const info: EnrichedPlaceInfo = {
      name: 'Map Object',
      subtitle: '🏢 Building',
      category: 'building',
      emoji: '🏢',
      lat: 48.8584,
      lon: 2.2945,
      address: '14 Rue de Rivoli, 75004 Paris',
      terms: [],
    };

    renderEnrichedPlace(info);

    const titleEl = document.getElementById(IDS.SHEET_TITLE);
    expect(titleEl?.textContent).toBe('14 Rue de Rivoli, 75004 Paris');
  });

  it('shows specific name in title and address in sheet-address when object has specific name', () => {
    const info: EnrichedPlaceInfo = {
      name: 'Café de Flore',
      subtitle: '☕ Café',
      category: 'amenity',
      emoji: '☕',
      lat: 48.854,
      lon: 2.333,
      address: '172 Boulevard Saint-Germain, 75006 Paris',
      terms: [],
    };

    renderEnrichedPlace(info);

    const titleEl = document.getElementById(IDS.SHEET_TITLE);
    expect(titleEl?.textContent).toBe('Café de Flore');

    const addrEl = document.getElementById(IDS.SHEET_ADDRESS);
    expect(addrEl?.textContent).toBe('📍 172 Boulevard Saint-Germain, 75006 Paris');
    expect(addrEl?.hasAttribute('hidden')).toBe(false);
  });

  it('shows street info at the bottom in a separate block when card has streetInfo for a building', () => {
    const info: EnrichedPlaceInfo = {
      name: '14 Rue de Rivoli',
      subtitle: '🏢 Building',
      category: 'building',
      emoji: '🏢',
      lat: 48.855,
      lon: 2.355,
      address: '14 Rue de Rivoli, 75004 Paris',
      isBuilding: true,
      streetName: 'Rue de Rivoli',
      streetInfo: {
        name: 'Rue de Rivoli',
        title: 'Rue de Rivoli',
        subtitle: '🛣️ street in Paris, France',
        descriptionHtml: '<p>The <span class="explore-term">Rue de Rivoli</span> is a major historic street.</p>',
        rawDescription: 'The Rue de Rivoli is a major historic street.',
        thumbnail: 'https://example.com/rivoli.jpg',
        terms: ['Rue de Rivoli'],
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Rue_de_Rivoli',
      },
      descriptionHtml: '<p>Building narrative description here.</p>',
      terms: [],
    };

    renderEnrichedPlace(info);

    const descEl = document.getElementById(IDS.SHEET_DESC);
    const html = descEl?.innerHTML ?? '';

    // Verify street block is rendered in separate block
    expect(html).toContain('sheet-street-block');
    expect(html).toContain('Street Guide');
    expect(html).toContain('Rue de Rivoli');
    expect(html).toContain('https://example.com/rivoli.jpg');
    expect(html).toContain('The <span class="explore-term">Rue de Rivoli</span> is a major historic street.');
    expect(html).toContain('Explore Rue de Rivoli on Wikipedia ↗');

    // Ensure street block appears after narrative (at the bottom)
    const narrativeIdx = html.indexOf('Building narrative description here');
    const streetBlockIdx = html.indexOf('sheet-street-block');
    expect(narrativeIdx).toBeLessThan(streetBlockIdx);
  });

  it('does not show street block when streetInfo is null or undefined', () => {
    const info: EnrichedPlaceInfo = {
      name: '14 Rue de Rivoli',
      subtitle: '🏢 Building',
      category: 'building',
      emoji: '🏢',
      lat: 48.855,
      lon: 2.355,
      address: '14 Rue de Rivoli, 75004 Paris',
      isBuilding: true,
      streetName: 'Rue de Rivoli',
      streetInfo: null,
      descriptionHtml: '<p>Building narrative description here.</p>',
      terms: [],
    };

    renderEnrichedPlace(info);

    const descEl = document.getElementById(IDS.SHEET_DESC);
    const html = descEl?.innerHTML ?? '';

    expect(html).not.toContain('sheet-street-block');
    expect(html).not.toContain('Street Guide');
  });

  it('shows places (organizations) located at the address in a separate block', () => {
    const info: EnrichedPlaceInfo = {
      name: '14 Rue de Rivoli',
      subtitle: '🏢 Building',
      category: 'building',
      emoji: '🏢',
      lat: 48.855,
      lon: 2.355,
      address: '14 Rue de Rivoli, 75004 Paris',
      placesAtAddress: [
        {
          name: 'Boulangerie Eric Kayser',
          category: 'Bakery',
          openNow: true,
          websiteUri: 'https://example.com/kayser',
          description: 'Artisanal bakery with fresh baguettes.',
        },
        {
          name: 'Cabinet Médical Rivoli',
          category: 'Medical clinic',
          openNow: false,
        },
      ],
      terms: [],
    };

    renderEnrichedPlace(info);

    const descEl = document.getElementById(IDS.SHEET_DESC);
    const html = descEl?.innerHTML ?? '';

    expect(html).toContain('sheet-organizations-block');
    expect(html).toContain('Places &amp; Organizations at this Address');
    expect(html).toContain('2 places located here');
    expect(html).toContain('Boulangerie Eric Kayser');
    expect(html).toContain('Bakery');
    expect(html).toContain('Open Now');
    expect(html).toContain('https://example.com/kayser');
    expect(html).toContain('Cabinet Médical Rivoli');
    expect(html).toContain('Medical clinic');
    expect(html).toContain('Closed');
  });

  it('does not show organizations block when placesAtAddress is empty or undefined', () => {
    const info: EnrichedPlaceInfo = {
      name: '14 Rue de Rivoli',
      subtitle: '🏢 Building',
      category: 'building',
      emoji: '🏢',
      lat: 48.855,
      lon: 2.355,
      address: '14 Rue de Rivoli, 75004 Paris',
      placesAtAddress: [],
      terms: [],
    };

    renderEnrichedPlace(info);

    const descEl = document.getElementById(IDS.SHEET_DESC);
    const html = descEl?.innerHTML ?? '';

    expect(html).not.toContain('sheet-organizations-block');
    expect(html).not.toContain('Places &amp; Organizations at this Address');
  });
});
