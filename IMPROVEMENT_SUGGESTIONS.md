# App Improvement Suggestions

Additional improvements beyond [UX_IMPROVEMENTS.md](./UX_IMPROVEMENTS.md), based on a review of [SPECIFICATION.md](./SPECIFICATION.md), [README.md](./README.md), and the current source code.

Check (`[x]`) the improvements below that you consider most important to implement.

> Still open from `UX_IMPROVEMENTS.md`: GeoSearch non-physical filtering, distance badges on POI cards, `flyTo` wiping the carousel, and the 2-stage bottom sheet.

---

## 1. 🔴 Critical — Security, Compliance & Correctness

- [ ] **Remove the exposed Google Places API key from client code:** `GOOGLE_PLACES_API_KEY` is hardcoded in `src/constants.ts` and shipped in the public GitHub Pages bundle. The `localStorage` daily quota is per-browser and does not protect the key. At minimum, restrict the key in Google Cloud Console (HTTP referrer = Pages domain, API = Places only, server-side quota). Ideally, move calls behind a tiny serverless proxy (Cloudflare Worker / Netlify Function) that holds the key. **Rotate the current key**, since it is already in git history.
- [ ] **Resolve WDQS SPARQL vs. approved data sources:** `AGENTS.md` approves only the Wikidata API (`www.wikidata.org/w/api.php`), but the app relies on `query.wikidata.org/sparql`. Either explicitly add WDQS to the approved list, or migrate spatial/property lookups to `wbgetentities` + Wikipedia GeoSearch. WDQS has similar timeout and stability concerns to Overpass.
- [ ] **Comply with Nominatim & Wikimedia usage policies:** Nominatim requires an identifying Referer/User-Agent and a maximum of 1 request/second. Wikimedia requests an `Api-User-Agent` header. Add these headers and a per-host request queue/throttle.
- [ ] **Verify end-to-end request cancellation:** `AbortController` is used only inside `src/api/*`, not in `src/main.ts`. Confirm that a new tap actually aborts the previous enrichment pipeline (not just per-request timeouts), as promised by the specification.

---

## 2. 🟠 Data Quality & Coverage

- [ ] **Local-language Wikipedia fallback:** All lookups are hardcoded to `en.wikipedia.org`. Many Riga (and other non-English) buildings only have `lv` / `de` / `fr` articles. Fall back to the local-language wiki via the resolved `countryCode` and label the source (e.g. "🇱🇻 Latvian Wikipedia").
- [ ] **UI language selection:** Detect `navigator.language` for both UI strings and the preferred Wikipedia language, with English fallback.
- [ ] **Unified persistent cache:** Wikipedia, Wikidata, and Nominatim responses are cached in-memory only (or not at all). Add a shared IndexedDB cache with TTLs so repeat visits and Back navigation are instant and API load is reduced.
- [ ] **"Report wrong info" / "Improve this data" link:** Link to the OSM or Wikidata edit page from the sheet instead of growing `MONUMENT_METADATA_OVERRIDES` by hand.

---

## 3. 🟡 Features

- [ ] **Offline / installable PWA:** No web app manifest or service worker exists yet. Cache the app shell and recently viewed places for travelers on roaming or poor connections.
- [ ] **Saved places & recent history:** Add a ⭐ favorite button and a "Recently explored" list persisted locally. Currently, explorations are lost once the sheet is closed.
- [ ] **Stable deep links to a specific object:** `#lat,lon,zoom` re-runs the lookup and can resolve to a different object. Add identifiers such as `&osm=way/123` or `&q=Q12345` so shared links open exactly the same place.
- [ ] **"Surprise me" / auto walking tour:** Chain the nearest 5–8 POIs into a suggested walking route — fits the zero-typing concept.
- [ ] **Read-aloud narration:** Add a 🔊 button using the `speechSynthesis` API to read the narrative aloud for hands-free use while walking.
- [ ] **Photo gallery:** Pull additional images from the Wikimedia Commons category (`P373`) instead of showing a single hero image.
- [ ] **Low-zoom discovery:** Below zoom 13 the map is empty. Show city-level highlights or clusters instead of only "Zoom in more to see places".

---

## 4. 🟢 Accessibility & Polish

- [ ] **Light theme & reduced motion:** Respect `prefers-color-scheme` and `prefers-reduced-motion`. Pulsing pins and `backdrop-filter` blur are heavy on low-end phones.
- [ ] **Screen-reader support for the sheet:** Give `#desc-sheet` `role="dialog"` and `aria-modal`, trap focus while open, and restore focus on close. Announce loading states via an `aria-live` region. Make `Escape` close the sheet (currently it only closes the About modal).
- [ ] **Progressive skeleton loading:** Replace the single "Inspecting Object…" spinner with section skeletons that fill in as each source resolves (OSM → Wikidata → Wikipedia), instead of waiting for all of them.
- [ ] **Dark map tiles:** Use a dark tile style (e.g. CARTO Dark Matter) to match the glassmorphic UI, and review the OSM tile usage policy before heavy traffic.

---

## 5. 🔧 Code & Docs Hygiene

- [ ] **Rename `src/api/overpass.ts`:** It only contains Haversine and emoji/category helpers. Rename to e.g. `src/utils/geo.ts` to avoid implying a forbidden Overpass dependency.
- [ ] **Split large modules:** `src/api/wikidata.ts` (~750 lines), `src/ui/sheet.ts` (~740 lines), and `style.css` (~1,430 lines). For example, extract per-section sheet renderers.
- [ ] **Fix documentation drift:** README states 121 tests while SPECIFICATION states 137. README's project tree lists `dom.test.ts` under `tests/ui/` (actually `tests/utils/`) and omits `src/utils/url.ts`. Generate the test count in CI, or drop it from the docs.
- [ ] **Add linting & E2E tests:** Add ESLint + Prettier, and Playwright smoke tests for map-tap and deep-link flows.
- [ ] **Lightweight error telemetry:** Track which data source fails for real users (even a simple failure counter) to guide reliability work.

---

## Recommended Order

1. Section 1 (all items) — security and policy compliance.
2. Local-language Wikipedia fallback, PWA/offline support, and stable object deep links — highest user value per effort.

