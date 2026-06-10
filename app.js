const API_BASE = "https://api.tcgdex.net/v2/en";
const COLLECTION_KEY_PREFIX = "pokemonCardCollection_";
const PROFILES = ["Reece", "Aria", "Kyra"];
const ACTIVE_PROFILE_KEY = "pokemonCardActiveProfile";

// ---------- Profiles ----------
const profileButtons = document.querySelectorAll(".profile-btn");

function getActiveProfile() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || PROFILES[0];
}

function setActiveProfile(name) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, name);
  profileButtons.forEach((b) => b.classList.toggle("active", b.dataset.profile === name));
  if (document.getElementById("collection-tab").classList.contains("active")) {
    renderCollection();
  }
}

profileButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveProfile(btn.dataset.profile));
});

setActiveProfile(getActiveProfile());

// ---------- Tabs ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
    if (btn.dataset.tab === "collection") renderCollection();
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
    const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(cardId)}`);
    if (!res.ok) throw new Error("Not found");
    const card = await res.json();
    detailBody.innerHTML = renderCardDetailHtml(card);
    const collectBtn = document.getElementById("collect-btn");
    collectBtn.addEventListener("click", () => toggleCollected(card, collectBtn));
  } catch (err) {
    detailBody.innerHTML = `<div class="empty-msg">Couldn't load this card. Try again!</div>`;
  }
}

function renderCardDetailHtml(card) {
  const types = (card.types || []).join(", ") || "—";
  const setName = card.set ? card.set.name : "—";
  const price = getBestPrice(card.pricing);
  const isCollected = isInCollection(card.id);

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

    ${
      price
        ? `<div class="price-box">
            <div>Estimated Value</div>
            <div class="price-value">${price}</div>
          </div>`
        : ""
    }

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

function formatPrice(priceData) {
  if (!priceData) return null;
  return `${priceData.symbol}${priceData.value.toFixed(2)} ${priceData.currency}`;
}

function getBestPrice(pricing) {
  return formatPrice(getBestPriceData(pricing));
}

// ---------- Collection (localStorage) ----------
function getCollection() {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_KEY_PREFIX + getActiveProfile())) || [];
  } catch {
    return [];
  }
}

function saveCollection(items) {
  localStorage.setItem(COLLECTION_KEY_PREFIX + getActiveProfile(), JSON.stringify(items));
}

function isInCollection(cardId) {
  return getCollection().some((c) => c.id === cardId);
}

function toggleCollected(card, btn) {
  let items = getCollection();
  if (items.some((c) => c.id === card.id)) {
    items = items.filter((c) => c.id !== card.id);
    btn.classList.remove("added");
    btn.textContent = "☆ Add to My Collection";
  } else {
    items.push({
      id: card.id,
      name: card.name,
      image: card.image,
      set: card.set ? card.set.name : "",
      rarity: card.rarity || null,
      types: card.types || [],
      price: getBestPriceData(card.pricing),
    });
    btn.classList.add("added");
    btn.textContent = "★ In My Collection (tap to remove)";
  }
  saveCollection(items);
}

// ---------- Collection Tab ----------
const collectionStatus = document.getElementById("collection-status");
const collectionStats = document.getElementById("collection-stats");
const collectionResults = document.getElementById("collection-results");

const TYPE_EMOJI = {
  Grass: "🌿", Fire: "🔥", Water: "💧", Lightning: "⚡", Psychic: "🔮",
  Fighting: "🥊", Darkness: "🌑", Metal: "⚙️", Fairy: "✨", Dragon: "🐉",
  Colorless: "⭐",
};

function renderCollection() {
  const items = getCollection();
  const profile = getActiveProfile();
  if (!items.length) {
    collectionStatus.textContent = `${profile} has no cards yet! Find a card and tap "Add to My Collection".`;
    collectionStats.innerHTML = "";
    collectionResults.innerHTML = "";
    return;
  }
  collectionStatus.textContent = `${profile}'s collection: ${items.length} card${items.length === 1 ? "" : "s"}`;
  collectionStats.innerHTML = renderStatsHtml(items);
  renderCardGrid(collectionResults, items);
}

function renderStatsHtml(items) {
  // Total estimated value (USD only, since that's the most common currency)
  const usdItems = items.filter((c) => c.price && c.price.currency === "USD");
  const totalValue = usdItems.reduce((sum, c) => sum + c.price.value, 0);

  // Unique sets
  const uniqueSets = new Set(items.map((c) => c.set).filter(Boolean));

  // Favorite type (most common)
  const typeCounts = {};
  items.forEach((c) => (c.types || []).forEach((t) => (typeCounts[t] = (typeCounts[t] || 0) + 1)));
  const favoriteType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  // Most valuable card
  let mostValuable = null;
  usdItems.forEach((c) => {
    if (!mostValuable || c.price.value > mostValuable.price.value) mostValuable = c;
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
  cards.push(`<div class="stat-card"><div class="stat-value">${uniqueSets.size}</div><div class="stat-label">Sets Collected</div></div>`);
  if (totalValue > 0) {
    cards.push(`<div class="stat-card highlight"><div class="stat-value">$${totalValue.toFixed(2)}</div><div class="stat-label">Estimated Value</div></div>`);
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
