/** All magic strings and numeric literals — import from here, never hardcode */

// ── Network endpoints ──────────────────────────────────
export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
export const PHOTON_REVERSE_ENDPOINT = 'https://photon.komoot.io/reverse';
export const WIKIDATA_API_ENDPOINT = 'https://www.wikidata.org/w/api.php';
export const WIKIPEDIA_API_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
export const GOOGLE_PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
export const GOOGLE_PLACES_MAX_DAILY_CALLS = 40;

// ── Secrets & deployment config (injected at build time, never committed) ──
// Prefer GOOGLE_PLACES_PROXY_URL (server-side key). A browser key, if used, MUST be
// restricted in Google Cloud Console (HTTP referrer + Places API only + quota).
export const GOOGLE_PLACES_API_KEY: string = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? '';
export const GOOGLE_PLACES_PROXY_URL: string = import.meta.env.VITE_GOOGLE_PLACES_PROXY_URL ?? '';
/** Optional valid contact e-mail sent to Nominatim (usage policy recommends it for heavy use). */
export const NOMINATIM_CONTACT_EMAIL: string = import.meta.env.VITE_NOMINATIM_EMAIL ?? '';

// ── API etiquette ──────────────────────────────────────
/** Sent as `Api-User-Agent` to Wikimedia APIs (browsers cannot override User-Agent). */
export const APP_USER_AGENT = 'TellMe/1.0 (https://github.com/imevs/tellme; tap-to-explore travel web app)';
/** Minimum spacing between consecutive requests per host (Nominatim policy: ≤ 1 req/s). */
export const HOST_MIN_INTERVAL_MS: Readonly<Record<string, number>> = {
  'nominatim.openstreetmap.org': 1000,
  'photon.komoot.io': 250,
};

// ── Map defaults ───────────────────────────────────────
export const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris
export const DEFAULT_ZOOM = 15;
export const FLY_TO_ZOOM = 16;
export const MIN_ZOOM_FOR_POIS = 13;

// ── Data limits ────────────────────────────────────────
export const MAX_POIS = 24;
export const ADDRESS_DESC_LIMIT = 50;

// ── Timings (ms) ───────────────────────────────────────
export const DEBOUNCE_MAP_MS = 900;
export const TOAST_DURATION_MS = 2800;

// ── Element IDs ────────────────────────────────────────
export const IDS = {
  MAP: 'map',
  APP: 'app',
  CARDS_WRAP: 'cards-wrap',
  CARDS_SCROLL: 'cards-scroll',
  EMPTY_STATE: 'empty-state',
  EMPTY_MSG: 'empty-msg',
  LOCATING_STRIP: 'locating-strip',
  DESC_SHEET: 'desc-sheet',
  SHEET_DRAG: 'sheet-drag-handle',
  SHEET_BACK: 'sheet-back',
  SHEET_CLOSE: 'sheet-close',
  SHEET_TITLE: 'sheet-title',
  SHEET_SUBTITLE: 'sheet-subtitle',
  SHEET_ADDRESS: 'sheet-address',
  SHEET_BODY: 'sheet-body',
  SHEET_LOADING: 'sheet-loading',
  SHEET_DESC: 'sheet-desc',
  BREADCRUMB: 'breadcrumb',
  TOAST: 'toast',
  API_MODAL: 'api-modal',
  API_SAVE_BTN: 'api-save-btn',
  LOCATE_BTN: 'locate-btn',
  FULLSCREEN_BTN: 'fullscreen-btn',
  SETTINGS_BTN: 'settings-btn',
  ZOOM_IN_BTN: 'zoom-in-btn',
  ZOOM_OUT_BTN: 'zoom-out-btn',
  FILTER_SCROLL: 'filter-scroll',
} as const;

// ── CSS class names ────────────────────────────────────
export const CSS = {
  OPEN: 'open',
  ACTIVE: 'active',
  HIDDEN: 'hidden',
  DIMMED: 'dimmed',
  SHOW: 'show',
  TERM: 'term',
  BC_ITEM: 'bc-item',
  BC_CURRENT: 'bc-item current',
  POI_CARD: 'poi-card',
  CM_WRAP: 'cm-wrap',
  FILTER_CHIP: 'filter-chip',
} as const;

// ── Tile layer ─────────────────────────────────────────
export const MAP_TILES = {
  URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  ATTRIBUTION:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  SUBDOMAINS: 'abc',
  MAX_ZOOM: 19,
} as const;

// ── Skeleton count ─────────────────────────────────────
export const SKELETON_COUNT = 5;
