import { store } from '../store';
import { $safe, esc } from './dom';
import { IDS, CSS, SKELETON_COUNT } from '../constants';
import { poiEmoji, poiCategory, poiAddress } from '../api/overpass';
import type { POI } from '../types';

export function showSkeletons(): void {
  const scroll = $safe(IDS.CARDS_SCROLL);
  if (!scroll) return;
  scroll.innerHTML = Array(SKELETON_COUNT)
    .fill('<div class="card-skeleton"></div>')
    .join('');
  $safe(IDS.EMPTY_STATE)?.classList.add(CSS.HIDDEN);
}

export function showEmpty(msg: string): void {
  const scroll = $safe(IDS.CARDS_SCROLL);
  if (scroll) scroll.innerHTML = '';

  const msgEl = $safe(IDS.EMPTY_MSG);
  if (msgEl) msgEl.textContent = msg;

  $safe(IDS.EMPTY_STATE)?.classList.remove(CSS.HIDDEN);
}

export function renderCards(pois: POI[], onSelect: (i: number) => void): void {
  const scroll = $safe(IDS.CARDS_SCROLL);
  if (!scroll) return;

  $safe(IDS.EMPTY_STATE)?.classList.add(CSS.HIDDEN);

  if (!pois.length) {
    showEmpty('No places found — try another area or filter');
    return;
  }

  const { activeIdx } = store.get();

  scroll.innerHTML = pois
    .map((p, i) => {
      const name = p.tags.name ?? p.tags['name:en'] ?? 'Unknown Place';
      const addr = poiAddress(p.tags, p._lat, p._lon);
      const em   = poiEmoji(p.tags);
      const cat  = poiCategory(p.tags);

      return (
        `<button class="${CSS.POI_CARD}${activeIdx === i ? ` ${CSS.ACTIVE}` : ''}" ` +
        `data-i="${i}" id="card-${i}" ` +
        `aria-label="Explore ${esc(name)}">` +
        `<span class="card-emoji" aria-hidden="true">${em}</span>` +
        `<div class="card-name">${esc(name)}</div>` +
        `<div class="card-addr">${esc(addr)}</div>` +
        `<span class="card-badge">${esc(cat)}</span>` +
        `</button>`
      );
    })
    .join('');

  scroll.querySelectorAll<HTMLButtonElement>(`.${CSS.POI_CARD}`).forEach(btn => {
    btn.addEventListener('click', () => onSelect(Number(btn.dataset['i'])));
    btn.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') onSelect(Number(btn.dataset['i']));
    });
  });
}

export function highlightCard(idx: number): void {
  document.querySelectorAll(`.${CSS.POI_CARD}`).forEach(c =>
    c.classList.toggle(CSS.ACTIVE, Number((c as HTMLElement).dataset['i']) === idx),
  );

  const card = document.getElementById(`card-${idx}`);
  card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
