# Project Instructions & AI Guidelines

## Data Services & API Rules
- **DO NOT USE Overpass API service**: The Overpass API service (`overpass-api.de` / interpreter) is unstable and must NOT be used in this project.
- **Approved Reliable Data Sources**:
  - **OpenStreetMap Nominatim** (`nominatim.openstreetmap.org/reverse`) for reverse geocoding, address, building tags, and feature details.
  - **Komoot Photon** (`photon.komoot.io/reverse`) as high-availability mirror fallback for reverse geocoding.
  - **Wikipedia API** (`en.wikipedia.org/w/api.php`) for GeoSearch (`geosearch`), narratives, extracts, images, and links.
  - **Wikidata API** (`www.wikidata.org/w/api.php`) for entity lookups (`wbsearchentities`), sitelinks, and entity descriptions (`wbgetentities`).
  - **Google Places API** (`places.googleapis.com/v1/places:searchText`) for place details, editorial summaries, opening hours, and official website URLs (guarded by caching and daily quota limit).
