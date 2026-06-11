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

- **`index.html`** — single-page shell: profile switcher (Reece/Aria/Kyra), Search tab, Collection tab, and a card-detail modal.
- **`app.js`** — all app logic (ES module). Key pieces:
  - **TCGdex API** (`API_BASE = https://api.tcgdex.net/v2/en`) — public, CORS-open card database. `/cards?name=...` for search, `/cards/{id}` for full details (pricing, attacks, rarity, etc.). No API key needed.
  - **Firebase/Firestore** — config and `firebaseApp`/`db` are initialized at the top of `app.js`. Each kid's collection is a single document at `collections/{profileName}` (profile names are hardcoded in `PROFILES`). `firebaseConfig` (including `apiKey`) is intentionally public — Firebase web config is not a secret; access is controlled by `firestore.rules`.
  - **Profile state**: `currentProfile` / `currentItems` are an in-memory cache of the active kid's collection, loaded via `loadCollectionForProfile()` and kept in sync with Firestore via `saveCollectionRemote()`. `currentLoadPromise` should be awaited before reading `currentItems` after a profile switch.
  - **Collection item shape**: `{ id, name, image, set, rarity, types, price, authenticity, quantity }` where `authenticity` is `"real"` or `"fake"` (defaults to `"real"` if absent, for items saved before that field existed) and `quantity` is how many copies of that card the kid owns (defaults to `1` if absent, for items saved before that field existed). Use `getQuantity(item)` rather than reading `item.quantity` directly.
  - **One-time localStorage migration**: if a Firestore doc doesn't exist yet for a profile, `loadCollectionForProfile()` falls back to reading the legacy `pokemonCardCollection_{profile}` localStorage key (from before Firestore sync was added) and writes it up to Firestore.
- **`style.css`** — single stylesheet, kid/iPad-friendly (large tap targets, bright colors).
- **`firestore.rules`** — must be manually pasted into the Firebase console (Firestore Database → Rules → Publish); not deployed automatically. Restricts reads/writes to documents named after the three hardcoded profiles, with separate `allow read` / `allow write` blocks (read rules can't reference `request.resource.data`, since that's only populated on writes).
- **`manifest.json`**, **`icons/`**, **`favicon.png`** — PWA/home-screen icon assets, generated via `generate_icons.py` (requires Pillow: `pip3 install pillow`). Re-run this script and recommit if the icon design changes.

## Key constraints when making changes

- Keep everything static/serverless — no backend beyond Firestore.
- `PROFILES` (`Reece`, `Aria`, `Kyra`) is duplicated conceptually between `app.js` (`PROFILES` array + button handlers) and `index.html` (the actual `.profile-btn` elements) and `firestore.rules` (the allowed document IDs) — all three must stay in sync if profiles are added/renamed.
- TCGdex card images are referenced as `{card.image}/low.webp` (grid thumbnails) and `{card.image}/high.webp` (detail view) — the base `image` URL from the API has no extension/size suffix by itself.
