# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, kid-friendly Pokémon card lookup and collection tracker for an iPad, hosted on GitHub Pages at https://loopphoto.github.io/pokemon_scanner/. No build step, no package manager — plain HTML/CSS/JS served as-is.

## Running locally

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`. `app.js` is loaded as an ES module (`<script type="module">`), so it must be served over HTTP — `file://` won't work for the Firestore imports.

## Deployment

Deployment is GitHub Pages serving directly from the `main` branch root (legacy build). Pushing to `main` triggers a rebuild automatically (takes 1-3 minutes). There is no CI, build, lint, or test step.

**Cache-busting**: `index.html` loads `app.js?v=N`. iOS Safari aggressively caches the module script, so **bump the `?v=` query param in `index.html` any time `app.js` changes**, or kids' iPads will keep running stale JS while the HTML/CSS update.

## Architecture

- **`index.html`** — single-page shell: profile switcher (Reece/Aria/Kyra), Search tab, Collection tab (filter buttons, sort dropdown, stats grid), and a card-detail modal.
- **`style.css`** — single stylesheet, kid/iPad-friendly (large tap targets, bright colors).
- **`app.js`** — all app logic (ES module). Key pieces:
  - **TCGdex API** (`API_BASE = https://api.tcgdex.net/v2/en`) — public, CORS-open card database. `/cards?name=...` for search, `/cards/{id}` for full details (pricing, attacks, rarity, etc.). No API key needed. Card images are referenced as `{card.image}/low.webp` (grid thumbnails) and `{card.image}/high.webp` (detail view) — the base `image` URL from the API has no extension/size suffix by itself.
  - **Firebase/Firestore** — config and `firebaseApp`/`db` are initialized at the top of the file. Each kid's collection is a single document at `collections/{profileName}` (profile names are hardcoded in `PROFILES`). `firebaseConfig` (including `apiKey`) is intentionally public — Firebase web config is not a secret; access is controlled by `firestore.rules`.
  - **Profile state**: `currentProfile` / `currentItems` are an in-memory cache of the active kid's collection, loaded via `loadCollectionForProfile()` and kept in sync with Firestore via `saveCollectionRemote()`. `currentLoadPromise` should be awaited before reading `currentItems` after a profile switch.
  - **One-time localStorage migration**: if a Firestore doc doesn't exist yet for a profile, `loadCollectionForProfile()` falls back to reading the legacy `pokemonCardCollection_{profile}` localStorage key (from before Firestore sync was added) and writes it up to Firestore.
  - **Collection item shape**: `{ id, name, image, set, rarity, types, price, authenticity, quantity }` where `price` is the result of `getBestPriceData()` (or `null`), `authenticity` is `"real"` or `"fake"` (defaults to `"real"` if absent), and `quantity` is how many copies the kid owns (defaults to `1` if absent — use `getQuantity(item)` rather than reading `item.quantity` directly).
  - **Currency conversion (ZAR)**: TCGdex prices come back in USD (tcgplayer) or EUR (cardmarket) via `getBestPriceData(pricing)`. `exchangeRates` (`{ USD, EUR }`, EUR-based) loads from a 24h localStorage cache (`pokemonCardExchangeRates`) on startup and is refreshed from `https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,ZAR` — note the `.app` domain 301-redirects without CORS headers, so the fetch must target `.dev` directly. Falls back to hardcoded `{ USD: 18.5, EUR: 20.0 }` if there's no cache and the fetch fails. `toZAR(priceData)` converts a price object to a ZAR number; `formatZAR(value)` renders it as `R123.45`. `formatPrice`/`formatPriceBoxHtml` show the ZAR value as primary with the original currency alongside/below it.
  - **Collection mutation pattern**: `applyItemsUpdate(items)` is the shared helper for every collection write — it optimistically updates `currentItems`, calls `saveCollectionRemote()`, reverts `currentItems` and shows an `alert()` on failure, and re-renders the Collection tab if it's active. `addToCollection`, `changeQuantity` (deletes the item once quantity reaches 0), and `updateAuthenticity` all go through it.
  - **In-place detail-modal refresh**: `renderCollectControlsHtml` / `attachCollectControlsListeners` / `refreshCollectControls` re-render just the "add to collection / quantity / authenticity" controls inside `#collect-controls` after a mutation, without re-fetching the card from TCGdex.
  - **Sorting**: `collectionSort` (`"added"` | `"value-desc"` | `"value-asc"`, driven by `#sort-select`) and `sortItems(items)` sort by `toZAR(item.price)`; items with no price always sort last.
  - **Stats**: `renderStatsHtml()` computes quantity-weighted collection stats — Total Cards, Real vs Fake, Sets Collected, Estimated Value (ZAR), Favorite Type (via `TYPE_EMOJI`), Rarest Card (via a hardcoded `rarityRank` ordering), and Most Valuable (with a `×N` label).
- **`firestore.rules`** — must be manually pasted into the Firebase console (Firestore Database → Rules → Publish); not deployed automatically. Restricts reads/writes to documents named after the three hardcoded profiles, with separate `allow read` / `allow write` blocks (read rules can't reference `request.resource.data`, since that's only populated on writes).
- **`manifest.json`**, **`icons/`**, **`favicon.png`** — PWA/home-screen icon assets, generated via `generate_icons.py` (requires Pillow: `pip3 install pillow`). Re-run this script and recommit if the icon design changes.

## Key constraints when making changes

- Keep everything static/serverless — no backend beyond Firestore.
- `PROFILES` (`Reece`, `Aria`, `Kyra`) is duplicated conceptually between `app.js` (`PROFILES` array + button handlers) and `index.html` (the actual `.profile-btn` elements) and `firestore.rules` (the allowed document IDs) — all three must stay in sync if profiles are added/renamed.
