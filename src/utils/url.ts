/**
 * Coordinate URL synchronization utilities for TellMe.
 * Supports parsing and updating coordinates in the URL (hash or query).
 */

export interface UrlCoordinates {
  lat: number;
  lon: number;
  zoom?: number | undefined;
}

function isValidLat(lat: number): boolean {
  return !Number.isNaN(lat) && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLon(lon: number): boolean {
  return !Number.isNaN(lon) && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function formatCoord(n: number): string {
  return Number(n.toFixed(5)).toString();
}

/**
 * Formats coordinates and optional zoom into a clean URL hash string:
 * e.g. "#48.8566,2.3522,16" or "#48.8584,2.2945"
 */
export function formatCoordinatesHash(lat: number, lon: number, zoom?: number): string {
  const latStr = formatCoord(lat);
  const lonStr = formatCoord(lon);
  if (zoom != null && !Number.isNaN(zoom)) {
    const z = Math.round(Math.max(1, Math.min(22, zoom)));
    return `#${latStr},${lonStr},${z}`;
  }
  return `#${latStr},${lonStr}`;
}

/**
 * Parses coordinates from a given URL string, Location object, or window.location by default.
 * Accepts formats:
 *   - #lat,lon,zoom (e.g. #48.8566,2.3522,16)
 *   - #lat,lon      (e.g. #48.8584,2.2945)
 *   - #lat/lon/zoom (e.g. #48.8566/2.3522/16)
 *   - #@lat,lon,zoomz (e.g. #@48.8566,2.3522,16z)
 *   - ?lat=...&lon=...&z=...
 */
export function parseCoordinatesFromUrl(urlOrLocation?: string | Location): UrlCoordinates | null {
  let hash = '';
  let search = '';

  if (typeof urlOrLocation === 'string') {
    try {
      const u = new URL(urlOrLocation, 'http://localhost');
      hash = u.hash;
      search = u.search;
    } catch {
      const hashIdx = urlOrLocation.indexOf('#');
      if (hashIdx !== -1) {
        hash = urlOrLocation.slice(hashIdx);
      }
      const qIdx = urlOrLocation.indexOf('?');
      if (qIdx !== -1) {
        search = urlOrLocation.slice(qIdx, hashIdx !== -1 ? hashIdx : undefined);
      }
    }
  } else if (urlOrLocation) {
    hash = urlOrLocation.hash;
    search = urlOrLocation.search;
  } else if (typeof window !== 'undefined') {
    hash = window.location.hash;
    search = window.location.search;
  }

  // 1. Try parsing hash
  if (hash) {
    const cleanHash = hash.replace(/^[#@\s]+/, '').trim();

    // Key-value in hash: e.g. #lat=48.85&lon=2.35
    if (cleanHash.includes('lat=') && cleanHash.includes('lon=')) {
      const p = new URLSearchParams(cleanHash);
      const lat = parseFloat(p.get('lat') || '');
      const lon = parseFloat(p.get('lon') || '');
      const zRaw = p.get('z') || p.get('zoom');
      const zoom = zRaw ? parseInt(zRaw, 10) : undefined;
      if (isValidLat(lat) && isValidLon(lon)) {
        return { lat, lon, zoom: zoom && !Number.isNaN(zoom) ? zoom : undefined };
      }
    }

    // Delimited coordinates: comma, slash, or semicolon
    const parts = cleanHash.split(/[,/;]/).map(s => s.trim().replace(/z$/, ''));
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0] || '');
      const lon = parseFloat(parts[1] || '');
      const zoom = parts[2] ? parseInt(parts[2], 10) : undefined;

      if (isValidLat(lat) && isValidLon(lon)) {
        return {
          lat,
          lon,
          zoom: zoom && !Number.isNaN(zoom) ? Math.max(1, Math.min(22, zoom)) : undefined,
        };
      }
    }
  }

  // 2. Try parsing query search parameters: ?lat=...&lon=...
  if (search) {
    const p = new URLSearchParams(search);
    const latRaw = p.get('lat');
    const lonRaw = p.get('lon') || p.get('lng');
    const zRaw = p.get('z') || p.get('zoom');

    if (latRaw && lonRaw) {
      const lat = parseFloat(latRaw);
      const lon = parseFloat(lonRaw);
      const zoom = zRaw ? parseInt(zRaw, 10) : undefined;
      if (isValidLat(lat) && isValidLon(lon)) {
        return {
          lat,
          lon,
          zoom: zoom && !Number.isNaN(zoom) ? Math.max(1, Math.min(22, zoom)) : undefined,
        };
      }
    }
  }

  return null;
}

/**
 * Updates the current browser URL to include the selected place coordinates.
 * Uses history.replaceState to avoid polluting browser session history while keeping URL in sync.
 */
export function updateUrlCoordinates(lat: number, lon: number, zoom?: number): void {
  if (typeof window === 'undefined' || !window.history || !window.location) return;
  if (!isValidLat(lat) || !isValidLon(lon)) return;

  const hash = formatCoordinatesHash(lat, lon, zoom);
  if (window.location.hash !== hash) {
    try {
      const newUrl = `${window.location.pathname}${window.location.search}${hash}`;
      window.history.replaceState(null, '', newUrl);
    } catch {
      window.location.hash = hash;
    }
  }
}

/**
 * Clears coordinates from the URL hash when no place is selected or sheet is closed.
 */
export function clearUrlCoordinates(): void {
  if (typeof window === 'undefined' || !window.history || !window.location) return;
  if (window.location.hash) {
    try {
      const newUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', newUrl);
    } catch {
      window.location.hash = '';
    }
  }
}
