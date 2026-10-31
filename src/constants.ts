/** All magic strings and numeric literals — import from here, never hardcode */

// ── Storage ────────────────────────────────────────────
export const STORAGE_KEY_API = 'tm_key';

// ── Network endpoints ──────────────────────────────────
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const GEMINI_BASE_URL   = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_MODEL      = 'gemini-2.0-flash';

// ── Map defaults ───────────────────────────────────────
export const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris
export const DEFAULT_ZOOM   = 15;
export const FLY_TO_ZOOM    = 16;
export const MIN_ZOOM_FOR_POIS = 13;

// ── Data limits ────────────────────────────────────────
export const MAX_POIS            = 24;
export const OVERPASS_TIMEOUT_S  = 20;
export const OVERPASS_MAX_NODES  = 60;
export const ADDRESS_DESC_LIMIT  = 50;

// ── Timings (ms) ───────────────────────────────────────
export const DEBOUNCE_MAP_MS      = 900;
export const GEOLOCATION_TIMEOUT  = 8000;
export const TOAST_DURATION_MS    = 2800;
export const SWIPE_CLOSE_PX       = 90;
export const FLY_DURATION_S       = 0.9;

// ── Gemini generation config ───────────────────────────
export const GEMINI_TEMPERATURE     = 0.82;
export const GEMINI_MAX_TOKENS      = 600;
export const GEMINI_RESPONSE_MIME   = 'application/json';

// ── Element IDs ────────────────────────────────────────
export const IDS = {
  MAP:            'map',
  APP:            'app',
  CARDS_WRAP:     'cards-wrap',
  CARDS_SCROLL:   'cards-scroll',
  EMPTY_STATE:    'empty-state',
  EMPTY_MSG:      'empty-msg',
  LOCATING_STRIP: 'locating-strip',
  DESC_SHEET:     'desc-sheet',
  SHEET_DRAG:     'sheet-drag-handle',
  SHEET_HEADER:   'sheet-header',
  SHEET_BACK:     'sheet-back',
  SHEET_CLOSE:    'sheet-close',
  SHEET_TITLE:    'sheet-title',
  SHEET_SUBTITLE: 'sheet-subtitle',
  SHEET_BODY:     'sheet-body',
  SHEET_LOADING:  'sheet-loading',
  SHEET_DESC:     'sheet-desc',
  BREADCRUMB:     'breadcrumb',
  EXPLORE_HINT:   'explore-hint',
  TOAST:          'toast',
  API_MODAL:      'api-modal',
  API_KEY_INPUT:  'api-key-input',
  API_SAVE_BTN:   'api-save-btn',
  LOCATE_BTN:     'locate-btn',
  SETTINGS_BTN:   'settings-btn',
  FILTER_SCROLL:  'filter-scroll',
} as const;

// ── CSS class names ────────────────────────────────────
export const CSS = {
  OPEN:       'open',
  ACTIVE:     'active',
  HIDDEN:     'hidden',
  DIMMED:     'dimmed',
  SHOW:       'show',
  TERM:       'term',
  BC_ITEM:    'bc-item',
  BC_CURRENT: 'bc-item current',
  POI_CARD:   'poi-card',
  CM_WRAP:    'cm-wrap',
  FILTER_CHIP:'filter-chip',
} as const;

// ── Data attributes ────────────────────────────────────
export const DATA = {
  INDEX: 'i',
  CAT:   'cat',
  TERM:  'term',
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
