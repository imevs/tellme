import 'leaflet/dist/leaflet.css';
import '../style.css';

import { store } from './store';
import { showToast } from './ui/toast';
import { $, $safe } from './ui/dom';
import { wireFilters } from './ui/filters';
import { showSkeletons, showEmpty, renderCards, highlightCard } from './ui/cards';
import {
  openSheet, closeSheet, goBack, renderDesc, renderError,
  initSwipe, registerExploreCallback,
} from './ui/sheet';
import { initMap, setMarkers, highlightMarker, flyTo, locateUser, getMapBBox, getMapZoom, getMapCenter } from './map/leaflet';
import { poiEmoji, poiCategory, poiAddress } from './api/overpass';
import { fetchNearbyPlaces } from './api/places';
import { fetchWikiDescription } from './api/wiki';
import { DEFAULT_PARIS_POIS } from './api/gemini';
import {
  IDS, CSS,
  STORAGE_KEY_API,
  MIN_ZOOM_FOR_POIS,
  FLY_TO_ZOOM,
} from './constants';
import type { DescRequest, POI } from './types';

// ── Bootstrap ──────────────────────────────────────────

function boot(): void {
  $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
  registerExploreCallback(handleExploreTerm);
  initMap(handleViewChange);
  void handleViewChange();
  locateUser(true);
  wireListeners();
  initSwipe();
}

// ── Map view change ────────────────────────────────────

// ── Places In-Memory Cache ─────────────────────────────
const placesCache = new Map<string, POI[]>();

async function handleViewChange(): Promise<void> {
  const zoom   = getMapZoom();
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

  const name = poi.tags.name ?? poi.tags['name:en'] ?? 'This Place';
  const addr = poiAddress(poi.tags, poi._lat, poi._lon);
  const cat  = poiCategory(poi.tags);
  const em   = poiEmoji(poi.tags);

  store.update({ activeIdx: i, history: [] });
  highlightCard(i);
  highlightMarker(i);
  flyTo(poi._lat, poi._lon, Math.max(getMapZoom(), FLY_TO_ZOOM));

  openSheet(name, `${em} ${cat}`);
  await handleFetchDesc({ type: 'place', name, addr, cat });
}

// ── Term exploration ───────────────────────────────────

async function handleExploreTerm(term: string): Promise<void> {
  await handleFetchDesc({ type: 'term', term });
}

// ── Place & Term description fetch (Wikipedia) ─────────

async function handleFetchDesc(req: DescRequest): Promise<void> {
  const query = req.type === 'place' ? req.name : req.term;

  try {
    const result = await fetchWikiDescription(query);
    renderDesc(result.description, result.terms, result.thumbnail);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return;
    console.error(err);

    // Fallback if specific search failed: use active place tags description
    if (req.type === 'place') {
      const activePoi = store.get().pois[store.get().activeIdx];
      if (activePoi?.tags.description) {
        renderDesc(activePoi.tags.description, [activePoi.tags.name ?? 'Explore']);
        return;
      }
    }

    renderError((err as Error).message ?? 'Could not find details on Wikipedia');
  }
}

// ── API key save ───────────────────────────────────────

function saveKey(): void {
  const input = $safe<HTMLInputElement>(IDS.API_KEY_INPUT);
  const k = input?.value.trim() ?? '';

  if (!k) { showToast('Please enter your Gemini API key'); return; }

  store.update({ apiKey: k });
  localStorage.setItem(STORAGE_KEY_API, k);
  $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
  showToast('API key saved ✓');

  const { pendingFetch } = store.get();
  if (pendingFetch) {
    store.update({ pendingFetch: null });
    void handleFetchDesc(pendingFetch);
  } else {
    void handleViewChange();
  }
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
      void doc.exitFullscreen().catch(() => {});
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
  // API modal
  $safe(IDS.API_SAVE_BTN)?.addEventListener('click', saveKey);
  $safe(IDS.API_KEY_INPUT)?.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') saveKey();
  });
  $safe(IDS.API_MODAL)?.addEventListener('click', (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
    }
  });
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
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
    const input = $safe<HTMLInputElement>(IDS.API_KEY_INPUT);
    if (input) input.value = store.get().apiKey;
    $safe(IDS.API_MODAL)?.removeAttribute('hidden');
  });

  // Sheet
  $safe(IDS.SHEET_CLOSE)?.addEventListener('click', closeSheet);
  $safe(IDS.SHEET_BACK)?.addEventListener('click', goBack);

  // Filters
  wireFilters(() => void handleViewChange());
}

// ── Go ─────────────────────────────────────────────────
boot();
