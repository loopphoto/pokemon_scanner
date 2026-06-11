import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmIBfUtxHfAf_tnul6EAYK3cKoAclTcH4",
  authDomain: "pokemon-card-finder-22e45.firebaseapp.com",
  projectId: "pokemon-card-finder-22e45",
  storageBucket: "pokemon-card-finder-22e45.firebasestorage.app",
  messagingSenderId: "1005788207712",
  appId: "1:1005788207712:web:cecc779eb67435165cc105",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const API_BASE = "https://api.tcgdex.net/v2/en";
const COLLECTION_KEY_PREFIX = "pokemonCardCollection_"; // legacy localStorage key, used for one-time migration
const PROFILES = ["Reece", "Aria", "Kyra"];
const ACTIVE_PROFILE_KEY = "pokemonCardActiveProfile";

// ---------- Currency conversion (ZAR) ----------
const EXCHANGE_RATE_KEY = "pokemonCardExchangeRates";
const EXCHANGE_RATE_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day

// Approximate fallback rates, used until (or unless) a live rate is fetched
let exchangeRates = { USD: 18.5, EUR: 20.0 };

function loadCachedExchangeRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(EXCHANGE_RATE_KEY));
    if (cached && cached.rates && Date.now() - cached.timestamp < EXCHANGE_RATE_MAX_AGE) {
      exchangeRates = cached.rates;
    }
  } catch {}
}

async function refreshExchangeRates() {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,ZAR");
    if (!res.ok) throw new Error("rate fetch failed");
    const data = await res.json();
    const eurToZar = data.rates && data.rates.ZAR;
    const eurToUsd = data.rates && data.rates.USD;
    if (eurToZar && eurToUsd) {
      exchangeRates = { USD: eurToZar / eurToUsd, EUR: eurToZar };
      localStorage.setItem(EXCHANGE_RATE_KEY, JSON.stringify({ timestamp: Date.now(), rates: exchangeRates }));
      if (document.getElementById("collection-tab").classList.contains("active")) {
        renderCollection();
      }
    }
  } catch {
    // keep using cached/fallback rates
  }
}

function toZAR(priceData) {
  if (!priceData) return null;
  const rate = exchangeRates[priceData.currency];
  return rate ? priceData.value * rate : null;
}

function formatZAR(value) {
  return `R${value.toFixed(2)}`;
}

loadCachedExchangeRates();
refreshExchangeRates();

// ---------- Cloud Collection Storage ----------
let currentProfile = null;
let currentItems = [];
let currentLoadPromise = Promise.resolve();

async function loadCollectionForProfile(profile) {
  const ref = doc(db, "collections", profile);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data().items || [];
  }
  // One-time migration from any older localStorage data on this device
  try {
    const legacy = JSON.parse(localStorage.getItem(COLLECTION_KEY_PREFIX + profile));
    if (Array.isArray(legacy) && legacy.length) {
      await setDoc(ref, { items: legacy });
      return legacy;
    }
  } catch {}
  return [];
}

async function saveCollectionRemote(profile, items) {
  await setDoc(doc(db, "collections", profile), { items });
}

// ---------- Profiles ----------
const profileButtons = document.querySelectorAll(".profile-btn");

function getActiveProfile() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || PROFILES[0];
}

function setActiveProfile(name) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, name);
  profileButtons.forEach((b) => b.classList.toggle("active", b.dataset.profile === name));
  currentProfile = name;
  currentItems = [];

  const collectionTabActive = document.getElementById("collection-tab").classList.contains("active");
  if (collectionTabActive) {
    collectionStatus.textContent = "Loading...";
    collectionStats.innerHTML = "";
    collectionResults.innerHTML = "";
  }

  currentLoadPromise = loadCollectionForProfile(name)
    .then((items) => {
      currentItems = items;
      if (currentProfile === name && document.getElementById("collection-tab").classList.contains("active")) {
        renderCollection();
      }
    })
    .catch(() => {
      if (currentProfile === name && document.getElementById("collection-tab").classList.contains("active")) {
        collectionStatus.textContent = "Couldn't load collection. Check your connection and try again.";
      }
    });

  return currentLoadPromise;
}

profileButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveProfile(btn.dataset.profile));
});

setActiveProfile(getActiveProfile());

// ---------- Tabs ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
    if (btn.dataset.tab === "collection") {
      collectionStatus.textContent = "Loading...";
      collectionStats.innerHTML = "";
      collectionResults.innerHTML = "";
      await currentLoadPromise;
      renderCollection();
    }
  });
});

// ---------- Search ----------
const searchInput = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");
const searchResults = document.getElementById("search-results");

let searchTimer = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (!query) {
    searchResults.innerHTML = "";
    searchStatus.textContent = "Type a Pokémon name to find cards!";
    return;
  }
  searchStatus.textContent = "Searching...";
  searchTimer = setTimeout(() => runSearch(query), 350);
});

async function runSearch(query) {
  try {
    const res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Search failed");
    const cards = await res.json();
    const withImages = cards.filter((c) => c.image);
    renderCardGrid(searchResults, withImages);
    searchStatus.textContent = withImages.length
      ? `Found ${withImages.length} card${withImages.length === 1 ? "" : "s"}`
      : "No cards found. Try a different name!";
  } catch (err) {
    searchStatus.textContent = "Oops, something went wrong. Try again!";
  }
}

function renderCardGrid(container, cards) {
  container.innerHTML = "";
  cards.forEach((card) => {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.innerHTML = `
      <img src="${card.image}/low.webp" alt="${escapeHtml(card.name)}" loading="lazy">
      <div class="card-name">${escapeHtml(card.name)}</div>
    `;
    tile.addEventListener("click", () => openCardDetail(card.id));
    container.appendChild(tile);
  });
}

// ---------- Card Detail Modal ----------
const modal = document.getElementById("detail-modal");
const detailBody = document.getElementById("detail-body");
document.getElementById("close-modal").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

function closeModal() {
  modal.classList.remove("open");
  detailBody.innerHTML = "";
}

async function openCardDetail(cardId) {
  detailBody.innerHTML = `<div class="empty-msg">Loading...</div>`;
  modal.classList.add("open");
  try {
    await currentLoadPromise;
    const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(cardId)}`);
    if (!res.ok) throw new Error("Not found");
    const card = await res.json();
    detailBody.innerHTML = renderCardDetailHtml(card);

    const authButtons = detailBody.querySelectorAll(".auth-btn");
    const collectBtn = document.getElementById("collect-btn");
    const collectedItem = currentItems.find((c) => c.id === card.id);

    authButtons.forEach((b) => {
      b.addEventListener("click", () => {
        authButtons.forEach((x) => x.classList.toggle("active", x === b));
        if (collectedItem) {
          updateAuthenticity(card.id, b.dataset.auth);
        }
      });
    });

    collectBtn.addEventListener("click", () => {
      const activeAuth = detailBody.querySelector(".auth-btn.active");
      toggleCollected(card, collectBtn, activeAuth ? activeAuth.dataset.auth : "real");
    });
  } catch (err) {
    detailBody.innerHTML = `<div class="empty-msg">Couldn't load this card. Try again!</div>`;
  }
}

function renderCardDetailHtml(card) {
  const types = (card.types || []).join(", ") || "—";
  const setName = card.set ? card.set.name : "—";
  const collectedItem = currentItems.find((c) => c.id === card.id);
  const isCollected = !!collectedItem;
  const authenticity = collectedItem ? collectedItem.authenticity || "real" : "real";

  const attacksHtml = (card.attacks || [])
    .map(
      (atk) => `
      <div class="attack">
        <div class="attack-name">
          <span>${escapeHtml(atk.name)}</span>
          <span>${atk.damage != null ? atk.damage : ""}</span>
        </div>
        ${atk.effect ? `<div class="attack-effect">${escapeHtml(atk.effect)}</div>` : ""}
      </div>`
    )
    .join("");

  return `
    <img class="detail-image" src="${card.image}/high.webp" alt="${escapeHtml(card.name)}">
    <div class="detail-name">${escapeHtml(card.name)}</div>
    <div class="detail-meta">${escapeHtml(setName)} · #${escapeHtml(card.localId || "")}</div>

    ${card.hp ? `<div class="detail-row"><span>HP</span><span>${card.hp}</span></div>` : ""}
    <div class="detail-row"><span>Type</span><span>${escapeHtml(types)}</span></div>
    ${card.rarity ? `<div class="detail-row"><span>Rarity</span><span>${escapeHtml(card.rarity)}</span></div>` : ""}
    ${card.illustrator ? `<div class="detail-row"><span>Illustrator</span><span>${escapeHtml(card.illustrator)}</span></div>` : ""}

    ${attacksHtml}

    ${formatPriceBoxHtml(getBestPriceData(card.pricing))}

    <div class="authenticity-row">
      <button class="auth-btn ${authenticity === "real" ? "active" : ""}" data-auth="real">✅ Real</button>
      <button class="auth-btn ${authenticity === "fake" ? "active" : ""}" data-auth="fake">❌ Fake</button>
    </div>

    <button id="collect-btn" class="collect-btn ${isCollected ? "added" : ""}">
      ${isCollected ? "★ In My Collection (tap to remove)" : "☆ Add to My Collection"}
    </button>
  `;
}

function getBestPriceData(pricing) {
  if (!pricing) return null;
  const tcg = pricing.tcgplayer;
  if (tcg) {
    const variant = tcg.holofoil || tcg.normal || tcg.reverseHolofoil || tcg["1stEditionHolofoil"];
    if (variant && variant.marketPrice != null) {
      return { value: variant.marketPrice, currency: "USD", symbol: "$" };
    }
  }
  const cm = pricing.cardmarket;
  if (cm && cm.avg != null) {
    return { value: cm.avg, currency: "EUR", symbol: "€" };
  }
  return null;
}

function formatOriginalPrice(priceData) {
  return `${priceData.symbol}${priceData.value.toFixed(2)} ${priceData.currency}`;
}

function formatPrice(priceData) {
  if (!priceData) return null;
  const zar = toZAR(priceData);
  const original = formatOriginalPrice(priceData);
  return zar != null ? `${formatZAR(zar)} (${original})` : original;
}

function formatPriceBoxHtml(priceData) {
  if (!priceData) return "";
  const zar = toZAR(priceData);
  const original = formatOriginalPrice(priceData);
  return `<div class="price-box">
    <div>Estimated Value</div>
    <div class="price-value">${zar != null ? formatZAR(zar) : original}</div>
    ${zar != null ? `<div class="price-original">${original}</div>` : ""}
  </div>`;
}

// ---------- Collection (cloud-backed via Firestore) ----------
function getCollection() {
  return currentItems;
}

function isInCollection(cardId) {
  return currentItems.some((c) => c.id === cardId);
}

async function toggleCollected(card, btn, authenticity) {
  const wasCollected = currentItems.some((c) => c.id === card.id);
  let items;
  if (wasCollected) {
    items = currentItems.filter((c) => c.id !== card.id);
    btn.classList.remove("added");
    btn.textContent = "☆ Add to My Collection";
  } else {
    items = [
      ...currentItems,
      {
        id: card.id,
        name: card.name,
        image: card.image,
        set: card.set ? card.set.name : "",
        rarity: card.rarity || null,
        types: card.types || [],
        price: getBestPriceData(card.pricing),
        authenticity: authenticity === "fake" ? "fake" : "real",
      },
    ];
    btn.classList.add("added");
    btn.textContent = "★ In My Collection (tap to remove)";
  }

  const previousItems = currentItems;
  currentItems = items;
  const profileAtSave = currentProfile;
  try {
    await saveCollectionRemote(profileAtSave, items);
  } catch (err) {
    // Revert on failure
    if (currentProfile === profileAtSave) {
      currentItems = previousItems;
      btn.classList.toggle("added", wasCollected);
      btn.textContent = wasCollected ? "★ In My Collection (tap to remove)" : "☆ Add to My Collection";
    }
    alert("Couldn't save - check your internet connection and try again.");
  }
}

async function updateAuthenticity(cardId, authenticity) {
  const value = authenticity === "fake" ? "fake" : "real";
  const previousItems = currentItems;
  const items = currentItems.map((c) => (c.id === cardId ? { ...c, authenticity: value } : c));
  currentItems = items;
  const profileAtSave = currentProfile;
  try {
    await saveCollectionRemote(profileAtSave, items);
  } catch (err) {
    if (currentProfile === profileAtSave) {
      currentItems = previousItems;
    }
    alert("Couldn't save - check your internet connection and try again.");
  }
}

// ---------- Collection Tab ----------
const collectionStatus = document.getElementById("collection-status");
const collectionStats = document.getElementById("collection-stats");
const collectionResults = document.getElementById("collection-results");
const filterButtons = document.querySelectorAll(".filter-btn");
const sortSelect = document.getElementById("sort-select");

let collectionFilter = "all";
let collectionSort = "added";

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    collectionFilter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
    renderCollection();
  });
});

sortSelect.addEventListener("change", () => {
  collectionSort = sortSelect.value;
  renderCollection();
});

function sortItems(items) {
  if (collectionSort === "added") return items;
  const sorted = [...items];
  sorted.sort((a, b) => {
    const av = toZAR(a.price);
    const bv = toZAR(b.price);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return collectionSort === "value-asc" ? av - bv : bv - av;
  });
  return sorted;
}

const TYPE_EMOJI = {
  Grass: "🌿", Fire: "🔥", Water: "💧", Lightning: "⚡", Psychic: "🔮",
  Fighting: "🥊", Darkness: "🌑", Metal: "⚙️", Fairy: "✨", Dragon: "🐉",
  Colorless: "⭐",
};

function renderCollection() {
  const allItems = currentItems;
  const profile = currentProfile;
  if (!allItems.length) {
    collectionStatus.textContent = `${profile} has no cards yet! Find a card and tap "Add to My Collection".`;
    collectionStats.innerHTML = "";
    collectionResults.innerHTML = "";
    return;
  }

  const items = allItems.filter((c) => {
    if (collectionFilter === "all") return true;
    return (c.authenticity || "real") === collectionFilter;
  });

  if (!items.length) {
    collectionStatus.textContent = `${profile}'s collection: 0 ${collectionFilter} cards`;
    collectionStats.innerHTML = "";
    collectionResults.innerHTML = "";
    return;
  }

  collectionStatus.textContent = `${profile}'s collection: ${items.length} card${items.length === 1 ? "" : "s"}`;
  collectionStats.innerHTML = renderStatsHtml(items, allItems);
  renderCardGrid(collectionResults, sortItems(items));
}

function renderStatsHtml(items, allItems) {
  // Total estimated value, converted to ZAR so cards in different currencies add up
  const pricedItems = items.filter((c) => c.price);
  const totalValueZAR = pricedItems.reduce((sum, c) => sum + (toZAR(c.price) || 0), 0);

  // Unique sets
  const uniqueSets = new Set(items.map((c) => c.set).filter(Boolean));

  // Favorite type (most common)
  const typeCounts = {};
  items.forEach((c) => (c.types || []).forEach((t) => (typeCounts[t] = (typeCounts[t] || 0) + 1)));
  const favoriteType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  // Most valuable card (compared in ZAR so currencies are on equal footing)
  let mostValuable = null;
  pricedItems.forEach((c) => {
    const zar = toZAR(c.price) || 0;
    if (!mostValuable || zar > (toZAR(mostValuable.price) || 0)) mostValuable = c;
  });

  // Rarest-sounding card (anything with "Rare"/"Holo"/"Ultra"/"Secret" wins, prefer longer rarity name)
  const rarityRank = (r) => {
    if (!r) return 0;
    const order = ["Common", "Uncommon", "Rare", "Double Rare", "Holo Rare", "Ultra Rare", "Illustration Rare", "Special Illustration Rare", "Hyper Rare", "Secret Rare"];
    const idx = order.findIndex((o) => r.toLowerCase().includes(o.toLowerCase()));
    return idx === -1 ? 1 : idx;
  };
  let rarestCard = null;
  items.forEach((c) => {
    if (!rarestCard || rarityRank(c.rarity) > rarityRank(rarestCard.rarity)) rarestCard = c;
  });

  const cards = [];
  cards.push(`<div class="stat-card"><div class="stat-value">${items.length}</div><div class="stat-label">Total Cards</div></div>`);
  if (allItems) {
    const realCount = allItems.filter((c) => (c.authenticity || "real") === "real").length;
    const fakeCount = allItems.filter((c) => c.authenticity === "fake").length;
    cards.push(`<div class="stat-card"><div class="stat-value">✅ ${realCount} · ❌ ${fakeCount}</div><div class="stat-label">Real vs Fake</div></div>`);
  }
  cards.push(`<div class="stat-card"><div class="stat-value">${uniqueSets.size}</div><div class="stat-label">Sets Collected</div></div>`);
  if (totalValueZAR > 0) {
    cards.push(`<div class="stat-card highlight"><div class="stat-value">${formatZAR(totalValueZAR)}</div><div class="stat-label">Estimated Value</div></div>`);
  }
  if (favoriteType) {
    const emoji = TYPE_EMOJI[favoriteType[0]] || "🎴";
    cards.push(`<div class="stat-card"><div class="stat-value">${emoji} ${escapeHtml(favoriteType[0])}</div><div class="stat-label">Favorite Type</div></div>`);
  }
  if (rarestCard && rarestCard.rarity) {
    cards.push(`<div class="stat-card highlight"><div class="stat-value">${escapeHtml(rarestCard.rarity)}</div><div class="stat-label">Rarest Card: ${escapeHtml(rarestCard.name)}</div></div>`);
  }
  if (mostValuable) {
    cards.push(`<div class="stat-card highlight"><div class="stat-value">${formatPrice(mostValuable.price)}</div><div class="stat-label">Most Valuable: ${escapeHtml(mostValuable.name)}</div></div>`);
  }

  return cards.join("");
}

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// init
searchStatus.textContent = "Type a Pokémon name to find cards!";
