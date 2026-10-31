import L from 'leaflet';
import { store } from '../store';
import { debounce } from '../ui/dom';
import { showToast } from '../ui/toast';
import { IDS, CSS, MAP_TILES, DEFAULT_CENTER, DEFAULT_ZOOM, DEBOUNCE_MAP_MS } from '../constants';
import { poiEmoji } from '../api/overpass';
import type { POI } from '../types';

export function initMap(onViewChange: () => void): void {
  const map = L.map(IDS.MAP, {
    center:           DEFAULT_CENTER,
    zoom:             DEFAULT_ZOOM,
    zoomControl:      true,
    attributionControl: true,
  });

  L.tileLayer(MAP_TILES.URL, {
    attribution: MAP_TILES.ATTRIBUTION,
    subdomains:  MAP_TILES.SUBDOMAINS,
    maxZoom:     MAP_TILES.MAX_ZOOM,
  }).addTo(map);

  map.zoomControl.setPosition('topright');

  // Single shared debounced handler — avoids double-fetch on zoom
  const debouncedLoad = debounce(onViewChange, DEBOUNCE_MAP_MS);
  map.on('moveend', debouncedLoad);
  map.on('zoomend', debouncedLoad);

  store.update({ map });
}

export function setMarkers(pois: POI[], onSelect: (i: number) => void): void {
  const { map, markers } = store.get();
  if (!map) return;

  // Remove previous markers
  for (const m of markers) m.remove();

  const newMarkers = pois.map((poi, i) => {
    const em   = poiEmoji(poi.tags);
    const html =
      `<div class="${CSS.CM_WRAP}" data-i="${i}">` +
      `<div class="cm-pin"><div class="cm-icon">${em}</div></div>` +
      `</div>`;

    const icon = L.divIcon({ html, className: '', iconSize: [40, 40], iconAnchor: [18, 36] });
    return L.marker([poi._lat, poi._lon], { icon })
      .addTo(map)
      .on('click', () => onSelect(i));
  });

  store.update({ markers: newMarkers });
}

export function highlightMarker(idx: number): void {
  document.querySelectorAll(`.${CSS.CM_WRAP}`).forEach(w =>
    w.classList.toggle(CSS.ACTIVE, Number((w as HTMLElement).dataset['i']) === idx),
  );
}

export function flyTo(lat: number, lon: number, zoom: number): void {
  store.get().map?.flyTo([lat, lon], zoom, { duration: 0.9 });
}

export function addUserDot(lat: number, lng: number): void {
  const { map, userMarker } = store.get();
  if (!map) return;

  userMarker?.remove();

  const icon = L.divIcon({
    html:      '<div class="user-dot-wrap"><div class="user-dot"></div></div>',
    className: '',
    iconSize:  [20, 20],
    iconAnchor:[10, 10],
  });

  const marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
  store.update({ userMarker: marker });
}

export function getMapBBox(): string | null {
  const { map } = store.get();
  if (!map) return null;
  const b = map.getBounds();
  return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
}

export function getMapZoom(): number {
  return store.get().map?.getZoom() ?? 0;
}

export function getMapCenter(): L.LatLng | null {
  return store.get().map?.getCenter() ?? null;
}

export function showLocatingStrip(visible: boolean): void {
  const el = document.getElementById(IDS.LOCATING_STRIP);
  if (!el) return;
  if (visible) el.classList.remove(CSS.HIDDEN);
  else el.classList.add(CSS.HIDDEN);
}

export function locateUser(silent = false): void {
  const { map } = store.get();
  if (!map) return;

  showLocatingStrip(true);

  if (!navigator.geolocation) {
    showLocatingStrip(false);
    if (!silent) showToast('Geolocation not supported');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords: { latitude: lat, longitude: lng } }) => {
      showLocatingStrip(false);
      map.setView([lat, lng], DEFAULT_ZOOM, { animate: true });
      addUserDot(lat, lng);
    },
    () => {
      showLocatingStrip(false);
      if (!silent) showToast('Could not get location — showing Paris');
    },
    { timeout: 8_000, enableHighAccuracy: true },
  );
}
