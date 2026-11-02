import { store } from '../store';
import { $, $safe, showEl, hideEl, esc, highlightTerms } from './dom';
import { showToast } from './toast';
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

/**
 * Determines whether P571 (inception / start date) should be labeled
 * "Established" (for organizations, broadcasters, businesses, institutions)
 * or "Date of Construction" (for buildings, monuments, physical structures).
 */
export function inferInceptionLabel(info: EnrichedPlaceInfo): string {
  const instancesText = (info.wikidata?.instances || []).join(' ');
  const wdDesc = info.wikidata?.description || '';
  const osmType = `${info.osm?.category || ''} ${info.osm?.type || ''} ${info.category || ''}`;
  const combined = `${instancesText} ${wdDesc} ${osmType}`.toLowerCase();

  const isPhysicalStructure = /\b(building|church|cathedral|basilica|chapel|castle|palace|fortress|monument|memorial|statue|tower|bridge|arch|house|skyscraper|structure|edifice)\b/i.test(
    `${instancesText} ${wdDesc}`,
  );
  if (isPhysicalStructure) {
    return 'Date of Construction';
  }

  const isOrganization = /\b(station|radio|television|broadcaster|network|studio|company|corporation|business|enterprise|organization|organisation|institution|agency|choir|orchestra|ensemble|university|college|school|bank|shop|store|restaurant|cafe|bistro|bakery|pharmacy|publisher|ministry|parliament|association|club)\b/i.test(
    combined,
  );
  if (isOrganization) {
    return 'Established';
  }

  return 'Date of Construction';
}

/**
 * Simplifies verbose 4+ segment OSM addresses (e.g. dropping trailing country/region/postcode noise)
 * while preserving concise 1-3 segment addresses intact.
 */
export function simplifyAddressForDisplay(rawAddress?: string | null): string {
  if (!rawAddress) return '';
  const parts = rawAddress.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length <= 3) return rawAddress.trim();
  const filtered = parts.filter(p => !/^[A-Z]{0,3}-?\d{4,6}$/i.test(p));
  return filtered.slice(0, 3).join(', ');
}

/**
 * Wraps multi-paragraph narrative HTML into <p> elements and adds a collapsible
 * "Read more" toggle when there are multiple paragraphs.
 */
export function formatNarrativeHtml(rawHtml: string): string {
  const trimmed = rawHtml.trim();
  if (!trimmed) return '';

  const rawParas = trimmed
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const paras = rawParas.map(p => (p.startsWith('<p') ? p : `<p class="narrative-para">${p}</p>`));
  if (paras.length <= 1) {
    return paras[0] ?? '';
  }

  const first = paras[0]!;
  const rest = paras.slice(1).join('');
  return (
    `${first}` +
    `<div class="narrative-more" hidden>${rest}</div>` +
    `<button type="button" class="narrative-toggle-btn" aria-expanded="false">Read more ▾</button>`
  );
}

function wireAddressAction(addrEl: HTMLElement, addressText: string): void {
  addrEl.setAttribute('role', 'button');
  addrEl.setAttribute('tabindex', '0');
  addrEl.setAttribute('title', 'Tap to copy address');
  addrEl.onclick = () => {
    void navigator.clipboard?.writeText(addressText).catch(() => {});
    showToast('Address copied to clipboard 📋');
  };
  addrEl.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      addrEl.click();
    }
  };
}



// ── Open / close ───────────────────────────────────────

export function openSheet(title: string, subtitle: string, address?: string): void {
  $(IDS.SHEET_TITLE).textContent    = title;
  $(IDS.SHEET_SUBTITLE).textContent = subtitle;

  const addrEl = $safe(IDS.SHEET_ADDRESS);
  if (addrEl) {
    const cleanAddr = simplifyAddressForDisplay(address);
    if (cleanAddr && cleanAddr !== title) {
      addrEl.textContent = `📍 ${cleanAddr}`;
      addrEl.removeAttribute('hidden');
      wireAddressAction(addrEl, address || cleanAddr);
    } else {
      addrEl.textContent = '';
      addrEl.setAttribute('hidden', '');
    }
  }

  showEl(IDS.SHEET_LOADING);
  hideEl(IDS.SHEET_DESC);

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

  let html = formatNarrativeHtml(highlightTerms(description, terms));
  if (image) {
    html = `<div class="sheet-hero-img-wrap" role="button" tabindex="0" title="Tap to toggle full photo"><img class="sheet-hero-img" src="${esc(image)}" alt="" /></div>${html}`;
  }

  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML = html;
  showEl(IDS.SHEET_DESC);
  wireTerms();
}

export function renderEnrichedPlace(info: EnrichedPlaceInfo): void {
  hideEl(IDS.SHEET_LOADING);

  const rawAddress = info.address || info.googlePlace?.formattedAddress;
  const displayAddress = simplifyAddressForDisplay(rawAddress);
  const isGeneric = isGenericName(info.name) ||
    Boolean(info.isBuilding && info.streetName && info.name.trim().toLowerCase() === info.streetName.trim().toLowerCase());

  // If the object has no distinct name, address is shown as title.
  // If object has a specific name, show name in title and address directly below it in title column.
  if (isGeneric && displayAddress) {
    $(IDS.SHEET_TITLE).textContent = displayAddress;
    $(IDS.SHEET_TITLE).setAttribute('title', rawAddress || displayAddress);
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
        wireAddressAction(addrEl, rawAddress || displayAddress);
      } else {
        addrEl.textContent = '';
        addrEl.setAttribute('hidden', '');
      }
    }
  }

  // Check if narrative is just a short 1-line Wikidata fragment (< 45 chars without sentence punctuation)
  const plainDesc = (info.descriptionHtml || '').replace(/<[^>]*>/g, '').trim();
  const isTrivialFragment = Boolean(plainDesc && plainDesc.length < 45 && !/[.!?]$/.test(plainDesc));

  if (isTrivialFragment && !info.subtitle.toLowerCase().includes(plainDesc.toLowerCase())) {
    $(IDS.SHEET_SUBTITLE).textContent = `${info.subtitle} • ${plainDesc}`;
  } else {
    $(IDS.SHEET_SUBTITLE).textContent = info.subtitle;
  }

  const sections: string[] = [];

  // Hero image
  if (info.thumbnail) {
    sections.push(
      `<div class="sheet-hero-img-wrap" role="button" tabindex="0" title="Tap to toggle full photo"><img class="sheet-hero-img" src="${esc(info.thumbnail)}" alt="${esc(info.name)}" /></div>`,
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
  const inceptionLabel = inferInceptionLabel(info);
  if (constructionDate) {
    cards.push(`
      <div class="fact-card">
        <div class="fact-icon">📅</div>
        <div class="fact-body">
          <div class="fact-label">${esc(inceptionLabel)}</div>
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

  if (cards.length > 0) {
    sections.push(`<div class="facts-grid">${cards.join('')}</div>`);
  }

  // Interesting Facts Section:
  // - Shown in full when .facts-grid is empty
  // - When inspecting a building housing an organization (e.g. Latvijas Radio building) or when a separate
  //   buildingConstructionDate exists, explicitly mention the date of building construction as an interesting fact
  const factsList = info.wikidata?.interestingFacts ?? [];
  const buildingConstructionDate =
    info.wikidata?.buildingConstructionDate ??
    (info.isBuilding && inceptionLabel === 'Established'
      ? (info.osm?.startDate ?? info.wikidata?.inceptionDate)
      : undefined);

  let visibleFacts: string[] = [];
  if (cards.length === 0) {
    visibleFacts = factsList;
  } else if (buildingConstructionDate) {
    const existingBuildingFact = factsList.find(f =>
      /building.*constructed|constructed in/i.test(f) && f.includes(buildingConstructionDate),
    );
    visibleFacts = [
      existingBuildingFact ?? `The building was constructed in ${buildingConstructionDate}.`,
    ];
  }

  if (visibleFacts.length > 0) {
    sections.push(`
      <div class="facts-section-box">
        <div class="facts-section-title">
          <span class="facts-sparkle">✨</span> Interesting Facts & Highlights
        </div>
        <ul class="facts-list">
          ${visibleFacts.map(fact => `<li class="fact-bullet-item"><span class="bullet-dot">•</span><span class="bullet-text">${esc(fact)}</span></li>`).join('')}
        </ul>
      </div>
    `);
  }

  // Narrative / Wikipedia / Description (suppressed if it was just a trivial <45 char label promoted to subtitle)
  if (info.descriptionHtml && !isTrivialFragment) {
    sections.push(`
      <div class="sheet-narrative-section">
        <div class="sheet-narrative-text">${formatNarrativeHtml(info.descriptionHtml)}</div>
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
          <h3 class="organizations-block-title">Places & Organizations at this Address</h3>
          <div class="organizations-block-sub">${orgs.length} ${orgs.length === 1 ? 'place' : 'places'} located here</div>
        </div>
        <div class="organizations-list">
          ${itemsHtml}
        </div>
      </div>
    `);
  }

  // Street Information Section (only rendered when there is a meaningful description >= 40 chars or a thumbnail)
  if (info.streetInfo) {
    const street = info.streetInfo;
    const streetPlain = (street.rawDescription || street.descriptionHtml?.replace(/<[^>]*>/g, '') || '').trim();
    const hasMeaningfulStreetContent = Boolean(street.thumbnail) || streetPlain.length >= 40;

    if (hasMeaningfulStreetContent) {
      const streetBlocks: string[] = [];

      const displaySubtitle = street.subtitle ? street.subtitle.replace(/^🛣️\s*/, '').trim() : '';
      const cleanSub = displaySubtitle.toLowerCase();
      const cleanDesc = streetPlain.toLowerCase();
      const isSubDuplicate = cleanSub && cleanDesc && (cleanSub === cleanDesc || cleanDesc.startsWith(cleanSub));
      const showSubtitle = Boolean(displaySubtitle && !isSubDuplicate);

      streetBlocks.push(`
        <div class="sheet-street-block">
          <div class="street-block-header">
            <span class="street-block-badge">🛣️ Street Guide</span>
            <h3 class="street-block-title">${esc(street.name)}</h3>
            ${showSubtitle ? `<div class="street-block-sub">${esc(displaySubtitle)}</div>` : ''}
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
            ${formatNarrativeHtml(street.descriptionHtml)}
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
  }

  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML = sections.join('');
  showEl(IDS.SHEET_DESC);

  wireTerms();
}

export function renderError(message: string): void {
  hideEl(IDS.SHEET_LOADING);
  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML =
    `<div class="sheet-error">⚠️ ${esc(message)}<br>` +
    `<span style="color:var(--text-2);font-size:12px;margin-top:4px;display:block;">` +
    `Please try tapping another object or moving the map.</span></div>`;
  showEl(IDS.SHEET_DESC);
}

// ── Term tapping & Interactive Elements ────────────────

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

  // Wire collapsible "Read more ▾" narrative toggle
  descEl.querySelectorAll<HTMLButtonElement>('.narrative-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      const moreEl = btn.previousElementSibling as HTMLElement | null;
      if (!moreEl) return;
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        moreEl.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Read more ▾';
      } else {
        moreEl.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = 'Show less ▴';
      }
    };
  });

  // Wire Hero image tap-to-expand toggle
  descEl.querySelectorAll<HTMLElement>('.sheet-hero-img-wrap').forEach(wrap => {
    wrap.onclick = () => {
      wrap.classList.toggle('expanded');
    };
    wrap.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        wrap.classList.toggle('expanded');
      }
    };
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

  try {
    window.history.pushState({ tellmeTerm: term }, '', window.location.hash || '#');
  } catch {
    // Ignore history state restrictions in test/sandboxed environments
  }

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

function restoreHistoryEntry(entry: HistoryEntry): void {
  $(IDS.SHEET_TITLE).textContent    = entry.title;
  $(IDS.SHEET_SUBTITLE).textContent = entry.subtitle;

  const addrEl = $safe(IDS.SHEET_ADDRESS);
  if (addrEl) {
    if (entry.address) {
      addrEl.textContent = `📍 ${entry.address}`;
      addrEl.removeAttribute('hidden');
      wireAddressAction(addrEl, entry.address);
    } else {
      addrEl.textContent = '';
      addrEl.setAttribute('hidden', '');
    }
  }

  const descEl = $(IDS.SHEET_DESC);
  descEl.innerHTML = entry.html;
  showEl(IDS.SHEET_DESC);
  hideEl(IDS.SHEET_LOADING);

  wireTerms();
  updateBack();
  updateBreadcrumb();
}

export function goBack(): void {
  const history = [...store.get().history];
  const prev    = history.pop();
  if (!prev) return;

  store.update({ history });
  restoreHistoryEntry(prev);
}

export function jumpToHistory(index: number): void {
  const history = [...store.get().history];
  const target  = history[index];
  if (!target) return;

  store.update({ history: history.slice(0, index) });
  restoreHistoryEntry(target);
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
      `<button type="button" class="${i === history.length - 1 ? CSS.BC_CURRENT : CSS.BC_ITEM}" data-bc-idx="${i}">${esc(h.title)}</button>`,
    )
    .join('');

  bc.querySelectorAll<HTMLButtonElement>('[data-bc-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset['bcIdx']);
      if (!Number.isNaN(idx)) jumpToHistory(idx);
    });
  });
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
