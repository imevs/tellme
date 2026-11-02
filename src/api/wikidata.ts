import { WIKIDATA_SPARQL_ENDPOINT, WIKIDATA_API_ENDPOINT } from '../constants';
import { normalizeDiacritics, resolveEnglishCountryName } from './wiki';
import type { WikidataFactDetails } from '../types';

let wikidataController: AbortController | null = null;

// ── Pure Formatting Helpers ─────────────────────────────────

function formatOrdinalCentury(century: number): string {
  const mod100 = century % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${century}th century`;
  switch (century % 10) {
    case 1:
      return `${century}st century`;
    case 2:
      return `${century}nd century`;
    case 3:
      return `${century}rd century`;
    default:
      return `${century}th century`;
  }
}

export function formatConstructionDate(
  raw: string,
  precision?: number | string | null,
): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const precNum = precision != null ? Number(precision) : NaN;

  // Negative years (BCE) like "-0447-00-00T00:00:00Z"
  if (trimmed.startsWith('-')) {
    const yearMatch = trimmed.match(/^-0*(\d+)/);
    if (yearMatch?.[1]) {
      const yr = parseInt(yearMatch[1], 10);
      if (precNum === 7 && !Number.isNaN(yr)) {
        const century = Math.floor((yr - 1) / 100) + 1;
        return `${formatOrdinalCentury(century)} BCE`;
      }
      return `${yearMatch[1]} BCE`;
    }
  }

  // Positive ISO dates like "+1163-00-00..." or "1887-01-28T00:00:00Z"
  const clean = trimmed.replace(/^\+/, '');
  const isoMatch = clean.match(/^(\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?(?:T.*)?$/);
  if (isoMatch) {
    const year = isoMatch[1]!;
    const yearNum = parseInt(year, 10);
    const month = isoMatch[2];
    const day = isoMatch[3];

    // Wikidata precision 7 = century (stored as XX01-01-01T00:00:00Z, e.g. 1201-01-01 = 13th century)
    if (precNum === 7 && !Number.isNaN(yearNum)) {
      const century = Math.floor((yearNum - 1) / 100) + 1;
      return formatOrdinalCentury(century);
    }

    // Wikidata precision 8 = decade (e.g. 1780s)
    if (precNum === 8 && !Number.isNaN(yearNum)) {
      const decade = Math.floor(yearNum / 10) * 10;
      return `${decade}s`;
    }

    // If month & day are missing or 00 or 01-01 (often default in historical dates)
    if (!month || month === '00' || (month === '01' && (!day || day === '01' || day === '00'))) {
      return year;
    }

    const monthNum = parseInt(month, 10);
    const dayNum = day && day !== '00' ? parseInt(day, 10) : null;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthName = monthNames[monthNum - 1];

    if (monthName) {
      return dayNum ? `${monthName} ${dayNum}, ${year}` : `${monthName} ${year}`;
    }

    return year;
  }

  return trimmed;
}

export function formatHeight(raw: string): string {
  if (!raw) return '';
  const num = parseFloat(raw);
  if (!isNaN(num)) {
    return `${Math.round(num * 10) / 10} m`;
  }
  return raw;
}

export function isOrganizationEntity(
  details: Pick<WikidataFactDetails, 'instances' | 'description'>,
): boolean {
  const text = `${details.instances.join(' ')} ${details.description}`.toLowerCase();
  const isPhysical = /\b(building|church|cathedral|basilica|chapel|castle|palace|fortress|monument|memorial|statue|tower|bridge|arch|house|skyscraper|structure|edifice)\b/i.test(
    text,
  );
  if (isPhysical) return false;

  return /\b(station|radio|television|broadcaster|network|studio|company|corporation|business|enterprise|organization|organisation|institution|agency|choir|orchestra|ensemble|university|college|school|bank|shop|store|restaurant|cafe|bistro|bakery|pharmacy|publisher|ministry|parliament|association|club)\b/i.test(
    text,
  );
}

export function buildInterestingFacts(
  data: Omit<WikidataFactDetails, 'interestingFacts'>,
  options?: { isBuilding?: boolean | undefined },
): string[] {
  const facts: string[] = [];

  // 1. Date of building construction & official opening / establishment
  if (data.buildingConstructionDate) {
    facts.push(`The building was constructed in ${data.buildingConstructionDate}.`);
    if (data.inceptionDate && data.inceptionDate !== data.buildingConstructionDate) {
      facts.push(`Established in ${data.inceptionDate}.`);
    }
  } else if (data.inceptionDate && data.openingDate && data.inceptionDate !== data.openingDate) {
    facts.push(`Construction began around ${data.inceptionDate}, and it officially opened in ${data.openingDate}.`);
  } else if (data.inceptionDate) {
    if (options?.isBuilding && !isOrganizationEntity(data)) {
      facts.push(`The building was constructed in ${data.inceptionDate}.`);
    } else {
      facts.push(`Established / constructed in ${data.inceptionDate}.`);
    }
  } else if (data.openingDate) {
    facts.push(`Officially opened to the public in ${data.openingDate}.`);
  }

  // 2. Height
  if (data.height) {
    facts.push(`Reaches a structural height of ${data.height}.`);
  }

  // 3. Architect / Designer
  if (data.architects.length > 0) {
    facts.push(`Designed by acclaimed architect(s) ${data.architects.join(', ')}.`);
  }

  // 4. Architectural style
  if (data.styles.length > 0) {
    facts.push(`Showcases ${data.styles.join(', ')} architecture.`);
  }

  // 5. Named after
  if (data.namedAfter.length > 0) {
    facts.push(`Named in honor of ${data.namedAfter.join(', ')}.`);
  }

  // 6. Materials
  if (data.materials.length > 0) {
    facts.push(`Constructed using ${data.materials.join(', ')}.`);
  }

  // 7. Heritage status
  if (data.heritage.length > 0) {
    facts.push(`Designated as a ${data.heritage.join(', ')}.`);
  }

  // 8. Instances / Class
  if (data.instances.length > 0) {
    facts.push(`Categorized as a notable ${data.instances.join(', ')}.`);
  }

  // 9. If still few facts and description is available
  if (facts.length < 2 && data.description) {
    facts.push(data.description.charAt(0).toUpperCase() + data.description.slice(1) + '.');
  }

  return facts;
}

// Curated corrections for state monument items where Wikidata's automated import
// recorded the city of Riga's founding year (1201) instead of the building's construction date.
const MONUMENT_METADATA_OVERRIDES: Record<
  string,
  {
    inceptionDate?: string;
    architects?: string[];
  }
> = {
  // Grēcinieku iela 28 (Latvian cultural monument No. 6541 — built 1780, rebuilt 1896 by Karl Johann Felsko)
  Q56052108: {
    inceptionDate: '1780 (rebuilt 1896)',
    architects: ['Karl Johann Felsko'],
  },
};

interface SparqlBinding {
  item?: { value: string };
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  distance?: { value: string };
  inception?: { value: string };
  inceptionPrecision?: { value: string };
  openingDate?: { value: string };
  height?: { value: string };
  architectLabel?: { value: string };
  styleLabel?: { value: string };
  namedAfterLabel?: { value: string };
  heritageLabel?: { value: string };
  instanceOfLabel?: { value: string };
  materialLabel?: { value: string };
  image?: { value: string };
  wikipediaArticle?: { value: string };
}

export function parseWikidataSparqlResponse(
  raw: unknown,
  options?: {
    isBuilding?: boolean | undefined;
    preferPhysicalBuilding?: boolean | undefined;
    maxDistanceKm?: number | undefined;
  },
): WikidataFactDetails | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const root = raw as Record<string, unknown>;

  const results = root['results'] as { bindings?: SparqlBinding[] } | undefined;
  const bindings = results?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) return null;

  // Group bindings by item URI
  const itemMap = new Map<string, SparqlBinding[]>();
  for (const b of bindings) {
    const itemUri = b.item?.value;
    if (!itemUri) continue;
    if (!itemMap.has(itemUri)) itemMap.set(itemUri, []);
    itemMap.get(itemUri)!.push(b);
  }

  // Filter out macro-territorial entities (countries, historical dominions, administrative regions, cities)
  // and if isBuilding is true, filter out streets/roads/thoroughfares
  const nonPhysicalPattern = options?.isBuilding
    ? /\b(dominion|empire|country|state|administrative|territorial|territory|diocese|province|archbishopric|region|city|municipality|capital|metropolis|human settlement|street|road|thoroughfare|avenue|highway|boulevard)\b/i
    : /\b(dominion|empire|country|state|administrative|territorial|territory|diocese|province|archbishopric|region|city|municipality|capital|metropolis|human settlement)\b/i;

  const orgOnlyPattern =
    /\b(radio station|television station|broadcaster|network|company|corporation|business|enterprise|organization|organisation|institution|agency|choir|orchestra|ensemble|association|club|recurring event|festival)\b/i;
  const physicalStructurePattern =
    /\b(building|house|palace|castle|church|cathedral|basilica|chapel|monument|memorial|statue|tower|bridge|arch|skyscraper|structure|edifice|hall)\b/i;

  let targetBindings: SparqlBinding[] | undefined;

  for (const [, itemBindings] of itemMap) {
    if (options?.maxDistanceKm !== undefined) {
      const distStr = itemBindings[0]?.distance?.value;
      const distVal = distStr !== undefined ? parseFloat(distStr) : NaN;
      if (!Number.isNaN(distVal) && distVal > options.maxDistanceKm) {
        continue;
      }
    }

    const isDisqualified = itemBindings.some(b => {
      const inst = b.instanceOfLabel?.value || '';
      return nonPhysicalPattern.test(inst);
    });
    if (isDisqualified) continue;

    if (options?.preferPhysicalBuilding) {
      const hasPhysicalInstance = itemBindings.some(b => {
        const inst = `${b.instanceOfLabel?.value || ''} ${b.heritageLabel?.value || ''} ${b.itemDescription?.value || ''}`;
        return physicalStructurePattern.test(inst);
      });
      const isNonPhysicalOrg = itemBindings.some(b => {
        const inst = `${b.instanceOfLabel?.value || ''} ${b.itemDescription?.value || ''}`;
        return orgOnlyPattern.test(inst);
      });
      if (isNonPhysicalOrg && !hasPhysicalInstance) {
        continue;
      }
    }

    targetBindings = itemBindings;
    break;
  }

  if (!targetBindings || targetBindings.length === 0) {
    return null;
  }

  const first = targetBindings[0]!;
  const qidUrl = first.item?.value ?? '';
  const qidMatch = qidUrl.match(/Q\d+$/);
  const qid = qidMatch ? qidMatch[0] : (qidUrl || 'Wikidata');

  const label = first.itemLabel?.value ?? '';
  const description = first.itemDescription?.value ?? '';

  const inceptionsList: string[] = [];
  let rawOpening: string | null = null;
  let rawHeight: string | null = null;
  let rawImageUrl: string | null = null;
  let wikipediaArticleUrl: string | null = null;

  const architectsSet = new Set<string>();
  const stylesSet     = new Set<string>();
  const namedAfterSet = new Set<string>();
  const heritageSet   = new Set<string>();
  const instancesSet  = new Set<string>();
  const materialsSet  = new Set<string>();

  for (const b of targetBindings) {
    if (b.inception?.value) {
      const formattedInc = formatConstructionDate(
        b.inception.value,
        b.inceptionPrecision?.value,
      );
      // Ignore bogus "1201" (founding year of Riga) placeholder attached by bot imports to Riga buildings
      const isBogusCityFoundingYear =
        formattedInc === '1201' &&
        (options?.isBuilding ||
          targetBindings.some(tb => /\bbuilding\b/i.test(tb.instanceOfLabel?.value || '')));

      if (formattedInc && !isBogusCityFoundingYear && !inceptionsList.includes(formattedInc)) {
        inceptionsList.push(formattedInc);
      }
    }
    if (!rawOpening && b.openingDate?.value) rawOpening = b.openingDate.value;
    if (!rawHeight && b.height?.value) rawHeight = b.height.value;
    if (!rawImageUrl && b.image?.value) rawImageUrl = b.image.value;
    if (!wikipediaArticleUrl && b.wikipediaArticle?.value) wikipediaArticleUrl = b.wikipediaArticle.value;

    const arch = b.architectLabel?.value;
    if (arch && !arch.startsWith('Q')) architectsSet.add(arch);

    const style = b.styleLabel?.value;
    if (style && !style.startsWith('Q')) stylesSet.add(style);

    const named = b.namedAfterLabel?.value;
    if (named && !named.startsWith('Q')) namedAfterSet.add(named);

    const her = b.heritageLabel?.value;
    if (her && !her.startsWith('Q')) heritageSet.add(her);

    const inst = b.instanceOfLabel?.value;
    if (inst && !inst.startsWith('Q')) instancesSet.add(inst);

    const mat = b.materialLabel?.value;
    if (mat && !mat.startsWith('Q')) materialsSet.add(mat);
  }

  const monumentOverride = MONUMENT_METADATA_OVERRIDES[qid];
  if (monumentOverride?.architects) {
    for (const arch of monumentOverride.architects) {
      architectsSet.add(arch);
    }
  }

  const inceptionDate =
    monumentOverride?.inceptionDate ??
    (inceptionsList.length > 0 ? inceptionsList.slice(0, 2).join(' / ') : null);
  const openingDate   = rawOpening ? formatConstructionDate(rawOpening) : null;
  const height        = rawHeight ? formatHeight(rawHeight) : null;

  let wikipediaTitle: string | null = null;
  if (wikipediaArticleUrl) {
    try {
      const decoded = decodeURIComponent(wikipediaArticleUrl.split('/wiki/')[1] ?? '');
      wikipediaTitle = decoded.replace(/_/g, ' ') || null;
    } catch {
      // ignore uri error
    }
  }

  let imageUrl: string | null = null;
  if (rawImageUrl) {
    const httpsImg = rawImageUrl.replace(/^http:\/\//i, 'https://');
    imageUrl = httpsImg.includes('Special:FilePath/') && !httpsImg.includes('?')
      ? `${httpsImg}?width=800`
      : httpsImg;
  }

  const partialDetails = {
    qid,
    label: label.startsWith('Q') && label.length > 1 ? '' : label,
    description,
    inceptionDate,
    openingDate,
    height,
    architects: Array.from(architectsSet),
    styles: Array.from(stylesSet),
    namedAfter: Array.from(namedAfterSet),
    heritage: Array.from(heritageSet),
    instances: Array.from(instancesSet),
    materials: Array.from(materialsSet),
    imageUrl,
    wikipediaTitle,
    wikipediaUrl: wikipediaArticleUrl ?? undefined,
  };

  const interestingFacts = buildInterestingFacts(partialDetails, {
    isBuilding: options?.isBuilding,
  });

  return {
    ...partialDetails,
    interestingFacts,
  };
}

export function mergeBuildingDetailsIntoEntity(
  primary: WikidataFactDetails,
  building: WikidataFactDetails,
): WikidataFactDetails {
  const buildingConstructionDate =
    primary.buildingConstructionDate ??
    (building.inceptionDate && building.inceptionDate !== primary.inceptionDate
      ? building.inceptionDate
      : building.inceptionDate ?? undefined);

  const mergedBase: Omit<WikidataFactDetails, 'interestingFacts'> = {
    ...primary,
    buildingConstructionDate,
    height: primary.height ?? building.height,
    architects: primary.architects.length > 0 ? primary.architects : building.architects,
    styles: primary.styles.length > 0 ? primary.styles : building.styles,
    heritage: Array.from(new Set([...primary.heritage, ...building.heritage])),
    materials: primary.materials.length > 0 ? primary.materials : building.materials,
    imageUrl: primary.imageUrl ?? building.imageUrl,
  };

  return {
    ...mergedBase,
    interestingFacts: buildInterestingFacts(mergedBase, { isBuilding: true }),
  };
}

// ── Search entity by name ──────────────────────────────────

export interface WikidataSearchContext {
  localName?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  countryCode?: string | undefined;
}

interface WikidataSearchItem {
  id?: string;
  label?: string;
  description?: string;
}

async function fetchWikidataSearchItems(
  query: string,
  signal?: AbortSignal,
): Promise<WikidataSearchItem[]> {
  try {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: query,
      language: 'en',
      format: 'json',
      origin: '*',
      limit: '5',
    });
    const url = `${WIKIDATA_API_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, signal ? { signal } : {});
    if (!res.ok) return [];
    const data = (await res.json()) as { search?: WikidataSearchItem[] };
    return data.search ?? [];
  } catch {
    return [];
  }
}

export async function searchWikidataEntity(
  name: string,
  signal?: AbortSignal,
  context?: WikidataSearchContext,
): Promise<string | null> {
  const items = await fetchWikidataSearchItems(name, signal);

  if (!context || (!context.city && !context.country && !context.countryCode && !context.localName)) {
    const firstId = items[0]?.id;
    return firstId && /^Q\d+$/.test(firstId) ? firstId : null;
  }

  const engCountry = resolveEnglishCountryName(context.country, context.countryCode);
  const locationTokens: string[] = [];
  if (context.city) locationTokens.push(normalizeDiacritics(context.city));
  if (engCountry) {
    const normCountry = normalizeDiacritics(engCountry);
    locationTokens.push(normCountry);
    if (normCountry.endsWith('ia') || normCountry.endsWith('ya')) {
      locationTokens.push(normCountry.slice(0, -1));
    }
  }
  if (context.country) locationTokens.push(normalizeDiacritics(context.country));
  const validTokens = Array.from(new Set(locationTokens.filter(t => t.length >= 3)));

  const matchesLocation = (item: WikidataSearchItem): boolean => {
    const text = normalizeDiacritics(`${item.label || ''} ${item.description || ''}`);
    return validTokens.some(tok => text.includes(tok));
  };

  // 1. Check if any item in primary search matches the local city/country
  const locationMatched = items.find(it => it.id && /^Q\d+$/.test(it.id) && matchesLocation(it));
  if (locationMatched?.id) return locationMatched.id;

  // 2. Try localName (e.g. "Aizsardzības ministrija") or location-qualified search ("Ministry of Defence Latvia")
  const fallbackQueries: string[] = [];
  if (context.localName && context.localName.toLowerCase() !== name.toLowerCase()) {
    fallbackQueries.push(context.localName);
  }
  if (engCountry) {
    fallbackQueries.push(`${name} ${engCountry}`);
  } else if (context.city) {
    fallbackQueries.push(`${name} ${context.city}`);
  }

  for (const q of fallbackQueries) {
    const subItems = await fetchWikidataSearchItems(q, signal);
    const matched = subItems.find(it => it.id && /^Q\d+$/.test(it.id) && matchesLocation(it)) ??
      (validTokens.length === 0 ? subItems[0] : undefined);
    if (matched?.id && /^Q\d+$/.test(matched.id)) {
      return matched.id;
    }
  }

  // 3. Only fall back to first item if we had no location constraints and it is not a generic concept class
  if (validTokens.length === 0) {
    const first = items[0];
    if (first?.id && /^Q\d+$/.test(first.id)) {
      const isGenericClass = /^(ministry of a government|type of|class of|generic|government ministry responsible for)\b/i.test(
        (first.description || '').trim(),
      );
      if (!isGenericClass) return first.id;
    }
  }

  return null;
}

// ── Fetch Details via SPARQL ───────────────────────────────

async function fetchSpatialWikidataJson(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<unknown | null> {
  const sparqlAround = `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?distance ?inception ?inceptionPrecision ?openingDate ?height ?architectLabel ?styleLabel ?namedAfterLabel ?heritageLabel ?instanceOfLabel ?materialLabel ?image ?wikipediaArticle WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "0.12" .
    bd:serviceParam wikibase:distance ?distance .
  }
  OPTIONAL {
    ?item p:P571/psv:P571 [
      wikibase:timeValue ?inception ;
      wikibase:timePrecision ?inceptionPrecision
    ] .
  }
  OPTIONAL { ?item wdt:P1619 ?openingDate . }
  OPTIONAL { ?item wdt:P2048 ?height . }
  OPTIONAL { ?item wdt:P84 ?architect . }
  OPTIONAL { ?item wdt:P149 ?style . }
  OPTIONAL { ?item wdt:P138 ?namedAfter . }
  OPTIONAL { ?item wdt:P1435 ?heritage . }
  OPTIONAL { ?item wdt:P31 ?instanceOf . }
  OPTIONAL { ?item wdt:P186 ?material . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL {
    ?wikipediaArticle schema:about ?item ;
                      schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr". }
} ORDER BY ?distance LIMIT 20`;

  try {
    const url = `${WIKIDATA_SPARQL_ENDPOINT}?query=${encodeURIComponent(sparqlAround)}`;
    const res = await fetch(url, {
      signal,
      headers: { 'Accept': 'application/sparql-results+json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return null;
  }
}

export async function fetchWikidataDetails(options: {
  qid?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
  name?: string | undefined;
  localName?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  countryCode?: string | undefined;
  isBuilding?: boolean | undefined;
}): Promise<WikidataFactDetails | null> {
  wikidataController?.abort();
  wikidataController = new AbortController();
  const signal = wikidataController.signal;

  let qid = options.qid;

  // Sanitize QID if passed (e.g. "Q243" or "wd:Q243")
  if (qid) {
    const match = qid.match(/Q\d+/);
    qid = match ? match[0] : undefined;
  }

  // 1. If we have a QID, query Wikidata SPARQL directly for that item
  if (qid) {
    const sparql = `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?inception ?inceptionPrecision ?openingDate ?height ?architectLabel ?styleLabel ?namedAfterLabel ?heritageLabel ?instanceOfLabel ?materialLabel ?image ?wikipediaArticle WHERE {
  VALUES ?item { wd:${qid} }
  OPTIONAL {
    ?item p:P571/psv:P571 [
      wikibase:timeValue ?inception ;
      wikibase:timePrecision ?inceptionPrecision
    ] .
  }
  OPTIONAL { ?item wdt:P1619 ?openingDate . }
  OPTIONAL { ?item wdt:P2048 ?height . }
  OPTIONAL { ?item wdt:P84 ?architect . }
  OPTIONAL { ?item wdt:P149 ?style . }
  OPTIONAL { ?item wdt:P138 ?namedAfter . }
  OPTIONAL { ?item wdt:P1435 ?heritage . }
  OPTIONAL { ?item wdt:P31 ?instanceOf . }
  OPTIONAL { ?item wdt:P186 ?material . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL {
    ?wikipediaArticle schema:about ?item ;
                      schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,es,de". }
} LIMIT 25`;

    try {
      const url = `${WIKIDATA_SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}`;
      const res = await fetch(url, {
        signal,
        headers: { 'Accept': 'application/sparql-results+json' },
      });
      if (res.ok) {
        const json: unknown = await res.json();
        const details = parseWikidataSparqlResponse(json, { isBuilding: options.isBuilding });
        if (details) {
          // If inspecting a building whose QID points to a housed organization (e.g. operator:wikidata),
          // also resolve the physical building at these coordinates so its construction date is preserved.
          if (
            options.isBuilding &&
            options.lat != null &&
            options.lon != null &&
            (isOrganizationEntity(details) || !details.inceptionDate)
          ) {
            const spatialJson = await fetchSpatialWikidataJson(options.lat, options.lon, signal);
            if (spatialJson) {
              const buildingDetails = parseWikidataSparqlResponse(spatialJson, {
                isBuilding: true,
                preferPhysicalBuilding: true,
                maxDistanceKm: 0.045,
              });
              if (buildingDetails && buildingDetails.qid !== details.qid) {
                return mergeBuildingDetailsIntoEntity(details, buildingDetails);
              }
            }
          }
          return details;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
    }
  }

  // 2. If no QID or QID query empty, use spatial search around coordinates if available
  let spatialBuildingCandidate: WikidataFactDetails | null = null;
  if (options.lat != null && options.lon != null) {
    const json = await fetchSpatialWikidataJson(options.lat, options.lon, signal);
    if (json) {
      const hasSpecificName = Boolean(
        options.name && options.name.length >= 3 && options.name !== 'Map Object',
      );
      const maxDist = hasSpecificName ? 0.045 : undefined;

      const preferredBuilding = options.isBuilding
        ? parseWikidataSparqlResponse(json, {
            isBuilding: true,
            preferPhysicalBuilding: true,
            maxDistanceKm: maxDist,
          })
        : null;
      const details =
        preferredBuilding ??
        parseWikidataSparqlResponse(json, {
          isBuilding: options.isBuilding,
          maxDistanceKm: maxDist,
        });

      if (details && (details.inceptionDate || details.height || details.architects.length > 0 || details.label)) {
        if (!hasSpecificName) {
          return details;
        }
        const normLabel = normalizeDiacritics(details.label || '');
        const normName = normalizeDiacritics(options.name || '');
        const normLocal = options.localName ? normalizeDiacritics(options.localName) : '';
        const nameMatchesSpatial =
          Boolean(normLabel && normName && (normLabel.includes(normName) || normName.includes(normLabel))) ||
          Boolean(normLabel && normLocal && (normLabel.includes(normLocal) || normLocal.includes(normLabel)));

        if (nameMatchesSpatial) {
          return details;
        }
        spatialBuildingCandidate = preferredBuilding ?? details;
      }
    }
  }

  // 3. Fallback: search entity by name if name provided
  if (options.name && options.name.length >= 3 && options.name !== 'Map Object') {
    const foundQid = await searchWikidataEntity(options.name, signal, {
      localName: options.localName,
      city: options.city,
      country: options.country,
      countryCode: options.countryCode,
    });
    if (foundQid) {
      const namedDetails = await fetchWikidataDetails({
        qid: foundQid,
        lat: options.lat,
        lon: options.lon,
        isBuilding: options.isBuilding,
      });
      if (namedDetails) {
        if (
          spatialBuildingCandidate &&
          spatialBuildingCandidate.qid !== namedDetails.qid &&
          (isOrganizationEntity(namedDetails) || !namedDetails.inceptionDate)
        ) {
          return mergeBuildingDetailsIntoEntity(namedDetails, spatialBuildingCandidate);
        }
        return namedDetails;
      }
    }
  }

  return spatialBuildingCandidate;
}
