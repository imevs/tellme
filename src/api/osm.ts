import { NOMINATIM_ENDPOINT, NOMINATIM_SEARCH_ENDPOINT, PHOTON_REVERSE_ENDPOINT } from '../constants';
import type { OsmFeature, AddressPlaceOrganization } from '../types';

let osmController: AbortController | null = null;

// ── Pure parsers (easy to test without mocking network) ────

export function parseNominatimResponse(
  raw: unknown,
  fallbackLat: number,
  fallbackLon: number,
): OsmFeature | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  if (data['error']) return null;

  const osmId = Number(data['osm_id']) || 0;
  const rawOsmType = String(data['osm_type'] || 'node').toLowerCase();
  const osmType: 'node' | 'way' | 'relation' =
    rawOsmType === 'way' ? 'way' : rawOsmType === 'relation' ? 'relation' : 'node';

  const extratags = (typeof data['extratags'] === 'object' && data['extratags'] !== null)
    ? (data['extratags'] as Record<string, string>)
    : {};

  const namedetails = (typeof data['namedetails'] === 'object' && data['namedetails'] !== null)
    ? (data['namedetails'] as Record<string, string>)
    : {};

  const addrObj = (typeof data['address'] === 'object' && data['address'] !== null)
    ? (data['address'] as Record<string, string>)
    : {};

  // Best name resolution: English name -> local name -> namedetails -> address POI -> road -> display_name
  const name =
    namedetails['name:en'] ??
    namedetails['name'] ??
    (typeof data['name'] === 'string' && data['name'].trim() ? data['name'].trim() : null) ??
    addrObj['tourism'] ??
    addrObj['historic'] ??
    addrObj['amenity'] ??
    addrObj['leisure'] ??
    addrObj['building'] ??
    (addrObj['house_number'] || data['type'] === 'house' || data['category'] === 'building' ? null : addrObj['road']) ??
    (typeof data['display_name'] === 'string' && !addrObj['house_number'] ? data['display_name'].split(',')[0]?.trim() : '') ??
    'Map Object';

  const rawLocalName =
    namedetails['name'] ??
    (typeof data['name'] === 'string' && data['name'].trim() ? data['name'].trim() : undefined);
  const localName = rawLocalName && rawLocalName !== name ? rawLocalName : undefined;

  const category = String(data['category'] || (extratags['building'] ? 'building' : 'place'));
  const type     = String(data['type'] || 'feature');
  const displayName = typeof data['display_name'] === 'string' ? data['display_name'] : '';

  const lat = typeof data['lat'] === 'string' ? parseFloat(data['lat']) : fallbackLat;
  const lon = typeof data['lon'] === 'string' ? parseFloat(data['lon']) : fallbackLon;

  const wikidataId =
    extratags['wikidata'] ??
    extratags['subject:wikidata'] ??
    extratags['operator:wikidata'] ??
    extratags['brand:wikidata'] ??
    extratags['architect:wikidata'] ??
    undefined;

  const wikipedia =
    extratags['wikipedia'] ??
    extratags['wikipedia:en'] ??
    extratags['operator:wikipedia'] ??
    extratags['brand:wikipedia'] ??
    undefined;

  const startDate =
    extratags['start_date'] ??
    extratags['year_of_construction'] ??
    extratags['construction_date'] ??
    extratags['opening_date'] ??
    undefined;

  return {
    osmId,
    osmType,
    name,
    localName,
    category,
    type,
    displayName,
    address: {
      road:        addrObj['road'],
      houseNumber: addrObj['house_number'] ?? addrObj['housenumber'],
      suburb:      addrObj['suburb'] ?? addrObj['neighbourhood'] ?? addrObj['quarter'],
      city:        addrObj['city'] ?? addrObj['town'] ?? addrObj['village'],
      country:     addrObj['country'],
      countryCode: addrObj['country_code']?.toLowerCase(),
      postcode:    addrObj['postcode'],
    },
    tags: extratags,
    wikidataId,
    wikipedia,
    startDate,
    lat,
    lon,
  };
}

export function parsePhotonResponse(
  raw: unknown,
  fallbackLat: number,
  fallbackLon: number,
): OsmFeature | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const features = Array.isArray(data['features']) ? (data['features'] as Array<Record<string, unknown>>) : [];
  if (features.length === 0) return null;

  const first = features[0];
  if (!first || typeof first !== 'object') return null;

  const props = (typeof first['properties'] === 'object' && first['properties'] !== null)
    ? (first['properties'] as Record<string, unknown>)
    : {};

  const geom = (typeof first['geometry'] === 'object' && first['geometry'] !== null)
    ? (first['geometry'] as { coordinates?: [number, number] })
    : {};

  const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [fallbackLon, fallbackLat];
  const lon = Number(coords[0]) || fallbackLon;
  const lat = Number(coords[1]) || fallbackLat;

  const osmId = Number(props['osm_id']) || 0;
  const rawType = String(props['osm_type'] || 'N').toUpperCase();
  const osmType: 'node' | 'way' | 'relation' =
    rawType === 'W' ? 'way' : rawType === 'R' ? 'relation' : 'node';

  const name = String(props['name'] || props['street'] || 'Map Object');
  const category = String(props['osm_key'] || 'place');
  const type     = String(props['osm_value'] || 'feature');

  const road = props['street'] ? String(props['street']) : undefined;
  const houseNumber = props['housenumber'] ? String(props['housenumber']) : undefined;
  const city = (props['city'] ?? props['locality'] ?? props['district']) ? String(props['city'] ?? props['locality'] ?? props['district']) : undefined;
  const country = props['country'] ? String(props['country']) : undefined;
  const postcode = props['postcode'] ? String(props['postcode']) : undefined;

  const parts = [name, road, city, country].filter(Boolean);
  const displayName = parts.join(', ');

  return {
    osmId,
    osmType,
    name,
    category,
    type,
    displayName,
    address: {
      road,
      houseNumber,
      city,
      country,
      postcode,
    },
    tags: {},
    lat,
    lon,
  };
}

export function formatOsmAddress(feature: OsmFeature): string {
  const parts: string[] = [];
  const { address } = feature;
  if (address.road) {
    parts.push(address.houseNumber ? `${address.houseNumber} ${address.road}` : address.road);
  }
  if (address.suburb) parts.push(address.suburb);
  if (address.city) parts.push(address.city);
  if (address.country) parts.push(address.country);

  if (parts.length > 0) return parts.join(', ');
  if (feature.displayName) return feature.displayName;
  return `${feature.lat.toFixed(4)}, ${feature.lon.toFixed(4)}`;
}

export function inferOsmEmoji(category: string, type: string): string {
  const text = `${category} ${type}`.toLowerCase();

  if (text.includes('church') || text.includes('cathedral') || text.includes('basilica') || text.includes('chapel')) return '⛪';
  if (text.includes('castle') || text.includes('palace') || text.includes('fortress')) return '🏰';
  if (text.includes('monument') || text.includes('memorial') || text.includes('statue')) return '🗿';
  if (text.includes('museum') || text.includes('gallery')) return '🏛️';
  if (text.includes('viewpoint') || text.includes('tower')) return '🔭';
  if (text.includes('attraction')) return '⭐';
  if (text.includes('park') || text.includes('garden') || text.includes('forest')) return '🌿';
  if (text.includes('restaurant') || text.includes('food') || text.includes('bistro')) return '🍽️';
  if (text.includes('cafe') || text.includes('café') || text.includes('bakery')) return '☕';
  if (text.includes('bar') || text.includes('pub')) return '🍺';
  if (text.includes('shop') || text.includes('mall') || text.includes('supermarket')) return '🛍️';
  if (text.includes('building') || text.includes('architecture')) return '🏢';
  if (text.includes('bridge')) return '🌉';
  return '📍';
}

// ── Address Inventory & Canonical Entity Resolution ────────
const addressInventoryCache = new Map<string, { primary?: OsmFeature | undefined; orgs: AddressPlaceOrganization[] }>();

export async function fetchAddressInventory(
  road: string,
  houseNumber: string,
  city?: string | undefined,
  signal?: AbortSignal | undefined,
): Promise<{ primary?: OsmFeature | undefined; orgs: AddressPlaceOrganization[] }> {
  const normRoad = road.trim().toLowerCase();
  const normHouse = houseNumber.trim().toLowerCase();
  const normCity = (city || '').trim().toLowerCase();
  const cacheKey = `${normRoad}_${normHouse}_${normCity}`;

  if (addressInventoryCache.has(cacheKey)) {
    return addressInventoryCache.get(cacheKey)!;
  }

  try {
    const streetQuery = `${houseNumber.trim()} ${road.trim()}`;
    const params = new URLSearchParams({
      street: streetQuery,
      format: 'jsonv2',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1',
      limit: '25',
    });
    if (city && city.trim()) {
      params.set('city', city.trim());
    }

    const url = `${NOMINATIM_SEARCH_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, signal ? { signal } : {});
    if (!res.ok) {
      return { primary: undefined, orgs: [] };
    }

    const items = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(items) || items.length === 0) {
      return { primary: undefined, orgs: [] };
    }

    // 1. Identify primary building / complex
    const parsedItems = items.map(it => parseNominatimResponse(it, 0, 0)).filter((it): it is OsmFeature => it !== null);

    let primary: OsmFeature | undefined = parsedItems.find(it =>
      it.osmType === 'way' && Boolean(it.name) &&
      (it.type === 'mall' || it.type === 'department_store' || it.category === 'shop' || it.category === 'building')
    );

    if (!primary) {
      primary = parsedItems.find(it =>
        it.osmType === 'way' && (it.category === 'building' || it.type === 'building' || it.type === 'mall')
      );
    }

    if (!primary) {
      primary = parsedItems.find(it =>
        it.category === 'place' && (it.type === 'house' || it.type === 'building')
      );
    }

    // 2. Extract organizations located at this address
    const orgs: AddressPlaceOrganization[] = [];
    const seenOrgNames = new Set<string>();

    for (const item of parsedItems) {
      if (primary && item.osmType === primary.osmType && item.osmId === primary.osmId) continue;
      if (!item.name || !item.name.trim()) continue;

      const normName = item.name.trim().toLowerCase();
      if (normName === `${normHouse} ${normRoad}` || normName === `${normRoad} ${normHouse}`) continue;
      if (seenOrgNames.has(normName)) continue;

      const isOrgCategory = /^(shop|amenity|office|craft)$/i.test(item.category) ||
        /^(supermarket|mall|pharmacy|atm|bank|restaurant|cafe|bakery|butcher|clothes|parcel_locker|clinic|dentist|doctors|lawyer|copyshop|optician|hairdresser|beauty|kiosk)$/i.test(item.type) ||
        Boolean(item.tags['operator']);

      if (isOrgCategory) {
        seenOrgNames.add(normName);
        orgs.push({
          name: item.name,
          category: item.type ? item.type.replace(/_/g, ' ') : item.category,
          formattedAddress: formatOsmAddress(item),
          source: 'osm',
        });
      }
    }

    const result = { primary, orgs };
    addressInventoryCache.set(cacheKey, result);
    return result;
  } catch {
    return { primary: undefined, orgs: [] };
  }
}

/**
 * Decides whether to promote the canonical building `primary` feature over the
 * initially clicked `parsed` feature, ensuring named landmarks and Wikidata-linked
 * monuments are never overwritten by generic building ways.
 */
export function mergeWithAddressPrimary(
  parsed: OsmFeature,
  primary?: OsmFeature | undefined,
): OsmFeature {
  if (!primary) return parsed;

  const isParsedLandmark =
    parsed.category === 'historic' ||
    parsed.category === 'tourism' ||
    Boolean(parsed.wikidataId) ||
    Boolean(parsed.wikipedia);

  const isPrimaryGeneric =
    !primary.name ||
    primary.name === 'Map Object' ||
    /^(building|house|yes|residential|apartments|commercial|retail|office)$/i.test(primary.name.trim()) ||
    /^\d+[a-z]?$/i.test(primary.name.trim());

  // Never overwrite a named landmark or Wikidata-linked feature with an unnamed/generic building way
  if (isParsedLandmark && isPrimaryGeneric && !primary.wikidataId) {
    return {
      ...parsed,
      startDate: parsed.startDate ?? primary.startDate,
    };
  }

  // If parsed already has a specific name and primary is generic, keep parsed's name & metadata
  const isParsedGeneric =
    !parsed.name ||
    parsed.name === 'Map Object' ||
    /^(building|house|yes|residential|apartments|commercial|retail|office)$/i.test(parsed.name.trim());

  if (!isParsedGeneric && isPrimaryGeneric) {
    return {
      ...parsed,
      localName: parsed.localName ?? primary.localName,
      wikidataId: parsed.wikidataId ?? primary.wikidataId,
      wikipedia: parsed.wikipedia ?? primary.wikipedia,
      startDate: parsed.startDate ?? primary.startDate,
    };
  }

  if (parsed.osmType === 'node' || isParsedGeneric || parsed.name !== primary.name) {
    return {
      ...primary,
      localName: primary.localName ?? parsed.localName,
      wikidataId: primary.wikidataId ?? parsed.wikidataId,
      wikipedia: primary.wikipedia ?? parsed.wikipedia,
      startDate: primary.startDate ?? parsed.startDate,
      lat: parsed.lat,
      lon: parsed.lon,
    };
  }

  return parsed;
}


export async function fetchOsmObjectAt(
  lat: number,
  lon: number,
): Promise<OsmFeature | null> {
  osmController?.abort();
  osmController = new AbortController();
  const signal = osmController.signal;

  // 1. Try Nominatim reverse geocode with extratags
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      extratags: '1',
      namedetails: '1',
      addressdetails: '1',
      zoom: '18',
      email: 'tellme-app@explore.local',
    });
    const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;

    const res = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data: unknown = await res.json();
      const parsed = parseNominatimResponse(data, lat, lon);
      if (parsed) {
        // If feature belongs to an address with road & house number, query address inventory
        // to canonicalize the building object and list all organizations at this address
        if (parsed.address.road && parsed.address.houseNumber) {
          const inv = await fetchAddressInventory(
            parsed.address.road,
            parsed.address.houseNumber,
            parsed.address.city,
            signal,
          ).catch(() => ({ primary: undefined, orgs: [] }));

          const finalFeature = mergeWithAddressPrimary(parsed, inv.primary);

          const allOrgs = [...inv.orgs];
          if (parsed.name && parsed.name !== finalFeature.name) {
            const isSubOrg = /^(shop|amenity|office|craft)$/i.test(parsed.category) ||
              /^(supermarket|pharmacy|atm|bank|restaurant|cafe|bakery|butcher|clothes|parcel_locker)$/i.test(parsed.type);
            if (isSubOrg && !allOrgs.some(o => o.name.toLowerCase() === parsed.name.toLowerCase())) {
              allOrgs.unshift({
                name: parsed.name,
                category: parsed.type ? parsed.type.replace(/_/g, ' ') : parsed.category,
                formattedAddress: formatOsmAddress(parsed),
                source: 'osm',
              });
            }
          }

          finalFeature.addressOrganizations = allOrgs;
          return finalFeature;
        }

        return parsed;
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // Fall through to Komoot Photon
  }

  // 2. Fallback to Photon reverse geocode (OpenStreetMap mirror)
  try {
    const photonUrl = `${PHOTON_REVERSE_ENDPOINT}?lat=${lat}&lon=${lon}`;
    const res = await fetch(photonUrl, { signal });
    if (res.ok) {
      const data: unknown = await res.json();
      const parsed = parsePhotonResponse(data, lat, lon);
      if (parsed) return parsed;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }

  return null;
}
