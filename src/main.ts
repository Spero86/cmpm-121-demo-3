import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

const PLAYER_LAT = 36.98949379578401;
const PLAYER_LNG = -122.06277128548504;
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

interface Cell {
  i: number;
  j: number;
}

interface Coin {
  cell: Cell;
  serial: number;
}

interface Cache {
  cell: Cell;
  coins: Coin[];
  marker: leaflet.Marker;
  toMemento(): string;
  fromMemento(memento: string): void;
}

const caches: Map<string, Cache> = new Map();
const knownTiles: Map<string, Cell> = new Map();
let playerCoins: Coin[] = [];
let playerLat = PLAYER_LAT;
let playerLng = PLAYER_LNG;

let locationWatcher: number | null = null;
let movementHistory: leaflet.Polyline | null = null;
const locationHistory: [number, number][] = [];

const map = leaflet.map("map", {
  center: [PLAYER_LAT, PLAYER_LNG],
  zoom: 19,
  minZoom: 19,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerIcon = leaflet.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const playerMarker = leaflet.marker([PLAYER_LAT, PLAYER_LNG], {
  icon: playerIcon,
});
playerMarker.bindTooltip("Current Location");
playerMarker.addTo(map);

const cacheIcon = leaflet.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function latLngToCell(lat: number, lng: number): Cell {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  const key = `${i},${j}`;
  if (!knownTiles.has(key)) {
    knownTiles.set(key, { i, j });
  }
  return knownTiles.get(key)!;
}

function initializeCache(
  cell: Cell,
  lat: number,
  lng: number,
  coins: Coin[],
): Cache {
  const cacheMarker = leaflet.marker([lat, lng], {
    icon: cacheIcon,
  });

  const cache: Cache = {
    cell,
    coins,
    marker: cacheMarker,
    toMemento() {
      return JSON.stringify(this.coins);
    },
    fromMemento(memento: string) {
      this.coins = JSON.parse(memento);
    },
  };

  cacheMarker.bindPopup(createCachePopup(cache));
  return cache;
}

function createCache(cell: Cell, lat: number, lng: number) {
  const coinCount = Math.floor(luck(`${cell.i},${cell.j},coins`) * 10);
  const coins: Coin[] = Array.from(
    { length: coinCount },
    (_, serial) => ({ cell, serial }),
  );

  const cache = initializeCache(cell, lat, lng, coins);

  const cacheId = `${cell.i},${cell.j}`;
  caches.set(cacheId, cache);
  cache.marker.addTo(map);
}

function renderCachePopupContent(cache: Cache): HTMLDivElement {
  const container = document.createElement("div");

  // Cache location detail
  const locationInfo = document.createElement("p");
  locationInfo.textContent = `Cache at (${cache.cell.i}, ${cache.cell.j})`;
  container.appendChild(locationInfo);

  // Coin list
  const coinListContainer = document.createElement("p");
  coinListContainer.innerHTML = "Coins: ";
  const coinListSpan = document.createElement("span");
  coinListSpan.id = `coins-${cache.cell.i}-${cache.cell.j}`;
  cache.coins.forEach((coin) => {
    coinListSpan.appendChild(renderCoinElement(coin)); // Use reusable coin rendering here
    coinListSpan.appendChild(document.createTextNode(", ")); // Add comma after each coin
  });
  coinListContainer.appendChild(coinListSpan);
  container.appendChild(coinListContainer);

  // Collect Button
  const collectButton = document.createElement("button");
  collectButton.className = "collect-btn";
  collectButton.textContent = "Collect";
  collectButton.addEventListener("click", () => collectCoins(cache.cell));
  container.appendChild(collectButton);

  // Deposit Button
  const depositButton = document.createElement("button");
  depositButton.className = "deposit-btn";
  depositButton.textContent = "Deposit";
  depositButton.addEventListener("click", () => depositCoins(cache.cell));
  container.appendChild(depositButton);

  return container;
}

function createCachePopup(cache: Cache): HTMLElement {
  return renderCachePopupContent(cache); // Reusable popup renderer
}

function getCacheByCell(cell: Cell): Cache | undefined {
  const cacheId = `${cell.i},${cell.j}`;
  return caches.get(cacheId);
}

function transferCoinsFromCacheToPlayer(cache: Cache) {
  playerCoins.push(...cache.coins);
  cache.coins = [];
}

function updateCacheUI(cache: Cache) {
  cache.marker.setPopupContent(createCachePopup(cache));
}

function collectCoins(cell: Cell) {
  const cache = getCacheByCell(cell);
  if (cache && cache.coins.length > 0) {
    transferCoinsFromCacheToPlayer(cache);
    updateCacheUI(cache);
    updateInventoryDisplay();
    saveGameState();
  }
}

function depositCoins(cell: Cell) {
  const cacheId = `${cell.i},${cell.j}`;
  const cache = caches.get(cacheId);
  if (cache && playerCoins.length > 0) {
    cache.coins.push(...playerCoins);
    playerCoins = [];
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
    saveGameState();
  }
}

function renderCoinElement(coin: Coin): HTMLElement {
  const coinId = `${coin.cell.i}:${coin.cell.j}#${coin.serial}`;
  const coinElement = document.createElement("span");
  coinElement.className = "coin-id";
  coinElement.style.cursor = "pointer";
  coinElement.style.textDecoration = "underline";
  coinElement.dataset.lat = (coin.cell.i * TILE_DEGREES).toString();
  coinElement.dataset.lng = (coin.cell.j * TILE_DEGREES).toString();
  coinElement.textContent = coinId;

  coinElement.addEventListener("click", () => {
    map.setView([
      parseFloat(coinElement.dataset.lat || "0"),
      parseFloat(coinElement.dataset.lng || "0"),
    ]);
  });

  return coinElement;
}

function updateInventoryDisplay() {
  const inventory = document.getElementById("inventory");
  if (inventory) {
    // Clear existing inventory content
    inventory.innerHTML = `Current Coins: `;

    // Add coins dynamically
    playerCoins.forEach((coin) => {
      const coinElement = renderCoinElement(coin);
      inventory.appendChild(coinElement);
    });
  }
}

function generateCaches(centerLat: number, centerLng: number) {
  for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
      const lat = centerLat + i * TILE_DEGREES;
      const lng = centerLng + j * TILE_DEGREES;
      const cell = latLngToCell(lat, lng);
      const cacheId = `${cell.i},${cell.j}`;

      if (
        !caches.has(cacheId) &&
        luck(`cache_at_${cell.i},${cell.j}`) < CACHE_SPAWN_PROBABILITY
      ) {
        createCache(cell, lat, lng);
      }
    }
  }
}

function loadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const state = JSON.parse(savedState);
    playerLat = state.playerLat;
    playerLng = state.playerLng;
    playerCoins = state.playerCoins;
    locationHistory.push(...state.locationHistory);

    caches.clear();

    state.caches.forEach(
      (cacheState: { lat: number; lng: number; memento: string }) => {
        const cell = latLngToCell(cacheState.lat, cacheState.lng);
        const coins: Coin[] = [];
        const cache = initializeCache(
          cell,
          cacheState.lat,
          cacheState.lng,
          coins,
        );

        cache.fromMemento(cacheState.memento);
        caches.set(`${cell.i},${cell.j}`, cache);
      },
    );

    playerMarker.setLatLng([playerLat, playerLng]);
    map.setView([playerLat, playerLng]);
    updateVisibleCaches();
    updateInventoryDisplay();
    drawMovementHistory();
  } else {
    generateCaches(playerLat, playerLng);
  }
}

function saveGameState() {
  const state = {
    playerLat,
    playerLng,
    playerCoins,
    locationHistory,
    caches: Array.from(caches.values()).map((cache) => ({
      lat: cache.cell.i * TILE_DEGREES,
      lng: cache.cell.j * TILE_DEGREES,
      memento: cache.toMemento(),
    })),
  };
  localStorage.setItem("gameState", JSON.stringify(state));
}

function drawMovementHistory() {
  if (movementHistory) {
    map.removeLayer(movementHistory);
  }
  movementHistory = leaflet.polyline(locationHistory, {
    color: "blue",
    weight: 2,
    opacity: 0.5,
  }).addTo(map);
}

function setPlayerCoordinates(lat: number, lng: number) {
  playerLat = lat;
  playerLng = lng;
}

function updateMapView(lat: number, lng: number) {
  playerMarker.setLatLng([lat, lng]);
  map.setView([lat, lng]);
}

function logLocationHistory(lat: number, lng: number) {
  locationHistory.push([lat, lng]);
}

function updateCachesAndMap(lat: number, lng: number) {
  generateCaches(lat, lng);
  updateVisibleCaches();
}

function updatePlayerPosition(lat: number, lng: number) {
  setPlayerCoordinates(lat, lng);
  updateMapView(lat, lng);
  logLocationHistory(lat, lng);
  drawMovementHistory();
  updateCachesAndMap(lat, lng);
  saveGameState();
}

function startLocationTracking() {
  if ("geolocation" in navigator) {
    locationWatcher = navigator.geolocation.watchPosition(
      (position) => {
        updatePlayerPosition(
          position.coords.latitude,
          position.coords.longitude,
        );
      },
      (error) => {
        console.error("Error getting location:", error);
        stopLocationTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    );

    const geolocateButton = document.getElementById("geolocate");
    if (geolocateButton) {
      geolocateButton.style.backgroundColor = "#646cff";
    }
  } else {
    alert("Geolocation is not supported by your browser");
  }
}

function stopLocationTracking() {
  if (locationWatcher !== null) {
    navigator.geolocation.clearWatch(locationWatcher);
    locationWatcher = null;

    const geolocateButton = document.getElementById("geolocate");
    if (geolocateButton) {
      geolocateButton.style.backgroundColor = "";
    }
  }
}

function resetGameState() {
  if (
    confirm(
      "Reset game? This will clear all caches, coins, and player location.",
    )
  ) {
    localStorage.removeItem("gameState");
    playerLat = PLAYER_LAT;
    playerLng = PLAYER_LNG;
    playerCoins = [];
    locationHistory.length = 0;
    caches.clear();
    if (movementHistory) {
      map.removeLayer(movementHistory);
      movementHistory = null;
    }
    stopLocationTracking();
    generateCaches(playerLat, playerLng);
    updateVisibleCaches();
    updateInventoryDisplay();
  }
}

function movePlayer(dLat: number, dLng: number) {
  updatePlayerPosition(playerLat + dLat, playerLng + dLng);
}

function updateVisibleCaches() {
  caches.forEach((cache, _cacheId) => {
    const distance = Math.sqrt(
      Math.pow(cache.cell.i * TILE_DEGREES - playerLat, 2) +
        Math.pow(cache.cell.j * TILE_DEGREES - playerLng, 2),
    );
    if (distance <= NEIGHBORHOOD_SIZE * TILE_DEGREES) {
      cache.marker.addTo(map);
    } else {
      map.removeLayer(cache.marker);
    }
  });
}

loadGameState();
updateInventoryDisplay();
updateVisibleCaches();

function addEventListenerToElement(
  id: string,
  eventType: string,
  callback: () => void,
) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener(eventType, callback);
  }
}

addEventListenerToElement(
  "moveNorth",
  "click",
  () => movePlayer(TILE_DEGREES, 0),
);
addEventListenerToElement(
  "moveSouth",
  "click",
  () => movePlayer(-TILE_DEGREES, 0),
);
addEventListenerToElement(
  "moveWest",
  "click",
  () => movePlayer(0, -TILE_DEGREES),
);
addEventListenerToElement(
  "moveEast",
  "click",
  () => movePlayer(0, TILE_DEGREES),
);

addEventListenerToElement("geolocate", "click", () => {
  if (locationWatcher === null) {
    startLocationTracking();
  } else {
    stopLocationTracking();
  }
});

addEventListenerToElement("reset", "click", resetGameState);
