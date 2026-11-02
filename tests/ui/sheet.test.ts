import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderEnrichedPlace,
  closeSheet,
  openSheet,
  renderDesc,
  renderError,
  inferInceptionLabel,
  simplifyAddressForDisplay,
  formatNarrativeHtml,
  exploreTerm,
} from '../../src/ui/sheet';
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

    // Redundant Interesting Facts box is omitted when .facts-grid is present
    expect(html).not.toContain('Interesting Facts &amp; Highlights');

    // Data sources MUST NOT be shown
    expect(html).not.toContain('Data Sources:');
    expect(html).not.toContain('OpenStreetMap (way #243243)');
    expect(html).not.toContain('Wikidata (Q243)');

    // Hero image
    expect(html).toContain('https://example.com/eiffel.jpg');
  });

  it('renders placesAtAddress without the Directory badge', () => {
    const infoWithPlaces: EnrichedPlaceInfo = {
      name: 'Sample Complex',
      subtitle: 'Building',
      category: 'building',
      emoji: '🏢',
      lat: 0,
      lon: 0,
      terms: [],
      placesAtAddress: [
        {
          name: 'Acme Cafe',
          category: 'Cafe',
          source: 'osm',
        },
      ],
    };

    renderEnrichedPlace(infoWithPlaces);
    const html = document.getElementById(IDS.SHEET_DESC)?.innerHTML ?? '';
    expect(html).toContain('Places &amp; Organizations at this Address');
    expect(html).toContain('Acme Cafe');
    expect(html).not.toContain('organizations-block-badge');
    expect(html).not.toContain('Directory');
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

  it('labels P571 as "Established" for organizations/stations and "Date of Construction" for buildings', () => {
    expect(
      inferInceptionLabel({
        name: 'Radio Latvia',
        subtitle: '📍 amenity',
        category: 'amenity',
        emoji: '📍',
        lat: 56.9498,
        lon: 24.1063,
        wikidata: {
          qid: 'Q1',
          label: 'Radio Latvia',
          description: 'Latvian national radio station',
          inceptionDate: '2013',
          architects: [],
          styles: [],
          namedAfter: [],
          heritage: [],
          instances: ['radio station'],
          materials: [],
          interestingFacts: [],
        },
        terms: [],
      }),
    ).toBe('Established');

    expect(
      inferInceptionLabel({
        name: 'Riga Cathedral',
        subtitle: '⛪ historic',
        category: 'historic',
        emoji: '⛪',
        lat: 56.949,
        lon: 24.104,
        wikidata: {
          qid: 'Q2',
          label: 'Riga Cathedral',
          description: 'Evangelical Lutheran cathedral in Riga',
          inceptionDate: '1211',
          architects: [],
          styles: [],
          namedAfter: [],
          heritage: [],
          instances: ['cathedral'],
          materials: [],
          interestingFacts: [],
        },
        terms: [],
      }),
    ).toBe('Date of Construction');
  });

  it('suppresses trivial 1-line narrative fragments and promotes them to subtitle', () => {
    const info: EnrichedPlaceInfo = {
      name: 'Radio Latvia',
      subtitle: '📍 amenity',
      category: 'amenity',
      emoji: '📍',
      lat: 56.9498,
      lon: 24.1063,
      descriptionHtml: 'Latvian national radio station',
      terms: [],
    };

    renderEnrichedPlace(info);

    const subEl = document.getElementById(IDS.SHEET_SUBTITLE);
    expect(subEl?.textContent).toBe('📍 amenity • Latvian national radio station');

    const html = document.getElementById(IDS.SHEET_DESC)?.innerHTML ?? '';
    expect(html).not.toContain('sheet-narrative-section');
  });

  it('hides trivial street guide block when description is < 40 chars and has no thumbnail', () => {
    const info: EnrichedPlaceInfo = {
      name: 'Radio Latvia',
      subtitle: '📍 amenity',
      category: 'amenity',
      emoji: '📍',
      lat: 56.9498,
      lon: 24.1063,
      isBuilding: true,
      streetName: 'Doma laukums',
      streetInfo: {
        name: 'Doma laukums',
        subtitle: '🛣️ Street in Riga',
        rawDescription: 'square in Riga, Latvia',
        descriptionHtml: '<p>square in Riga, Latvia</p>',
      },
      terms: [],
    };

    renderEnrichedPlace(info);
    const html = document.getElementById(IDS.SHEET_DESC)?.innerHTML ?? '';
    expect(html).not.toContain('sheet-street-block');
  });

  it('formats multi-paragraph narratives with <p> tags and a working "Read more ▾" toggle', () => {
    const html = formatNarrativeHtml('First paragraph of history.\n\nSecond paragraph of details.');
    expect(html).toContain('<p class="narrative-para">First paragraph of history.</p>');
    expect(html).toContain('<div class="narrative-more" hidden><p class="narrative-para">Second paragraph of details.</p></div>');
    expect(html).toContain('narrative-toggle-btn');

    renderDesc('Paragraph one about Riga Cathedral.\n\nParagraph two about Gothic architecture.', []);
    const descEl = document.getElementById(IDS.SHEET_DESC)!;
    const toggleBtn = descEl.querySelector<HTMLButtonElement>('.narrative-toggle-btn');
    const moreEl = descEl.querySelector<HTMLElement>('.narrative-more');
    expect(toggleBtn).not.toBeNull();
    expect(moreEl?.hasAttribute('hidden')).toBe(true);

    toggleBtn?.click();
    expect(moreEl?.hasAttribute('hidden')).toBe(false);
    expect(toggleBtn?.textContent).toBe('Show less ▴');
  });

  it('simplifies verbose addresses and renders tappable breadcrumb buttons', () => {
    expect(simplifyAddressForDisplay('8 Doma laukums, Old Riga, Riga, LV-1050, Latvia')).toBe(
      '8 Doma laukums, Old Riga, Riga',
    );

    openSheet('Riga Cathedral', '⛪ Cathedral', '6 Herdera laukums, Riga');
    exploreTerm('Brick Gothic');
    exploreTerm('Hanseatic League');

    const bc = document.getElementById(IDS.BREADCRUMB)!;
    const buttons = bc.querySelectorAll<HTMLButtonElement>('button.bc-item');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe('Riga Cathedral');

    // Tapping the first breadcrumb jumps directly back to Riga Cathedral
    buttons[0]?.click();
    expect(document.getElementById(IDS.SHEET_TITLE)?.textContent).toBe('Riga Cathedral');
    expect(store.get().history).toHaveLength(0);
  });

  it('mentions the date of building construction as an interesting fact for the Latvijas Radio building', () => {
    const info: EnrichedPlaceInfo = {
      name: 'Radio Latvia',
      subtitle: '📍 amenity',
      category: 'amenity',
      emoji: '📍',
      lat: 56.94981,
      lon: 24.10633,
      address: '8 Doma laukums, Old Riga, Riga, Latvia',
      isBuilding: true,
      wikidata: {
        qid: 'Q1807092',
        label: 'Latvijas Radio',
        description: 'public radio broadcasting organization in Latvia',
        inceptionDate: 'November 1, 1925',
        buildingConstructionDate: '1906',
        architects: [],
        styles: [],
        namedAfter: [],
        heritage: ['National architectural monument of Latvia'],
        instances: ['radio station', 'business'],
        materials: [],
        interestingFacts: [
          'The building was constructed in 1906.',
          'Established in November 1, 1925.',
        ],
      },
      terms: ['Latvijas Radio'],
    };

    renderEnrichedPlace(info);

    const html = document.getElementById(IDS.SHEET_DESC)?.innerHTML ?? '';
    expect(html).toContain('Established');
    expect(html).toContain('November 1, 1925');
    expect(html).toContain('Interesting Facts &amp; Highlights');
    expect(html).toContain('The building was constructed in 1906.');
  });
});
