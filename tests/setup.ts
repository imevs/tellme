// Vitest setup — runs before every test file
// jsdom is configured in vite.config.ts (environment: 'jsdom')
// Nothing extra needed here for now, but this file is the place
// to add global mocks (e.g. localStorage, fetch) if required.

// Silence Leaflet "window.L is not defined" in jsdom
// (Leaflet is not imported in unit tests — only integration tests would need it)
