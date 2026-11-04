/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_PLACES_API_KEY?: string;
  readonly VITE_GOOGLE_PLACES_PROXY_URL?: string;
  readonly VITE_NOMINATIM_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

