# TellMe — Tap to Explore

A modern, mobile-first travel discovery application powered by **OpenStreetMap**, **Wikidata Query Service (WDQS)**, and **Wikipedia**. TellMe lets users explore cities and landmarks around the globe simply by panning the map, clicking on any building or object on the map, or tapping discovered points of interest (POIs).

No typing is required—users can dive deeper into contextual narratives and concepts by tapping blue interactive keywords.

---

## Features

- **Interactive Map Object Click:** Click on any building, monument, landmark, or street to inspect it. Drops a pulsating animated pin and resolves details from OpenStreetMap and Wikidata.
- **Wikidata Query Service (WDQS) Integration:** Retrieves rich historical and architectural data:
  - 📅 **Date of Construction / Inception** and official opening dates.
  - 📐 **Height** and dimensions.
  - 🏛️ **Architect & Builder**.
  - 🎨 **Architectural Style**.
  - 🏷️ **Named After**.
  - 📜 **Heritage Designation** (e.g. Historic Monument, UNESCO).
  - 🧱 **Construction Materials**.
- **Interesting Facts & Highlights:** Synthesizes structured Wikidata properties into concise, engaging trivia and highlights.
- **OpenStreetMap Reverse Geocoding:** Resolves exact address, feature type, and OSM tags using OpenStreetMap Nominatim with Komoot Photon mirror fallback.
- **Google Places API Integration:** Enriches landmarks and businesses with real-time open status (`Open Now` / `Closed`) and direct official website links (ratings, prices, and phone numbers are explicitly excluded to maintain a clean, uncluttered card).
- **Strict Quota & Rate Limiting:** Google Places API calls are guarded by a multi-tier cache (in-memory + persistent 24-hour `localStorage`) and a daily call quota cap (`gp_calls_YYYY-MM-DD`) to keep usage within limits.
- **Nearby Places Discovery:** Automatically queries Wikipedia GeoSearch as you pan and zoom to show top attractions, historic sites, parks, and dining spots.
- **Category Filtering:** Filter places by **All**, **Sights** (🏛️), **Historic** (🏰), **Food** (☕), **Parks** (🌿), and **Shops** (🛍️).
- **Tap-to-Explore Deep Diving:** Tapping blue highlighted terms in any description triggers an exploratory lookup with breadcrumbs and back navigation.
- **Glassmorphic Responsive UI:** Sleek dark mode interface tailored for mobile, tablet, and desktop viewports, with swipe-to-close gesture support.

---

## Architecture

The project is built as a modular TypeScript application utilizing an observable unidirectional store pattern.

### Tech Stack

- **Core:** TypeScript, HTML5, Vanilla CSS
- **Map Engine:** Leaflet (`leaflet`)
- **APIs:** OpenStreetMap Nominatim, Komoot Photon, Wikidata Query Service (WDQS SPARQL), Google Places API (New), Wikipedia API
- **Build Tool:** Vite
- **Testing:** Vitest + jsdom (119 passing tests)

### Project Structure

```text
TellMe/
├── index.html                  # Clean Vite entry point
├── style.css                   # Global styles and design tokens
├── vite.config.ts              # Vite & Vitest configuration
├── tsconfig.json               # TypeScript configuration
├── src/
│   ├── main.ts                 # Application orchestration and event wiring
│   ├── constants.ts            # Single source of truth for config, endpoints, and DOM IDs
│   ├── types.ts                # TypeScript interfaces (OsmFeature, WikidataFactDetails, GooglePlaceDetails, POI, AppState)
│   ├── store.ts                # Typed observable state store
│   │
│   ├── api/
│   │   ├── osm.ts              # OpenStreetMap reverse geocoding and tag parsing
│   │   ├── wikidata.ts         # Wikidata Query Service SPARQL integration and facts synthesis
│   │   ├── googlePlaces.ts     # Google Places API (New) integration with multi-tier caching and daily quota cap
│   │   ├── places.ts           # Wikipedia GeoSearch place discovery
│   │   ├── wiki.ts             # Wikipedia article extracts and interactive keyword parsing
│   │   ├── overpass.ts         # Distance calculation (Haversine) & category emoji helpers
│   │   └── gemini.ts           # Gemini AI fallback POI dataset
│   │
│   ├── map/
│   │   └── leaflet.ts          # Map initialization, custom markers, clicked pin, geolocation
│   │
│   └── ui/
│       ├── cards.ts            # POI card deck rendering and interaction
│       ├── sheet.ts            # Description bottom-sheet, specs grid, interesting facts, swipe gestures
│       ├── filters.ts          # Category filter logic
│       ├── toast.ts            # Toast notification system
│       └── dom.ts              # XSS sanitization, debouncing, and term highlighter
│
└── tests/                      # Automated Vitest test suite
    ├── api/
    │   ├── osm.test.ts         # OSM parsing and address formatting tests
    │   ├── wikidata.test.ts    # Wikidata SPARQL aggregation & date formatter tests
    │   ├── googlePlaces.test.ts# Google Places response parser and quota cache tests
    │   ├── places.test.ts      # GeoSearch parsing tests
    │   ├── wiki.test.ts        # Extract cleaner and keyword matching tests
    │   ├── overpass.test.ts    # Haversine distance and emoji mappings tests
    │   └── gemini.test.ts      # AI response validator tests
    └── ui/
        ├── sheet.test.ts       # Bottom sheet rendering and conditional hint tests
        ├── cards.test.ts       # POI deck rendering and selection tests
        └── dom.test.ts         # HTML escaping and term highlighting tests
```

---

## Key Architectural Decisions

1. **Typed Observable Store (`src/store.ts`):** 
   Replaces global mutable state. All state changes flow through `store.update()`, and UI components subscribe to state changes. State is strictly typed via `AppState`.
2. **Pure Functions for Data & Business Logic:**
   Data parsers, date formatting (`formatConstructionDate`), height formatting (`formatHeight`), distance calculation (`haversineKm`), Google Places parsing, and DOM utilities (`esc` for XSS prevention) are pure functions, enabling 100% test coverage without browser dependencies.
3. **Decoupled Orchestration (`src/main.ts`):**
   UI components and network modules do not import each other. `main.ts` acts as the coordinator, connecting map clicks and POI selections to parallel data fetching pipelines (OSM + Wikidata + Google Places + Wikipedia).
4. **Resilient Data Retrieval & Abort Handling:**
   Network modules use `AbortController` to cancel in-flight requests during rapid panning or tapping. Fallback mechanisms (Nominatim → Photon, Wikidata QID → Spatial `wikibase:around` → Entity Search) ensure high availability without Overpass dependency.
5. **Multi-Tier Caching & API Quota Protection:**
   Google Places API calls are checked against in-memory and 24-hour persistent `localStorage` caches keyed by query and coordinates. A daily budget tracker (`GOOGLE_PLACES_MAX_DAILY_CALLS`) guarantees demo keys are never exhausted.
6. **Security & Sanitization:**
   All text and remote content injected into the DOM is sanitized via `esc()`, eliminating XSS vulnerabilities.

---

## Setup & Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```
