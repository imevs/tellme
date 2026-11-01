import { store } from '../store';
import { $, $safe, show, hide, showEl, hideEl, esc, highlightTerms } from './dom';
import { IDS, CSS } from '../constants';
import { clearClickedMarker } from '../map/leaflet';
import { clearUrlCoordinates } from '../utils/url';
import type { HistoryEntry, EnrichedPlaceInfo } from '../types';

// ── Pure Helpers ───────────────────────────────────────

export function isGenericName(name?: string | null): boolean {
  if (!name || !name.trim()) return true;
  const n = name.trim().toLowerCase();
  const genericStrings = new Set([
    'map object',
    'building',
    'house',
    'residential',
    'apartments',
    'commercial',
    'retail',
    'office',
    'industrial',
    'warehouse',
    'roof',
    'yes',
    'no',
    'unnamed',
    'this place',
    'place',
    'feature',
    'inspecting object…',
    'loading…',
  ]);
  if (genericStrings.has(n)) return true;
  if (/^(node|way|relation)\/\d+$/i.test(n)) return true;
  if (/^\d+[a-z]?$/i.test(n)) return true;
  return false;
}

// ── Open / close ───────────────────────────────────────

export function openSheet(title: string, subtitle: string, address?: string): void {
  $(IDS.SHEET_TITLE).textContent    = title;
  $(IDS.SHEET_SUBTITLE).textContent = subtitle;

  const addrEl = $safe(IDS.SHEET_ADDRESS);
  if (addrEl) {
    if (address && address !== title) {
      addrEl.textContent = `📍 ${address}`;
      addrEl.removeAttribute('hidden');
    } else {
      addrEl.textContent = '';
      addrEl.setAttribute('hidden', '');
    }
  }

  showEl(IDS.SHEET_LOADING);
  hideEl(IDS.SHEET_DESC);
  hideEl(IDS.EXPLORE_HINT);

  updateBack();
  updateBreadcrumb();

  $(IDS.DESC_SHEET).classList.add(CSS.OPEN);
  $(IDS.CARDS_WRAP).classList.add(CSS.DIMMED);
}

export function closeSheet(): void {
  $(IDS.DESC_SHEET).classList.remove(CSS.OPEN);
  $(IDS.CARDS_WRAP).classList.remove(CSS.DIMMED);

  store.update({ activeIdx: -1, history: [] });

  document.querySelectorAll(`.${CSS.POI_CARD}, .${CSS.CM_WRAP}`)
    .forEach(el => el.classList.remove(CSS.ACTIVE));

  clearClickedMarker();
  clearUrlCoordinates();
}

// ── Render description ─────────────────────────────────

export function renderDesc(description: string, terms: string[], image?: string): void {
  hideEl(IDS.SHEET_LOADING);

  let html = highlightTerms(description, terms);
  if (image) {
    html = `<div class="sheet-hero-img-wrap"><img class="sheet-hero-img" src="${esc(image)}" alt="" /></div>${html}`;
  }

  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML = html;
  showEl(IDS.SHEET_DESC);

  const hasTerms = descEl.querySelectorAll(`.${CSS.TERM}`).length > 0;
  if (hasTerms) showEl(IDS.EXPLORE_HINT);
  else hideEl(IDS.EXPLORE_HINT);

  wireTerms();
}

export function renderEnrichedPlace(info: EnrichedPlaceInfo): void {
  hideEl(IDS.SHEET_LOADING);

  const displayAddress = info.address || info.googlePlace?.formattedAddress;
  const isGeneric = isGenericName(info.name);

  // If the object has no distinct name, address is shown as title.
  // If object has a specific name, show name in title and address directly below it in title column.
  if (isGeneric && displayAddress) {
    $(IDS.SHEET_TITLE).textContent = displayAddress;
    $(IDS.SHEET_TITLE).setAttribute('title', displayAddress);
    const addrEl = $safe(IDS.SHEET_ADDRESS);
    if (addrEl) {
      addrEl.textContent = '';
      addrEl.setAttribute('hidden', '');
    }
  } else {
    $(IDS.SHEET_TITLE).textContent = info.name;
    $(IDS.SHEET_TITLE).setAttribute('title', displayAddress ? `${info.name} — ${displayAddress}` : info.name);
    const addrEl = $safe(IDS.SHEET_ADDRESS);
    if (addrEl) {
      if (displayAddress && displayAddress !== info.name) {
        addrEl.textContent = `📍 ${displayAddress}`;
        addrEl.removeAttribute('hidden');
      } else {
        addrEl.textContent = '';
        addrEl.setAttribute('hidden', '');
      }
    }
  }

  $(IDS.SHEET_SUBTITLE).textContent = info.subtitle;

  const sections: string[] = [];

  // Hero image
  if (info.thumbnail) {
    sections.push(
      `<div class="sheet-hero-img-wrap"><img class="sheet-hero-img" src="${esc(info.thumbnail)}" alt="${esc(info.name)}" /></div>`,
    );
  }

  // Google Places Editorial Summary
  if (info.googlePlace?.editorialSummary) {
    sections.push(`
      <div class="sheet-editorial-summary">
        ${esc(info.googlePlace.editorialSummary)}
      </div>
    `);
  }

  // Google Places action links (Website)
  const actions: string[] = [];
  if (info.googlePlace?.websiteUri) {
    actions.push(`
      <a href="${esc(info.googlePlace.websiteUri)}" target="_blank" rel="noopener" class="place-action-btn">
        <span>🌐</span> Visit Website ↗
      </a>
    `);
  }
  if (actions.length > 0) {
    sections.push(`<div class="place-actions-row">${actions.join('')}</div>`);
  }

  // Quick facts cards (Construction date, Status, Height, Architect, Style, etc.)
  const cards: string[] = [];

  if (info.googlePlace?.openNow !== undefined) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">🕒</div>
        <div class="fact-body">
          <div class="fact-label">Status</div>
          <div class="fact-val">${info.googlePlace.openNow ? '<span class="status-open">Open Now</span>' : '<span class="status-closed">Closed</span>'}</div>
        </div>
      </div>
    `);
  }

  const constructionDate = info.wikidata?.inceptionDate ?? info.osm?.startDate;
  if (constructionDate) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">📅</div>
        <div class="fact-body">
          <div class="fact-label">Date of Construction</div>
          <div class="fact-val">${esc(constructionDate)}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.openingDate && info.wikidata.openingDate !== constructionDate) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">🚪</div>
        <div class="fact-body">
          <div class="fact-label">Opened to Public</div>
          <div class="fact-val">${esc(info.wikidata.openingDate)}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.height) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">📐</div>
        <div class="fact-body">
          <div class="fact-label">Height</div>
          <div class="fact-val">${esc(info.wikidata.height)}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.architects && info.wikidata.architects.length > 0) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">🏛️</div>
        <div class="fact-body">
          <div class="fact-label">Architect / Builder</div>
          <div class="fact-val">${esc(info.wikidata.architects.join(', '))}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.styles && info.wikidata.styles.length > 0) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">🎨</div>
        <div class="fact-body">
          <div class="fact-label">Architectural Style</div>
          <div class="fact-val">${esc(info.wikidata.styles.join(', '))}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.namedAfter && info.wikidata.namedAfter.length > 0) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">🏷️</div>
        <div class="fact-body">
          <div class="fact-label">Named In Honor Of</div>
          <div class="fact-val">${esc(info.wikidata.namedAfter.join(', '))}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.heritage && info.wikidata.heritage.length > 0) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">📜</div>
        <div class="fact-body">
          <div class="fact-label">Heritage Status</div>
          <div class="fact-val">${esc(info.wikidata.heritage.join(', '))}</div>
        </div>
      </div>
    `);
  }

  if (info.wikidata?.materials && info.wikidata.materials.length > 0) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">🧱</div>
        <div class="fact-body">
          <div class="fact-label">Construction Materials</div>
          <div class="fact-val">${esc(info.wikidata.materials.join(', '))}</div>
        </div>
      </div>
    `);
  }

  if (displayAddress) {
    cards.push(`
      <div class="fact-card fact-card-wide">
        <div class="fact-icon">📍</div>
        <div class="fact-body">
          <div class="fact-label">Location / Address</div>
          <div class="fact-val">${esc(displayAddress)}</div>
        </div>
      </div>
    `);
  }

  if (cards.length > 0) {
    sections.push(`<div class="facts-grid">${cards.join('')}</div>`);
  }

  // Interesting Facts Section
  const factsList = info.wikidata?.interestingFacts ?? [];
  if (factsList.length > 0) {
    sections.push(`
      <div class="facts-section-box">
        <div class="facts-section-title">
          <span class="facts-sparkle">✨</span> Interesting Facts & Highlights
        </div>
        <ul class="facts-list">
          ${factsList.map(fact => `<li class="fact-bullet-item"><span class="bullet-dot">•</span><span class="bullet-text">${esc(fact)}</span></li>`).join('')}
        </ul>
      </div>
    `);
  }

  // Narrative / Wikipedia / Description
  if (info.descriptionHtml) {
    sections.push(`
      <div class="sheet-narrative-section">
        <div class="sheet-narrative-text">${info.descriptionHtml}</div>
      </div>
    `);
  }

  // Places (Organizations) Located at this Address Section
  if (info.placesAtAddress && info.placesAtAddress.length > 0) {
    const orgs = info.placesAtAddress;
    const itemsHtml = orgs.map(org => {
      const statusBadge = org.openNow !== undefined
        ? (org.openNow ? '<span class="org-status-open">● Open Now</span>' : '<span class="org-status-closed">● Closed</span>')
        : '';
      const websiteBtn = org.websiteUri
        ? `<a href="${esc(org.websiteUri)}" target="_blank" rel="noopener" class="org-link-btn" title="Visit website"><span>🌐</span> Website ↗</a>`
        : '';
      const descHtml = org.description
        ? `<div class="org-item-desc">${esc(org.description)}</div>`
        : '';
      const categoryBadge = org.category
        ? `<span class="org-item-category">${esc(org.category)}</span>`
        : '';

      return `
        <div class="organization-item">
          <div class="org-item-top">
            <div class="org-item-title-row">
              <span class="org-icon">🏢</span>
              <span class="org-item-name">${esc(org.name)}</span>
            </div>
            ${categoryBadge}
          </div>
          ${statusBadge ? `<div class="org-item-status-row">${statusBadge}</div>` : ''}
          ${descHtml}
          ${websiteBtn ? `<div class="org-item-actions">${websiteBtn}</div>` : ''}
        </div>
      `;
    }).join('');

    sections.push(`
      <div class="sheet-organizations-block">
        <div class="organizations-block-header">
          <span class="organizations-block-badge">🏢 Directory</span>
          <h3 class="organizations-block-title">Places & Organizations at this Address</h3>
          <div class="organizations-block-sub">${orgs.length} ${orgs.length === 1 ? 'place' : 'places'} located here</div>
        </div>
        <div class="organizations-list">
          ${itemsHtml}
        </div>
      </div>
    `);
  }

  // Street Information Section (shown at bottom in a separate block when card is showing building info & street info exists)
  if (info.streetInfo) {
    const street = info.streetInfo;
    const streetBlocks: string[] = [];

    streetBlocks.push(`
      <div class="sheet-street-block">
        <div class="street-block-header">
          <span class="street-block-badge">🛣️ Street Guide</span>
          <h3 class="street-block-title">${esc(street.name)}</h3>
          ${street.subtitle ? `<div class="street-block-sub">${esc(street.subtitle)}</div>` : ''}
        </div>
    `);

    if (street.thumbnail) {
      streetBlocks.push(`
        <div class="street-hero-img-wrap">
          <img class="street-hero-img" src="${esc(street.thumbnail)}" alt="${esc(street.name)}" />
        </div>
      `);
    }

    if (street.descriptionHtml) {
      streetBlocks.push(`
        <div class="street-desc-text">
          ${street.descriptionHtml}
        </div>
      `);
    }

    if (street.wikipediaUrl) {
      streetBlocks.push(`
        <div class="street-action-row">
          <a href="${esc(street.wikipediaUrl)}" target="_blank" rel="noopener" class="street-link-btn">
            <span>📖</span> Explore ${esc(street.name)} on Wikipedia ↗
          </a>
        </div>
      `);
    }

    streetBlocks.push(`</div>`);
    sections.push(streetBlocks.join(''));
  }

  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML = sections.join('');
  showEl(IDS.SHEET_DESC);

  const hasTerms = descEl.querySelectorAll(`.${CSS.TERM}`).length > 0;
  if (hasTerms) showEl(IDS.EXPLORE_HINT);
  else hideEl(IDS.EXPLORE_HINT);

  wireTerms();
}

export function renderError(message: string): void {
  hideEl(IDS.SHEET_LOADING);
  hideEl(IDS.EXPLORE_HINT);
  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML =
    `<div class="sheet-error">⚠️ ${esc(message)}<br>` +
    `<span style="color:var(--text-2);font-size:12px;margin-top:4px;display:block;">` +
    `Check your API key in ⚙️ settings.</span></div>`;
  showEl(IDS.SHEET_DESC);
}

// ── Term tapping ───────────────────────────────────────

export function wireTerms(): void {
  const descEl = $safe(IDS.SHEET_DESC);
  if (!descEl) return;

  descEl.querySelectorAll(`.${CSS.TERM}`).forEach(el => {
    const span = el as HTMLElement;
    // Clone to remove previous listeners without WeakRef bookkeeping
    const fresh = span.cloneNode(true) as HTMLElement;
    span.replaceWith(fresh);

    const term = fresh.dataset['term'] ?? '';
    fresh.addEventListener('click', () => exploreTerm(term));
    fresh.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') exploreTerm(term);
    });
  });
}

// ── Exploration history ────────────────────────────────

export function exploreTerm(term: string): void {
  const currentHtml = $safe(IDS.SHEET_DESC)?.innerHTML ?? '';
  const addrEl = $safe(IDS.SHEET_ADDRESS);
  const currentAddr = (addrEl && !addrEl.hasAttribute('hidden')) ? addrEl.textContent?.replace(/^📍\s*/, '') : undefined;

  const entry: HistoryEntry = {
    title:    $(IDS.SHEET_TITLE).textContent ?? '',
    subtitle: $(IDS.SHEET_SUBTITLE).textContent ?? '',
    address:  currentAddr,
    html:     currentHtml,
  };

  store.update({ history: [...store.get().history, entry] });

  $(IDS.SHEET_TITLE).textContent    = term;
  $(IDS.SHEET_SUBTITLE).textContent = '🔍 exploring concept';
  if (addrEl) {
    addrEl.textContent = '';
    addrEl.setAttribute('hidden', '');
  }

  updateBack();
  updateBreadcrumb();

  // Scroll sheet to top
  $safe(IDS.SHEET_BODY)!.scrollTop = 0;

  // Trigger fetch via callback registered in main.ts
  onExploreTerm?.(term);
}

/** Registered by main.ts to avoid circular import */
let onExploreTerm: ((term: string) => void) | null = null;
export function registerExploreCallback(fn: (term: string) => void): void {
  onExploreTerm = fn;
}

export function goBack(): void {
  const history = [...store.get().history];
  const prev    = history.pop();
  if (!prev) return;

  store.update({ history });

  $(IDS.SHEET_TITLE).textContent    = prev.title;
  $(IDS.SHEET_SUBTITLE).textContent = prev.subtitle;

  const addrEl = $safe(IDS.SHEET_ADDRESS);
  if (addrEl) {
    if (prev.address) {
      addrEl.textContent = `📍 ${prev.address}`;
      addrEl.removeAttribute('hidden');
    } else {
      addrEl.textContent = '';
      addrEl.setAttribute('hidden', '');
    }
  }

  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML = prev.html;
  showEl(IDS.SHEET_DESC);
  hideEl(IDS.SHEET_LOADING);

  const hasTerms = descEl.querySelectorAll(`.${CSS.TERM}`).length > 0;
  if (hasTerms) showEl(IDS.EXPLORE_HINT);
  else hideEl(IDS.EXPLORE_HINT);

  wireTerms();
  updateBack();
  updateBreadcrumb();
}

// ── Header controls ────────────────────────────────────

function updateBack(): void {
  const btn = $safe(IDS.SHEET_BACK);
  if (!btn) return;
  if (store.get().history.length > 0) btn.removeAttribute('hidden');
  else btn.setAttribute('hidden', '');
}

function updateBreadcrumb(): void {
  const bc = $safe(IDS.BREADCRUMB);
  if (!bc) return;

  const { history } = store.get();
  if (!history.length) { bc.setAttribute('hidden', ''); return; }

  bc.removeAttribute('hidden');
  bc.innerHTML = history
    .map((h, i) =>
      `<span class="${i === history.length - 1 ? CSS.BC_CURRENT : CSS.BC_ITEM}">${esc(h.title)}</span>`,
    )
    .join('');
}

// ── Swipe to close ─────────────────────────────────────

export function initSwipe(): void {
  const sheet  = $safe(IDS.DESC_SHEET);
  const handle = $safe(IDS.SHEET_DRAG);
  if (!sheet || !handle) return;

  let startY   = 0;
  let dragging = false;

  handle.addEventListener('touchstart', (e: TouchEvent) => {
    const body = $safe(IDS.SHEET_BODY);
    if (body && body.scrollTop > 0) return;  // don't intercept mid-scroll
    startY   = e.touches[0]!.clientY;
    dragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (!dragging) return;
    const dy = e.touches[0]!.clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  document.addEventListener('touchend', (e: TouchEvent) => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    const dy = e.changedTouches[0]!.clientY - startY;
    sheet.style.transform = '';
    if (dy > 90) closeSheet();
  });
}
