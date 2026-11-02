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

// ── OpenStreetMap Feature ──────────────────────────────
export interface OsmFeature {
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  name: string;
  localName?: string | undefined;
  category: string;
  type: string;
  displayName: string;
  address: {
    road?: string | undefined;
    houseNumber?: string | undefined;
    suburb?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    countryCode?: string | undefined;
    postcode?: string | undefined;
  };
  tags: Record<string, string>;
  wikidataId?: string | undefined;
  wikipedia?: string | undefined;
  startDate?: string | undefined;
  lat: number;
  lon: number;
  addressOrganizations?: AddressPlaceOrganization[] | undefined;
}

// ── Wikidata Facts ─────────────────────────────────────
export interface WikidataFactDetails {
  qid: string;
  label: string;
  description: string;
  inceptionDate?: string | null | undefined;
  buildingConstructionDate?: string | null | undefined;
  openingDate?: string | null | undefined;
  height?: string | null | undefined;
  architects: string[];
  styles: string[];
  namedAfter: string[];
  heritage: string[];
  instances: string[];
  materials: string[];
  interestingFacts: string[];
  imageUrl?: string | null | undefined;
  wikipediaTitle?: string | null | undefined;
  wikipediaUrl?: string | null | undefined;
}

// ── Google Places Details ──────────────────────────────
export interface GooglePlaceDetails {
  id?: string | undefined;
  name?: string | undefined;
  openNow?: boolean | undefined;
  websiteUri?: string | undefined;
  formattedAddress?: string | undefined;
  editorialSummary?: string | undefined;
}

// ── Street Info (About the street a building is on) ───
export interface StreetInfo {
  name: string;
  title?: string | undefined;
  subtitle?: string | undefined;
  descriptionHtml?: string | undefined;
  rawDescription?: string | undefined;
  thumbnail?: string | undefined;
  terms?: string[] | undefined;
  namedAfter?: string[] | undefined;
  inceptionDate?: string | undefined;
  length?: string | undefined;
  wikipediaUrl?: string | undefined;
  wikidataId?: string | undefined;
  source?: 'wikipedia' | 'wikidata' | 'osm' | undefined;
}

// ── Places / Organizations Located at Address ─────────
export interface AddressPlaceOrganization {
  id?: string | undefined;
  name: string;
  category?: string | undefined;
  openNow?: boolean | undefined;
  websiteUri?: string | undefined;
  formattedAddress?: string | undefined;
  description?: string | undefined;
  source?: 'google' | 'osm' | 'wikipedia' | undefined;
}

// ── Enriched Place Info (OSM + Wikidata + Wikipedia + Google Places) ───
export interface EnrichedPlaceInfo {
  name: string;
  subtitle: string;
  category: string;
  emoji: string;
  lat: number;
  lon: number;
  distanceKm?: number | null | undefined;
  address?: string | undefined;
  isBuilding?: boolean | undefined;
  streetName?: string | undefined;
  streetInfo?: StreetInfo | null | undefined;
  placesAtAddress?: AddressPlaceOrganization[] | undefined;
  osm?: OsmFeature | null | undefined;
  wikidata?: WikidataFactDetails | null | undefined;
  googlePlace?: GooglePlaceDetails | null | undefined;
  descriptionHtml?: string | undefined;
  terms: string[];
  thumbnail?: string | undefined;
}

// ── Navigation history entry ───────────────────────────
export interface HistoryEntry {
  title:    string;
  subtitle: string;
  address?: string | undefined;
  html:     string;
}

// ── Application state ──────────────────────────────────
export interface AppState {
  readonly map:           LeafletMap | null;
  readonly userMarker:    Marker | null;
  readonly clickedMarker: Marker | null;
  readonly markers:       Marker[];
  readonly pois:          POI[];
  readonly activeCat:     string;
  readonly activeIdx:     number;       // -1 = none selected
  readonly history:       HistoryEntry[];
}

// ── Store listener ─────────────────────────────────────
export type StateListener = (state: AppState) => void;

