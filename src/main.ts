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
import { fetchPOIs, parsePOIs, poiEmoji, poiCategory, poiAddress } from './api/overpass';
import { fetchDescription, buildPlacePrompt, buildTermPrompt } from './api/gemini';
import {
  IDS, CSS,
  STORAGE_KEY_API,
  MIN_ZOOM_FOR_POIS,
  FLY_TO_ZOOM,
} from './constants';
import type { DescRequest } from './types';

// ── Bootstrap ──────────────────────────────────────────

function boot(): void {
  $safe(IDS.API_MODAL)?.setAttribute('hidden', '');
  registerExploreCallback(handleExploreTerm);
  initMap(handleViewChange);
  locateUser(true);
  wireListeners();
  initSwipe();
}

// ── Map view change ────────────────────────────────────

async function handleViewChange(): Promise<void> {
  const bbox   = getMapBBox();
  const zoom   = getMapZoom();
  const center = getMapCenter();

  if (!bbox || !center || zoom < MIN_ZOOM_FOR_POIS) {
    showEmpty('Zoom in more to see places');
    return;
  }

  showSkeletons();

  try {
    const elements = await fetchPOIs(bbox, store.get().activeCat);
    const pois     = parsePOIs(elements, center);

    store.update({ pois });
    setMarkers(pois, handleSelectPOI);
    renderCards(pois, handleSelectPOI);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return; // cancelled — ignore
    console.error(err);
    showEmpty((err as Error).message ?? 'Could not load places — try moving the map');
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

// ── Gemini description fetch ───────────────────────────

async function handleFetchDesc(req: DescRequest): Promise<void> {
  const { apiKey } = store.get();

  if (!apiKey) {
    store.update({ pendingFetch: req });
    $safe(IDS.API_MODAL)?.removeAttribute('hidden');
    return;
  }

  try {
    const prompt = req.type === 'place'
      ? buildPlacePrompt(req)
      : buildTermPrompt(req);

    const result = await fetchDescription(apiKey, prompt);
    renderDesc(result.description, result.terms);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return;
    console.error(err);
    renderError((err as Error).message ?? 'Unexpected error');
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
  }
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

  // Top bar
  $safe(IDS.LOCATE_BTN)?.addEventListener('click', () => locateUser(false));
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
