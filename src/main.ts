import 'leaflet/dist/leaflet.css';
import '../style.css';

import { store } from './store';
import { showToast } from './ui/toast';
import { $, $safe } from './ui/dom';
import { wireFilters } from './ui/filters';
import { showSkeletons, showEmpty, renderCards, highlightCard } from './ui/cards';
import {
  openSheet, closeSheet, goBack, renderDesc, renderError, renderEnrichedPlace,
  initSwipe, registerExploreCallback, isGenericName,
} from './ui/sheet';
import {
  initMap, setMarkers, highlightMarker, setClickedMarker, clearClickedMarker,
  flyTo, locateUser, getMapBBox, getMapZoom, getMapCenter,
} from './map/leaflet';
import { poiEmoji, poiCategory, poiAddress } from './api/overpass';
import { fetchNearbyPlaces, DEFAULT_PARIS_POIS } from './api/places';
import { fetchWikiDescription } from './api/wiki';
import { fetchOsmObjectAt, formatOsmAddress, inferOsmEmoji } from './api/osm';
import { fetchWikidataDetails } from './api/wikidata';
import { fetchGooglePlacesAtAddress, resolvePlacesAtAddress } from './api/googlePlaces';
import { isBuildingFeature, extractStreetName, fetchStreetInfo } from './api/street';
import { highlightTerms } from './ui/dom';
import { parseCoordinatesFromUrl, updateUrlCoordinates } from './utils/url';
import {
  IDS, CSS,
  MIN_ZOOM_FOR_POIS,
  FLY_TO_ZOOM,
} from './constants';
import type { POI, EnrichedPlaceInfo } from './types';

// ── Bootstrap ──────────────────────────────────────────

function boot(): void {
  $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
  registerExploreCallback(handleExploreTerm);

  const initialCoords = parseCoordinatesFromUrl();
  initMap(
    handleViewChange,
    handleMapClick,
    initialCoords ? [initialCoords.lat, initialCoords.lon] : undefined,
    initialCoords?.zoom,
  );

  if (initialCoords) {
    void handleViewChange();
    void handleMapClick(initialCoords.lat, initialCoords.lon);
  } else {
    void handleViewChange();
    locateUser(true);
  }

  wireListeners();
  initSwipe();
}

// ── Map view change ────────────────────────────────────

// ── Places In-Memory Cache ─────────────────────────────
const placesCache = new Map<string, POI[]>();

async function handleViewChange(): Promise<void> {
  const zoom = getMapZoom();
  const center = getMapCenter();

  if (!center || zoom < MIN_ZOOM_FOR_POIS) {
    showEmpty('Zoom in more to see places');
    return;
  }

  const { activeCat } = store.get();
  const cacheKey = `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${activeCat}`;

  // Check cache first for instant response
  if (placesCache.has(cacheKey)) {
    const cached = placesCache.get(cacheKey)!;
    store.update({ pois: cached });
    setMarkers(cached, handleSelectPOI);
    renderCards(cached, handleSelectPOI);
    return;
  }

  showSkeletons();

  try {
    const pois = await fetchNearbyPlaces(center.lat, center.lng, activeCat);

    if (pois.length > 0) {
      placesCache.set(cacheKey, pois);
      store.update({ pois });
      setMarkers(pois, handleSelectPOI);
      renderCards(pois, handleSelectPOI);
      return;
    }

    // If Wikipedia returned 0 spots (e.g. over ocean or unmapped area) and near Paris, show Paris highlights
    const isNearParis = Math.abs(center.lat - 48.8566) < 0.35 && Math.abs(center.lng - 2.3522) < 0.35;
    if (isNearParis) {
      const fallback = activeCat === 'all'
        ? DEFAULT_PARIS_POIS
        : DEFAULT_PARIS_POIS.filter(p => !activeCat || activeCat === 'all' || !!p.tags[activeCat as keyof typeof p.tags]);
      store.update({ pois: fallback });
      setMarkers(fallback, handleSelectPOI);
      renderCards(fallback, handleSelectPOI);
      return;
    }

    showEmpty('Move map to a town, city, or landmark to explore');
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return; // cancelled — ignore
    console.error(err);

    const isNearParis = Math.abs(center.lat - 48.8566) < 0.35 && Math.abs(center.lng - 2.3522) < 0.35;
    if (isNearParis || store.get().pois.length === 0) {
      const fallback = activeCat === 'all'
        ? DEFAULT_PARIS_POIS
        : DEFAULT_PARIS_POIS.filter(p => !activeCat || activeCat === 'all' || !!p.tags[activeCat as keyof typeof p.tags]);
      store.update({ pois: fallback });
      setMarkers(fallback, handleSelectPOI);
      renderCards(fallback, handleSelectPOI);
      return;
    }

    showEmpty('Could not load places — try moving the map');
  }
}

// ── POI selection ──────────────────────────────────────

async function handleSelectPOI(i: number): Promise<void> {
  const { pois } = store.get();
  const poi = pois[i];
  if (!poi) return;

  clearClickedMarker();
  const name = poi.tags.name ?? poi.tags['name:en'] ?? 'This Place';
  const addr = poiAddress(poi.tags, poi._lat, poi._lon);
  const cat = poiCategory(poi.tags);
  const em = poiEmoji(poi.tags);

  const zoom = Math.max(getMapZoom(), FLY_TO_ZOOM);
  updateUrlCoordinates(poi._lat, poi._lon, zoom);

  store.update({ activeIdx: i, history: [] });
  highlightCard(i);
  highlightMarker(i);
  flyTo(poi._lat, poi._lon, zoom);

  openSheet(name, `${em} ${cat}`, addr);
  await handleFetchEnrichedPlace({
    name,
    addr,
    cat,
    em,
    lat: poi._lat,
    lon: poi._lon,
    wikidataId: poi.tags['wikidata'],
  });
}

// ── Map click (arbitrary location / object) ────────────

async function handleMapClick(lat: number, lon: number): Promise<void> {
  setClickedMarker(lat, lon);
  store.update({ activeIdx: -1, history: [] });
  highlightCard(-1);
  highlightMarker(-1);

  const zoom = Math.max(getMapZoom(), FLY_TO_ZOOM);
  updateUrlCoordinates(lat, lon, zoom);

  openSheet('Inspecting Object…', '🛰️ OpenStreetMap');
  await handleFetchEnrichedPlace({ lat, lon });
}

// ── Term exploration ───────────────────────────────────

async function handleExploreTerm(term: string): Promise<void> {
  try {
    const [result, wikidata] = await Promise.all([
      fetchWikiDescription(term).catch(() => null),
      fetchWikidataDetails({ name: term }).catch(() => null),
    ]);

    if (result) {
      renderDesc(result.description, result.terms, result.thumbnail);
    } else if (wikidata && (wikidata.description || wikidata.interestingFacts.length > 0)) {
      renderEnrichedPlace({
        name: term,
        subtitle: '🔍 Explored Concept',
        category: 'concept',
        emoji: '💡',
        lat: 0,
        lon: 0,
        wikidata,
        descriptionHtml: highlightTerms(wikidata.description || '', [term]),
        terms: [term],
      });
    } else {
      renderError(`Could not find details for "${term}"`);
    }
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return;
    renderError((err as Error).message ?? 'Exploration failed');
  }
}

// ── Enriched fetch (OpenStreetMap + Wikidata Query Service + Street Guide) ──

async function handleFetchEnrichedPlace(params: {
  name?: string | undefined;
  addr?: string | undefined;
  cat?: string | undefined;
  em?: string | undefined;
  lat: number;
  lon: number;
  wikidataId?: string | undefined;
}): Promise<void> {
  try {
    // 1. Fetch OpenStreetMap object at (lat, lon)
    const osm = await fetchOsmObjectAt(params.lat, params.lon).catch(() => null);

    const address = (osm ? formatOsmAddress(osm) : null) || params.addr || `${params.lat.toFixed(4)}, ${params.lon.toFixed(4)}`;
    const isBuilding = isBuildingFeature(osm, params.cat, osm?.tags);
    const isGeneric = !osm?.name || isGenericName(osm.name);
    const name = (!isGeneric && osm?.name) || params.name || (isBuilding ? address : 'Map Object');
    const category = osm?.category || params.cat || (isBuilding ? 'building' : 'place');
    const em = params.em || (osm ? inferOsmEmoji(osm.category, osm.type) : (isBuilding ? '🏢' : '📍'));

    // Extract street name if this is a building
    const streetName = isBuilding ? extractStreetName(osm, address) : null;

    // Update sheet header immediately with resolved address and title
    if (isGeneric && address) {
      $(IDS.SHEET_TITLE).textContent = address;
      $(IDS.SHEET_TITLE).setAttribute('title', address);
      const addrEl = $safe(IDS.SHEET_ADDRESS);
      if (addrEl) {
        addrEl.textContent = '';
        addrEl.setAttribute('hidden', '');
      }
    } else {
      $(IDS.SHEET_TITLE).textContent = name;
      $(IDS.SHEET_TITLE).setAttribute('title', address ? `${name} — ${address}` : name);
      const addrEl = $safe(IDS.SHEET_ADDRESS);
      if (addrEl && address && address !== name) {
        addrEl.textContent = `📍 ${address}`;
        addrEl.removeAttribute('hidden');
      }
    }
    $(IDS.SHEET_SUBTITLE).textContent = `${em} ${category} • OpenStreetMap`;

    // 2. Fetch Wikidata Query Service, Wikipedia narrative, Google Places, and Street Info in parallel
    const qid = osm?.wikidataId || params.wikidataId;
    const placesQuery = (!isGeneric && name !== 'Map Object') ? name : address;

    const [wikidata, wikiResult, googlePlacesResult, streetInfo] = await Promise.all([
      fetchWikidataDetails({
        qid,
        lat: params.lat,
        lon: params.lon,
        name,
      }).catch(err => {
        console.warn('Wikidata Query Service warning:', err);
        return null;
      }),
      fetchWikiDescription(name).catch(err => {
        console.warn('Wikipedia narrative warning:', err);
        return null;
      }),
      fetchGooglePlacesAtAddress(placesQuery, params.lat, params.lon).catch(err => {
        console.warn('Google Places warning:', err);
        return { primary: null, places: [] };
      }),
      (isBuilding && streetName)
        ? fetchStreetInfo(streetName, osm?.address?.city).catch(err => {
            console.warn('Street info warning:', err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    const googlePlace = googlePlacesResult?.primary ?? null;
    const placesAtAddress = resolvePlacesAtAddress({
      address,
      lat: params.lat,
      lon: params.lon,
      osm,
      googlePlaces: googlePlacesResult?.places,
      storePois: store.get().pois,
    });

    // Build interactive highlight terms
    const terms = wikiResult?.terms ?? [name];
    const rawDesc = wikiResult?.description || wikidata?.description || osm?.tags['description'] || '';
    const descriptionHtml = rawDesc ? highlightTerms(rawDesc, terms) : undefined;
    const thumbnail = wikiResult?.thumbnail;

    const info: EnrichedPlaceInfo = {
      name,
      subtitle: `${em} ${category}`,
      category,
      emoji: em,
      lat: params.lat,
      lon: params.lon,
      address,
      isBuilding,
      streetName: streetName ?? undefined,
      streetInfo,
      placesAtAddress,
      osm,
      wikidata,
      googlePlace,
      descriptionHtml,
      terms,
      thumbnail,
    };

    renderEnrichedPlace(info);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return;
    console.error(err);
    renderError((err as Error).message ?? 'Could not retrieve data from OpenStreetMap and Wikidata Query Service');
  }
}

// ── About Modal ─────────────────────────────────────────

function closeModal(): void {
  $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
}

// ── Fullscreen toggle ──────────────────────────────────

function toggleFullscreen(): void {
  const doc = document as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void>;
  };
  const docEl = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);

  if (!isFullscreen) {
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(() => showToast('Fullscreen not supported'));
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else {
      showToast('Fullscreen not supported on this device');
    }
  } else {
    if (doc.exitFullscreen) {
      void doc.exitFullscreen().catch(() => { });
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    }
  }
}

function updateFullscreenIcon(): void {
  const btn = $safe(IDS.FULLSCREEN_BTN);
  if (!btn) return;
  const doc = document as Document & { webkitFullscreenElement?: Element };
  const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  btn.textContent = isFullscreen ? '🗗' : '⛶';
  btn.setAttribute('aria-pressed', String(isFullscreen));
  btn.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
}

// ── Event wiring ───────────────────────────────────────

function wireListeners(): void {
  // About modal
  $safe(IDS.API_SAVE_BTN)?.addEventListener('click', closeModal);
  $safe(IDS.API_MODAL)?.addEventListener('click', (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  });
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });

  // Top bar & Zoom
  $safe(IDS.LOCATE_BTN)?.addEventListener('click', () => locateUser(false));
  $safe(IDS.FULLSCREEN_BTN)?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenIcon);
  document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

  $safe(IDS.ZOOM_IN_BTN)?.addEventListener('click', () => {
    store.get().map?.zoomIn();
  });
  $safe(IDS.ZOOM_OUT_BTN)?.addEventListener('click', () => {
    store.get().map?.zoomOut();
  });

  $safe(IDS.SETTINGS_BTN)?.addEventListener('click', () => {
    $safe(IDS.API_MODAL)?.removeAttribute('hidden');
  });

  // Sheet
  $safe(IDS.SHEET_CLOSE)?.addEventListener('click', closeSheet);
  $safe(IDS.SHEET_BACK)?.addEventListener('click', goBack);

  // Filters
  wireFilters(() => void handleViewChange());

  // URL hash change (e.g. browser back/forward or external link)
  window.addEventListener('hashchange', () => {
    const coords = parseCoordinatesFromUrl();
    if (coords) {
      const zoom = coords.zoom ?? Math.max(getMapZoom(), FLY_TO_ZOOM);
      flyTo(coords.lat, coords.lon, zoom);
      void handleMapClick(coords.lat, coords.lon);
    } else {
      closeSheet();
    }
  });
}

// ── Go ─────────────────────────────────────────────────
boot();
