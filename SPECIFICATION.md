# TellMe — Functional & Technical Specification

## 1. Executive Summary

**TellMe** is a mobile-first, zero-typing web application designed for spontaneous travel discovery and geographic exploration. Instead of traditional search bars and keyword queries, TellMe allows users to explore any destination worldwide by interacting directly with a dynamic map, tapping on physical buildings, landmarks, or streets, or browsing nearby points of interest (POIs) surfaced via Wikipedia GeoSearch.

When an object or location is selected, TellMe synthesizes an enriched dossier combining building metadata, architectural metrics, historical chronologies, editorial summaries, live opening statuses, business directories, and street context through real-time integration with OpenStreetMap, Wikidata, Wikipedia, and Google Places.

---

## 2. System Architecture

TellMe follows a unidirectional data flow and observable store architecture written in strict TypeScript. The client-side orchestration is structured to maximize separation of concerns, testability, and resilience.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             TellMe Application                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────────────────┐                 ┌──────────────────────────┐   │
│   │ Leaflet Map Controller │ ◄─────────────► │    URL State Manager     │   │
│   │  (Markers, Pin, View)  │                 │ (#lat,lon,zoom hash sync)│   │
│   └───────────┬────────────┘                 └─────────────┬────────────┘   │
│               │                                            │                │
│               ▼                                            ▼                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Main Orchestration Layer                       │   │
│   │               (Event dispatch, concurrent pipelines)                │   │
│   └───────────┬────────────────────────────────────────────┬────────────┘   │
│               │                                            │                │
│               ▼                                            ▼                │
│   ┌────────────────────────┐                 ┌──────────────────────────┐   │
│   │ Typed Observable Store │                 │    UI Rendering Layer    │   │
│   │  (AppState, Sub/Pub)   │                 │ (Cards, Sheet, Filters)  │   │
│   └────────────────────────┘                 └─────────────▲────────────┘   │
│                                                            │                │
│                                                            │                │
│   ┌────────────────────────────────────────────────────────┴────────────┐   │
│   │                     Parallel API Data Services                      │   │
│   │  ┌───────────────────────┐             ┌─────────────────────────┐  │   │
│   │  │ OSM Nominatim/Photon  │             │   Wikidata SPARQL/API   │  │   │
│   │  │ (Reverse Geocoding)   │             │  (Historical/Arch Data) │  │   │
│   │  └───────────────────────┘             └─────────────────────────┘  │   │
│   │  ┌───────────────────────┐             ┌─────────────────────────┐  │   │
│   │  │ Wikipedia API         │             │ Google Places API (New) │  │   │
│   │  │ (GeoSearch & Narrative│             │ (Summary, Open/Closed)  │  │   │
│   │  └───────────────────────┘             └─────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Core Architectural Principles

1. **Zero Overpass API Dependency:** The project strictly avoids the Overpass API interpreter due to server instability and rate limiting. All POIs and spatial objects are derived through reliable APIs (Wikipedia GeoSearch, Nominatim, and Komoot Photon).
2. **Observable State Store:** Global mutable variables are strictly prohibited. State transitions are dispatched through `store.update(partialState)` in `src/store.ts`. UI subscribers receive notifications when relevant state keys update.
3. **Pure Functional Transformations:** Parsers, sanitizers, formatting functions, coordinate synchronizers, and distance calculators are pure functions decoupled from the DOM and network layers, validated by automated Vitest tests.
4. **Lifecycle & Abort Management:** All remote network requests utilize active `AbortController` instances. Rapid map panning, zooming, or marker tapping immediately cancels preceding in-flight HTTP requests, avoiding race conditions and stale renders.
5. **Multi-Tier Caching & API Quota Protection:**
   - Map viewport POIs are cached in an in-memory map keyed by coordinate buckets and active categories.
   - Street narrative lookups are cached in-memory.
   - Google Places API responses are persisted in a 24-hour TTL `localStorage` cache alongside an in-memory cache, guarded by a daily quota limiter (`GOOGLE_PLACES_MAX_DAILY_CALLS = 40`).

---

## 3. Detailed Functional Specifications

### 3.1 Initial Launch, Bootstrap & Geolocation

- **Default Viewport:** When launched without URL coordinates or when geolocation is denied, the application centers on **Paris, France** (`48.8566, 2.3522`) at zoom level `15`.
- **Automatic Geolocation:**
  - Upon boot, `navigator.geolocation.getCurrentPosition` is invoked silently (`locateUser(true)`).
  - While attempting geolocation, a glassmorphic `#locating-strip` displays an active spinner and message (*"Finding your location…"*) in the upper screen area.
  - On successful location retrieval, the map smoothly pans to the user's coordinates with zoom level `15`, places a pulsating blue dot marker (`.user-dot`), and queries nearby places for the viewport.
  - If geolocation fails or times out (8,000 ms), the strip hides silently without blocking the user.
- **Manual Geolocation:**
  - Tapping the `📍` button in the top action bar triggers `locateUser(false)`.
  - If geolocation is disabled or fails, a toast notification surfaces: *"Geolocation not supported"* or *"Could not get location — showing Paris"*.

### 3.2 URL Coordinate Synchronization & Deep-Linking

The application maintains real-time synchronization between map position and URL hash fragments to enable bookmarking, browser back/forward history, and deep linking.

- **Hash Format:** `#<latitude>,<longitude>,<zoom>` (e.g., `#48.85837,2.29448,16`).
- **Supported Parse Formats:**
  - `#lat,lon,zoom` (e.g., `#48.8566,2.3522,16`)
  - `#lat,lon` (e.g., `#48.8584,2.2945`)
  - `#lat/lon/zoom` (e.g., `#48.8566/2.3522/16`)
  - `#@lat,lon,zoomz` (e.g., `#@48.8566,2.3522,16z`)
  - `?lat=...&lon=...&z=...` query parameters
- **Deep-Link Launch:** If a valid coordinate pair is present in the URL on startup:
  1. The map initializes directly at those coordinates and zoom level.
  2. The nearby places discovery is triggered for that center.
  3. The inspected object inspection flow (`handleMapClick`) triggers automatically to present the location details.
- **History Traversal:** Listening to `window.hashchange`:
  - When the user navigates back/forward to a hash with coordinates, the map flies to the coordinates and inspects the object.
  - If the hash is cleared (e.g., `#`), the open description bottom sheet closes automatically.

### 3.3 Map Viewport & Discovery Engine

- **Tile Provider:** OpenStreetMap standard tile layer (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) rendered via Leaflet.
- **Zoom Constraints:**
  - Zoom range: `1` to `19`.
  - Minimum zoom for POI discovery: `13` (`MIN_ZOOM_FOR_POIS`).
- **Debounced View Change (`handleViewChange`):**
  - Map interactions (`moveend` and `zoomend`) trigger a single debounced handler (`DEBOUNCE_MAP_MS = 900ms`) to prevent rapid burst queries while panning.
  - If zoom < 13: POI markers and cards are cleared, and the bottom deck displays an empty state banner: *"Zoom in more to see places"*.
- **Nearby Places Query (`fetchNearbyPlaces`):**
  - At zoom >= 13, the center coordinates and active filter are checked against `placesCache`.
  - Cache miss triggers a Wikipedia GeoSearch API call (`list=geosearch&gsradius=10000&gslimit=24`).
  - Wikipedia results are converted into POIs with calculated Haversine distances (`haversineKm`) relative to the viewport center and sorted in ascending order of distance.
  - If Wikipedia returns 0 results in the vicinity of Paris (within 0.35° lat/lon), the app falls back to a curated set of Parisian landmarks (`DEFAULT_PARIS_POIS`).
  - Outside Paris with 0 results, the bottom deck displays: *"Move map to a town, city, or landmark to explore"*.
- **Marker Display (`setMarkers`):**
  - POIs are rendered as custom Leaflet `DivIcon` markers with category-specific emojis and drop-pin styling (`.cm-pin`).
  - Tapping any POI marker activates that place, scrolls the corresponding card into view, and opens the details sheet.

### 3.4 Category Filtering

The category filter bar (`#filter-bar`) offers horizontal scrollable pill buttons:
- 🌍 **All** (`all`)
- 🏛️ **Sights** (`tourism`)
- 🏰 **Historic** (`historic`)
- ☕ **Food** (`amenity`)
- 🌿 **Parks** (`leisure`)
- 🛍️ **Shops** (`shop`)

- Selecting a filter sets `activeCat` in the store, persists active styling (`.active`, `aria-pressed="true"`), and immediately re-queries the viewport.
- Client-side category matching parses both explicit OSM tag keys and semantic keywords in Wikipedia page titles/extracts (e.g., cathedral/abbey → historic, museum/gallery → tourism, café/bistro → amenity).

### 3.5 Arbitrary Map Object Click & Pin Drop

Tapping any arbitrary point, building polygon, or feature on the map triggers `handleMapClick(lat, lon)`:
1. **Pulsating Target Pin:** Clears any previous clicked marker and renders an animated target pin (`.clicked-pin-pulse` with `🎯` icon) at the exact tapped coordinates.
2. **URL Update:** URL hash updates to the clicked coordinates with zoom level preserved or adjusted to `FLY_TO_ZOOM = 16`.
3. **Card Deck State:** Unselects any active POI card and marker.
4. **Immediate Sheet Feedback:** Opens `#desc-sheet` immediately showing *"Inspecting Object…"* and a loading spinner.
5. **Parallel Enrichment Execution:** Dispatches concurrent data fetching pipelines to resolve the location.

---

## 4. Multi-Source Data Enrichment Pipeline

When a POI card is selected or an arbitrary map location is clicked, `handleFetchEnrichedPlace` initiates four concurrent pipelines:

```text
                                  Location (lat, lon)
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          1. OSM Nominatim Reverse                      [Wikidata QID / Name]
             (Fallback: Photon)                                   │
                    │                                             │
      ┌─────────────┼──────────────┐                              │
      ▼             ▼              ▼                              ▼
 [Address & Tags] [Building?]  [Street Name]            2. Wikidata Query Service
      │             │              │                       (WDQS SPARQL)
      │             │              │                    - Date of Construction
      │             │              │                    - Architectural Style
      │             │              │                    - Architect & Builder
      │             │              │                    - Height & Dimensions
      │             │              │                    - Heritage Status
      │             │              │                    - Named After
      │             │              │                    - Interesting Facts
      │             │              │                              │
      ▼             ▼              ▼                              ▼
3. Google Places API (New)   4. Street Guide API         5. Wikipedia API
   - Editorial Summary          - History of Street         - Narrative Extract
   - Open Now / Closed          - Origin of Name            - Thumbnail Image
   - Website URL                - Construction Date         - Interactive Keywords
   - Places at Address          - Length & Dimensions
                    │                      │                      │
                    └──────────────────────┼──────────────────────┘
                                           ▼
                               Synthesized Sheet Render
```

### 4.1 Step 1: OpenStreetMap Reverse Geocoding (`fetchOsmObjectAt`)
- **Primary Endpoint:** Nominatim Reverse API (`nominatim.openstreetmap.org/reverse?format=jsonv2&extratags=1&namedetails=1&addressdetails=1`).
- **High-Availability Fallback:** If Nominatim returns non-200, times out, or encounters network errors, the request automatically falls back to **Komoot Photon** (`photon.komoot.io/reverse`).
- **Extracted Metadata:**
  - `osmId`, `osmType` (`node`, `way`, `relation`).
  - Resolved Name: Evaluates English name (`namedetails.name:en`), local name, namedetails, POI address tags, or formatted street address.
  - Detailed Address: Road, house number, suburb/neighborhood, city/town, country, postcode.
  - Entity Identifiers: Linked `wikidataId` (e.g., `Q90`) and `wikipedia` article titles.
  - Historical Dates: OSM `start_date`, `year_of_construction`, or `opening_date`.
  - Emoji Classification: Inferred from OSM tags (`tourism`, `amenity`, `historic`, `leisure`, `shop`, `office`, `craft`, `highway`).

### 4.2 Step 2: Wikidata Query Service Integration (`fetchWikidataDetails`)
- **Primary Engine:** Direct SPARQL queries executed against Wikidata Query Service (`query.wikidata.org/sparql`).
- **Entity Resolution Strategies:**
  1. *Direct QID:* If the OSM feature provides a `wikidata` tag (e.g. `Q90`).
  2. *Spatial Coordinate Query (`wikibase:around`):* Queries physical entities (`?place wdt:P625 ?loc`) within a tight radius (20–40 meters) of the tapped point, filtering out abstract conceptual items, events, or non-spatial records.
  3. *Wikidata Entity Search Fallback:* If SPARQL yields no results, falls back to the Wikidata Search API (`action=wbsearchentities`).
- **Extracted Properties:**
  - `P571` (Inception / Construction Date) & `P1619` (Date of Official Opening)
  - `P2048` (Height)
  - `P84` (Architect) & `P193` (Builder)
  - `P149` (Architectural Style, e.g., Gothic, Art Nouveau, Baroque)
  - `P138` (Named In Honor Of)
  - `P1435` (Heritage Designation, e.g., Monument Historique, UNESCO World Heritage)
  - `P186` (Construction Materials, e.g., Limestone, Granite, Steel)
  - `P31` (Instance Of)
- **Interesting Facts Synthesis (`buildInterestingFacts`):**
  - Synthesizes human-readable bullet points combining construction beginnings, public opening dates, heights in meters, architect credits, style designations, naming origins, and heritage status.

### 4.3 Step 3: Google Places API (New) Integration (`fetchGooglePlacesAtAddress`)
- **Endpoint:** Google Places API (New) `https://places.googleapis.com/v1/places:searchText`.
- **Field Mask:** `places.id,places.displayName,places.formattedAddress,places.currentOpeningHours,places.websiteUri,places.editorialSummary,places.primaryType`.
- **Rate Limit & Quota Protection:**
  - Hard daily quota cap of 40 calls per day (`GOOGLE_PLACES_MAX_DAILY_CALLS`).
  - Count persisted in `localStorage` under `gp_calls_YYYY-MM-DD`.
  - If daily limit is reached, gracefully returns without making network requests.
- **24-Hour Cache:** Every successful response is indexed in `localStorage` and memory with a 24-hour TTL, keyed by place query and truncated coordinates (`lat.toFixed(4),lon.toFixed(4)`).
- **Clean Display Policy:** Ratings, review stars, pricing levels, and phone numbers are excluded from the UI to maintain a clean, distraction-free travel card. Only editorial summaries, real-time open status (`Open Now` / `Closed`), and official website links are displayed.

### 4.4 Step 4: Building & Street Context Resolution
- **Building Detection (`isBuildingFeature`):**
  - Evaluates whether an inspected point represents a specific building based on OSM `category === 'building'`, `type === 'building'`, presence of `house_number`, `building:levels`, or structural types (`apartments`, `commercial`, `office`, `residential`, `retail`, `hotel`, `civic`, etc.).
- **Generic Name Filtering (`isGenericName`):**
  - Detects generic placeholder names (e.g., *"Building"*, *"House"*, *"Commercial"*, *"Roof"*, *"Unnamed"*, *"Map Object"*, or raw IDs like `way/12345`).
  - When generic, the application substitutes the formatted street address in the sheet header and suppresses duplicate address pills.
- **Street Guide Retrieval (`fetchStreetInfo`):**
  - When inspecting a building, the application extracts the street name and searches Wikipedia and Wikidata for the street's historical significance, name origin, inception, and dimensions.
  - Surfaced in a dedicated **"🛣️ Street Guide"** card at the bottom of the sheet with thumbnail and direct Wikipedia article links.
- **Places & Organizations at Address (`resolvePlacesAtAddress`):**
  - Aggregates co-located businesses, offices, cafes, and shops situated within the same building or address from Google Places results and nearby OSM points.
  - Rendered in a dedicated **"Places & Organizations at this Address"** card showing company name, category, open status badge, and direct website link.

### 4.5 Step 5: Wikipedia Narrative & Keyword Highlighting
- **Narrative Extraction (`fetchWikiDescription`):**
  - Queries `en.wikipedia.org/w/api.php` (`prop=extracts|pageimages`) to fetch introductory paragraphs and hero thumbnail images (`pithumbsize=640`).
- **Interactive Keywords (`extractMatchingTerms` & `highlightTerms`):**
  - Analyzes the narrative text to identify key historical figures, architectural styles, events, dynasties, and landmarks.
  - Replaces identified keywords with clickable interactive pills (`<span class="term" role="button">`).
  - **Non-Overlapping Highlighting Algorithm:** Sorts terms longest-first (ensuring e.g. *"Gothic architecture"* matches as a single term rather than splitting on *"architecture"*). Uses a byte mask (`Uint8Array`) to guarantee zero duplicate, nested, or broken HTML span tags.

---

## 5. User Interface & Interaction Specification

### 5.1 Layout & Visual Design

- **Aesthetic:** Dark-mode glassmorphic theme with backdrop filters (`backdrop-filter: blur(20px)`), translucent dark panels (`rgba(8, 14, 31, 0.85)`), and neon accent highlights (`#4f8eff`, `#00e5ff`).
- **Typography:** Google Fonts *Outfit* (weights: 300, 400, 500, 600, 700, 800).
- **Responsive Viewport Support:**
  - Mobile: Floating bottom sheet panel with touch drag-handle. Card carousel scrolls horizontally with touch snap.
  - Tablet / Desktop: Sheet constrained to ergonomic maximum widths with desktop-optimized scrolling and click targets.

### 5.2 Description Bottom Sheet (`#desc-sheet`)

The bottom sheet contains the following hierarchical sections:
1. **Swipe / Drag Handle:** Top drag handle (`#sheet-drag-handle`) supporting downward touch swipe gestures to dismiss the sheet.
2. **Header Bar:**
   - Back button (`#sheet-back`): Appears when deep-dive exploration history contains entries (`history.length > 0`).
   - Title column: Displays resolved Landmark Name or Formatted Address.
   - Address row (`#sheet-address`): Shows `📍 <Address>` when title represents a specific venue or landmark.
   - Subtitle: Category icon, category name, and primary data source badge (e.g. `🏛️ Historic • OpenStreetMap`).
   - Close button (`#sheet-close`): Dismisses the sheet and clears active pins.
3. **Exploration Breadcrumb Bar (`#breadcrumb`):**
   - Visible during term exploration deep-dives, showing the history trail of explored concepts.
4. **Content Body (`#sheet-body`):**
   - **Hero Image:** High-resolution thumbnail image with rounded corners.
   - **Google Editorial Summary:** Concise italicized editorial synopsis.
   - **Action Buttons:** Direct *"🌐 Visit Website ↗"* link.
   - **Quick Facts Grid (`.facts-grid`):** 2-column responsive grid displaying status (`Open Now` / `Closed`), construction date, public opening date, building height, architect/builder, architectural style, named-in-honor-of, heritage designation, and construction materials.
   - **Interesting Facts Box (`.facts-section-box`):** ✨ Bulleted list of curated historical highlights.
   - **Narrative Section:** Wikipedia narrative extract with blue clickable keyword terms.
   - **Places & Organizations at Address:** Directory listing of businesses/venues co-located at the building.
   - **Street Guide Block:** Comprehensive dossier about the surrounding street/boulevard.

### 5.3 Deep-Dive Hypertext Exploration & Navigation History

- When any blue keyword term (`.term`) is tapped in a narrative:
  1. The current sheet contents, title, and address are pushed onto the store's `history: HistoryEntry[]` stack.
  2. The sheet header updates to the concept term with subtitle *"🔍 exploring concept"*.
  3. The body displays a loading spinner and resets scroll position to `0`.
  4. Concurrent Wikipedia narrative and Wikidata concept queries resolve the explored topic.
  5. The back button (`←`) becomes visible in the header bar and the breadcrumb updates.
- Tapping the back button (`#sheet-back`) pops the latest entry from history and restores the previous view state without re-fetching.

### 5.4 Gesture & Keyboard Controls

- **Touch Swipe-to-Close:** Dragging the sheet handle downward by >90px triggers a smooth close animation and resets the panel state.
- **Escape Key:** Pressing `Escape` closes any open About modal.
- **Keyboard Navigation:** Filter chips, POI cards, action links, and highlighted terms feature full keyboard focus (`tabindex="0"`) and trigger on `Enter` or `Space`.

### 5.5 Fullscreen Mode

- Controlled via the top-bar button (`#fullscreen-btn`).
- Invokes native Fullscreen API (`requestFullscreen` / `webkitRequestFullscreen`).
- Dynamic button icon updates between `⛶` (enter) and `🗗` (exit) with proper `aria-pressed` states.

---

## 6. State Management & Data Schema

### 6.1 State Schema (`AppState`)

Managed through `src/store.ts`:

```typescript
export interface AppState {
  map:           LeafletMap | null;
  pois:          POI[];
  activeIdx:     number;
  activeCat:     string;
  markers:       Marker[];
  clickedMarker: Marker | null;
  userMarker:    Marker | null;
  history:       HistoryEntry[];
}
```

### 6.2 Data Model Definitions

- **`POI`:** Extends raw spatial element with normalized tags, resolved coordinates (`_lat`, `_lon`), and Haversine distance in km (`_dist`).
- **`OsmFeature`:** Normalized representation of OpenStreetMap nodes/ways/relations with structured address components, extracted categories, and external links (`wikidataId`, `wikipedia`).
- **`WikidataFactDetails`:** Structured architectural and historical facts (dates, height, architects, styles, naming, materials, heritage, and generated interesting facts).
- **`GooglePlaceDetails`:** Google Places API representation (editorial summary, open status, website URI, formatted address).
- **`StreetInfo`:** Detailed dossier about the street on which a building is located.
- **`AddressPlaceOrganization`:** Represents a business or organization co-located at an address.
- **`EnrichedPlaceInfo`:** Combined aggregate data object passed to the bottom sheet renderer.

---

## 7. Security & Sanitization Specification

1. **Strict XSS Prevention:**
   - All dynamic strings originating from external APIs (Wikipedia, Wikidata, OpenStreetMap, Google Places) are sanitized through `esc()` in `src/ui/dom.ts` before insertion into the DOM.
   - `esc()` converts `&`, `<`, `>`, `"`, and `'` into corresponding HTML entity escapes (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`).
2. **External Link Hardening:**
   - All outgoing external links (`<a>`) targeting Wikipedia or Google Places venue websites include `target="_blank"` and `rel="noopener"` attributes to prevent reverse tabnabbing and window leakage.
3. **Non-Overlapping Text Range Highlighting:**
   - The interactive term highlighter sorts candidate terms by character length descending and tracks masked byte positions. This guarantees valid, uncorrupted HTML strings without nested or malformed elements.

---

## 8. Build, Testing & Deployment Specification

### 8.1 Build Configuration

- **Bundler:** Vite 5 + TypeScript 5
- **Production Asset Paths:** Configured with `base: './'` in `vite.config.ts` to ensure compatibility across arbitrary subpaths (e.g. GitHub Pages repository subpath `https://<owner>.github.io/<repo>/`) and custom domains.
- **Build Output:** Static HTML, bundled JavaScript, and CSS written to `dist/`.

### 8.2 Automated Test Suite

- **Framework:** Vitest + jsdom
- **Test Coverage:** All business logic, parsers, date formatters, distance calculators, sanitizers, URL coordinate parsers, and UI components are covered by 121 unit and integration tests:
  - `tests/api/osm.test.ts`
  - `tests/api/wikidata.test.ts`
  - `tests/api/googlePlaces.test.ts`
  - `tests/api/street.test.ts`
  - `tests/api/places.test.ts`
  - `tests/api/wiki.test.ts`
  - `tests/api/overpass.test.ts`
  - `tests/ui/sheet.test.ts`
  - `tests/ui/cards.test.ts`
  - `tests/utils/dom.test.ts`
  - `tests/utils/url.test.ts`

### 8.3 Continuous Deployment (GitHub Pages)

- **Workflow File:** `.github/workflows/deploy.yml`
- **Trigger:** Automatic on push to `main` and on `workflow_dispatch`.
- **Pipeline Stages:**
  1. `Checkout repository` (`actions/checkout@v4`)
  2. `Setup Node.js 20` with npm cache (`actions/setup-node@v4`)
  3. `Install dependencies` (`npm ci`)
  4. `Run automated tests` (`npm run test:run`)
  5. `Compile TypeScript & build production bundle` (`npm run build`)
  6. `Upload Pages artifact` (`actions/upload-pages-artifact@v3`)
  7. `Deploy to GitHub Pages` (`actions/deploy-pages@v4`)

