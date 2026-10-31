import type { Map as LeafletMap, Marker } from 'leaflet';

// ── Raw Overpass element ───────────────────────────────
export interface OverpassTags {
  name?:              string;
  'name:en'?:         string;
  tourism?:           string;
  historic?:          string;
  amenity?:           string;
  leisure?:           string;
  shop?:              string;
  description?:       string;
  'addr:street'?:     string;
  'addr:housenumber'?:string;
  'addr:city'?:       string;
  [key: string]:      string | undefined;
}

export interface OverpassElement {
  id:      number;
  type:    'node' | 'way' | 'relation';
  lat?:    number;
  lon?:    number;
  center?: { lat: number; lon: number };
  tags?:   OverpassTags;
}

// ── Processed POI (enriched with distance) ─────────────
export interface POI extends OverpassElement {
  tags:   OverpassTags; // guaranteed defined after filtering
  _lat:   number;
  _lon:   number;
  _dist:  number;
}

// ── Gemini API response ────────────────────────────────
export interface GeminiResponse {
  description: string;
  terms:       string[];
}

// ── Fetch description request params ──────────────────
export type DescRequestType = 'place' | 'term';

export interface PlaceDescRequest {
  type: 'place';
  name: string;
  addr: string;
  cat:  string;
}

export interface TermDescRequest {
  type: 'term';
  term: string;
}

export type DescRequest = PlaceDescRequest | TermDescRequest;

// ── Navigation history entry ───────────────────────────
export interface HistoryEntry {
  title:    string;
  subtitle: string;
  html:     string;
}

// ── Application state ──────────────────────────────────
export interface AppState {
  readonly apiKey:       string;
  readonly map:          LeafletMap | null;
  readonly userMarker:   Marker | null;
  readonly markers:      Marker[];
  readonly pois:         POI[];
  readonly activeCat:    string;
  readonly activeIdx:    number;       // -1 = none selected
  readonly history:      HistoryEntry[];
  readonly pendingFetch: DescRequest | null;
}

// ── Store listener ─────────────────────────────────────
export type StateListener = (state: AppState) => void;
