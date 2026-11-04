# Mobile UX & Card UI Improvement Checklist

Check (`[x]`) the improvements below that you consider most important to implement.

---

## 1. Card Content & Data Accuracy (Riga & Non-English Cities)

- [x] **Chain Wikipedia lookup using Wikidata sitelink (`wikidata.wikipediaTitle`) & `osm.wikipedia`:** When inspecting a place with a local/non-English name (e.g., `"Radio Latvia"` / `"Rīgas Doms"`), fall back to `wikidata.wikipediaTitle` (`"Latvijas Radio"` / `"Riga Cathedral"`) or `osm.wikipedia` so the card fetches the full English Wikipedia article and hero photo instead of missing them.
- [x] **Filter out unrelated city-wide results in "Places & Organizations at this Address":** Verify that Google Places results actually match the inspected street/house number (or query Google Places by the street address rather than a broad brand name) so stations kilometers away (*LTV on Zaķusala*, *Radio SWH*, *Eiropas Hitu Radio*) are not listed as being at `8 Doma laukums`.
- [x] **Deduplicate the primary place from "Places & Organizations at this Address":** Exclude entries from the organization list whose name or `websiteUri` matches the primary card's title or website (e.g., prevent *Radio Latvia* and *Latvian Radio (LR)* from appearing inside their own address directory).
- [x] **Use context-aware labels for `P571` (`📅 Built` vs. `📅 Established`):** Show **`📅 Established`** when the matched entity is an organization, radio station, or business, and **`📅 Date of Construction`** only when it is a physical building or monument.
- [ ] **Include multilingual & local language fallbacks (`[AUTO_LANGUAGE],en,mul,lv,de`) in Wikidata SPARQL:** Prevent Baltic/local architects and heritage designations without French/Spanish labels from returning raw `Q...` IDs and being dropped.
- [x] **Prevent `fetchAddressInventory` from overwriting named landmarks with generic building ways:** Keep the specific landmark/POI metadata when Nominatim reverse-geocodes a famous attraction that also has a street & house number.

---

## 2. Card Visual Hierarchy & Layout (`#desc-sheet`)

- [x] **Remove redundant "✨ Interesting Facts & Highlights" bullets when `.facts-grid` is present:** Stop repeating the exact same construction date, height, architect, and style in sentence templates right below the `.facts-grid` cards.
- [x] **Suppress trivial 1-line narrative fragments:** Hide `.sheet-narrative-section` if the description is just a short `< 45` character Wikidata label (e.g., `"Latvian national radio station"`) that adds no narrative value, and instead display short descriptions cleanly in the header subtitle.
- [x] **Hide empty/trivial "🛣️ Street Guide" blocks:** Only render `.sheet-street-block` when there is a meaningful description (`> 60` characters) or thumbnail image, instead of rendering a large card just to say `"square in Riga, Latvia"`. Also remove the duplicate `🛣️` emoji in `.street-block-sub`.
- [x] **Render real `<p>` paragraphs in narratives & clean multi-language parentheticals:** Split Wikipedia extracts on `\n\n` into proper `<p>` tags so multi-paragraph histories don't collapse into a single wall of text, and strip opening parenthetical clutter like `(Latvian: ...; German: ...)`.
- [x] **Add "Read more ▾" collapsible toggle for long narratives:** Show the first paragraph by default on mobile so users can immediately see the Organizations list and Street Guide below without scrolling past 3 long paragraphs.
- [ ] **Auto-span long values in `.facts-grid` (`grid-column: 1 / -1`):** Automatically use full-width cards when values exceed ~28 characters (e.g., long architect lists, multiple architectural styles, or `"National Architectural Monument of Latvia"`) and balance odd card counts so there are no cramped 4-line half-cards or empty grid slots.
- [x] **Fix broken CSS variables on `.sheet-editorial-summary`:** Replace undefined `var(--text-1)` and `var(--accent)` with `var(--text)` and `var(--amber)` so the left accent border and text color render properly.
- [x] **Improve Hero Image framing:** Use `object-position: center 25%` (better preserving church spires/towers in Riga) and allow tapping the image to toggle full-height/uncropped view.
- [x] **Simplify & make `#sheet-address` actionable:** Shorten verbose OSM address strings (e.g., `8 Doma laukums, Old Riga` instead of `8 Doma laukums, Centra rajons, Rīga, Vidzeme, LV-1050, Latvija`) and allow tapping it to copy or open in Maps.

---

## 3. Nearby POI Carousel & Discovery Filtering (`.poi-card`)

- [ ] **Filter non-physical articles out of Wikipedia GeoSearch POIs:** Exclude historical wars/sieges (*"Siege of Riga (1656)"*), events (*"Eurovision Song Contest 2003"*), defunct states (*"United Baltic Duchy"*), dioceses (*"Archdiocese of Riga"*), and city/district-level entries (*"Riga"*, *"Riga district"*) so only real, visitable landmarks appear in the carousel and on the map.
- [ ] **Show human-readable distance (`"250 m"` / `"1.2 km"`) on POI cards:** Display the already-calculated `poi._dist` badge on each `.poi-card` alongside its short description.
- [ ] **Sync horizontal card carousel scroll with map markers:** Highlight/pulse the corresponding map marker as the mobile user swipes horizontally through `#cards-scroll` (using `IntersectionObserver`), without requiring a tap that opens the full sheet.

---

## 4. Map-to-Sheet Interaction & Gestures

- [ ] **Prevent programmatic `flyTo` from wiping out the POI carousel:** When selecting a POI card or marker triggers `flyTo()`, suppress the debounced `handleViewChange()` reload so the card carousel and active selection aren't overwritten 900ms later.
- [ ] **Offset map center above the open bottom sheet:** When a POI is selected or a map point is tapped on mobile portrait, pan the map so the target pin (`🎯`) sits centered in the *visible* top portion of the screen above `#desc-sheet`, rather than hidden behind the `78vh` sheet.
- [ ] **Tap on map while sheet is open closes the sheet first:** When `#desc-sheet` is open on mobile, tapping empty map space above the sheet should dismiss the sheet rather than immediately dropping a new pin and inspecting a random building.
- [ ] **Expand swipe-to-close touch area to the entire sheet header & top-of-scroll:** Allow dragging down from anywhere on `#sheet-header` (not just the tiny 18px `.sheet-handle-row`) and support pull-down-to-close when `#sheet-body` is at `scrollTop === 0`.
- [ ] **Support 2-stage bottom sheet (Peek ~45dvh / Expanded ~82dvh):** Open the sheet in a medium peek height first so both the map pin and key facts are visible, expanding to full height on upward swipe or scroll.

---

## 5. Mobile Ergonomics, Safe Areas & Native Feel

- [ ] **Add Directions (`🗺️ Directions`) & Share (`📤 Share`) buttons to `.place-actions-row`:** Let mobile travelers launch walking directions in Google/Apple Maps or share the deep-linked coordinate URL via the native Web Share API (`navigator.share`).
- [x] **Make breadcrumb items (`.bc-item`) tappable buttons:** Allow users who have deep-dived 2–3 levels into blue `.term` keywords to tap any previous breadcrumb item to jump directly back to that card.
- [x] **Style inline `.term` keywords as touch-friendly pills:** Add subtle pill padding and background (`padding: 1px 6px; border-radius: 5px; background: rgba(56,189,248,0.1)`) so clickable terms are easier to spot and tap accurately on mobile screens.
- [x] **Support mobile hardware/gesture Back button for term history & sheet dismissal:** Hook into browser `popstate` so swiping back on Android/iOS steps back through explored `.term` history or closes the open sheet instead of exiting the page.
- [x] **Add `viewport-fit=cover`, `dvh` units, and safe-area insets:** Update `<meta name="viewport">` in `index.html`, use `78dvh` on `#desc-sheet`, and add `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` to `#top-bar`, `#logo`, and `#sheet-body`.
- [x] **Increase `#sheet-close` and `#sheet-back` touch targets to `44×44px`:** Meet mobile accessibility hit-target sizing guidelines.

