# TellMe

A mobile-first, tap-to-explore travel application powered by OpenStreetMap and Gemini AI. TellMe allows users to discover interesting places around them by simply panning the map and tapping on points of interest (POIs). No typing is required—users can dive deeper into AI-generated descriptions by tapping highlighted terms.

## Features

- **Interactive Map:** Powered by Leaflet and CartoDB Dark Matter tiles.
- **Live POI Fetching:** Automatically queries the Overpass API (OpenStreetMap) as you pan and zoom.
- **Smart Filtering:** Filter places by Sights, Historic, Food, Parks, and Shops.
- **AI Descriptions:** Uses Gemini 2.0 Flash to generate vivid, contextual descriptions of places.
- **Tap-to-Explore:** AI descriptions highlight interesting terms. Tapping a term triggers a follow-up query, allowing deep exploration without a keyboard.
- **Responsive UI:** Glassmorphism design system optimized for mobile devices with swipe-to-close gestures.

## Architecture

TellMe was recently refactored from a monolithic HTML file into a modern, modular TypeScript application.

### Tech Stack

- **Core:** TypeScript, HTML5, Vanilla CSS
- **Map:** Leaflet (`leaflet`)
- **Build Tool:** Vite
- **Testing:** Vitest + jsdom

### Project Structure

```text
TellMe/
├── index.html                  # Clean Vite entry point
├── style.css                   # Global styles and design tokens
├── vite.config.ts              # Vite & Vitest configuration
├── src/
│   ├── main.ts                 # Application entry and orchestration
│   ├── constants.ts            # Single source of truth for config and DOM IDs
│   ├── types.ts                # Shared TypeScript interfaces (State, API responses)
│   ├── store.ts                # Typed observable state store
│   │
│   ├── api/
│   │   ├── overpass.ts         # OpenStreetMap queries, distance calculation, parsing
│   │   └── gemini.ts           # Prompt building and AI response parsing
│   │
│   ├── map/
│   │   └── leaflet.ts          # Map initialization, markers, geolocation
│   │
│   └── ui/
│       ├── cards.ts            # POI card rendering and interaction
│       ├── sheet.ts            # Description bottom-sheet logic and swipe gestures
│       ├── filters.ts          # Category filter logic
│       ├── toast.ts            # Toast notification system
│       └── dom.ts              # XSS prevention, debounce, and generic DOM utilities
│
└── tests/                      # Vitest unit tests
```

### Key Architectural Decisions

1. **Typed Observable Store (`src/store.ts`):** 
   Replaces global mutable state. All state changes flow through `store.update()`, and the store can be subscribed to. The state is strictly typed via `AppState`.
2. **Pure Functions for Business Logic:**
   API prompt generation, POI parsing, distance calculation (Haversine formula), and DOM utility functions (like `esc` for XSS prevention) are extracted as pure functions. This enables fast, reliable unit testing without a browser environment.
3. **Event Orchestration (`src/main.ts`):**
   Modules do not deeply couple with each other. `main.ts` acts as the orchestrator, hooking up events from the UI (like `onSelectPOI`) to API fetches and map movements.
4. **Race Condition Prevention:**
   Both `gemini.ts` and `overpass.ts` use `AbortController` to cancel in-flight network requests when a new request is triggered by rapid user interaction.
5. **Security:**
   All user-facing text and AI-generated content is sanitized via `esc()` before being injected into the DOM, neutralizing XSS risks.

## Setup & Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Run tests:**
   ```bash
   npm run test
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## API Keys

The app queries the Overpass API for free. For AI descriptions, users are prompted to enter their own **Gemini API Key** directly in the app. The key is securely stored in the browser's `localStorage` and never sent to our servers.
