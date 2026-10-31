import { store } from '../store';
import { $safe } from './dom';
import { IDS, CSS } from '../constants';

export function wireFilters(onChange: (cat: string) => void): void {
  const scroll = $safe<HTMLElement>(IDS.FILTER_SCROLL);
  if (!scroll) return;

  scroll.querySelectorAll<HTMLButtonElement>(`.${CSS.FILTER_CHIP}`).forEach(chip => {
    chip.addEventListener('click', () => {
      scroll.querySelectorAll<HTMLButtonElement>(`.${CSS.FILTER_CHIP}`).forEach(c => {
        c.classList.remove(CSS.ACTIVE);
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add(CSS.ACTIVE);
      chip.setAttribute('aria-pressed', 'true');

      const cat = chip.dataset['cat'] ?? 'all';
      store.update({ activeCat: cat });
      onChange(cat);
    });
  });
}
