import { $safe } from './dom';
import { IDS, CSS, TOAST_DURATION_MS } from '../constants';

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Show a toast message for a given duration (default from constants) */
export function showToast(msg: string, ms: number = TOAST_DURATION_MS): void {
  const el = $safe(IDS.TOAST);
  if (!el) return;

  el.textContent = msg;
  el.classList.add(CSS.SHOW);

  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove(CSS.SHOW);
    toastTimer = null;
  }, ms);
}
