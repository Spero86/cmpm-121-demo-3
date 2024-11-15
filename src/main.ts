import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// Interfaces
interface Cache {
  key: string;
  coins: number;
}

interface Coordinates {
  i: number;
  j: number;
}

// Constants
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Initialize Map
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Player Marker
const playerMarker = leaflet.marker(OAKES_CLASSROOM).addTo(map);
playerMarker.bindTooltip("Current Location", {
  permanent: true,
  direction: "right",
});

// Status Panel
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points accumulated";

// Player State
let playerPoints = 0;

// Cache Management
const cacheCoins = new Map<string, number>();

// Helper Functions
const createPopupContent = (cache: Cache): HTMLDivElement => {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div>There is a cache here at "${cache.key}". It has <span id="coins">${cache.coins}</span> coins.</div>
    <button id="collect">Collect</button>
    <button id="deposit">Deposit</button>`;
  return popupDiv;
};

const updateStatusPanel = (): void => {
  statusPanel.innerHTML = `${playerPoints} points accumulated`;
};

const handleCollect = (cache: Cache, popupDiv: HTMLDivElement): void => {
  if (cache.coins > 0) {
    cache.coins--;
    playerPoints++;
    cacheCoins.set(cache.key, cache.coins);
    popupDiv.querySelector<HTMLSpanElement>("#coins")!.innerHTML = cache.coins
      .toString();
    updateStatusPanel();
  }
};

const handleDeposit = (cache: Cache, popupDiv: HTMLDivElement): void => {
  if (playerPoints > 0) {
    cache.coins++;
    playerPoints--;
    cacheCoins.set(cache.key, cache.coins);
    popupDiv.querySelector<HTMLSpanElement>("#coins")!.innerHTML = cache.coins
      .toString();
    updateStatusPanel();
  }
};

// Cache Spawning
const spawnCache = (coords: Coordinates): void => {
  const { i, j } = coords;
  const origin = OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  const rect = leaflet.rectangle(bounds).addTo(map);
  rect.bindPopup(() => {
    const cacheKey = `${i},${j}`;
    const coins = cacheCoins.get(cacheKey) ??
      Math.floor(luck([i, j, "coins"].toString()) * 10);
    cacheCoins.set(cacheKey, coins);

    const cache: Cache = { key: cacheKey, coins };
    const popupDiv = createPopupContent(cache);

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => handleCollect(cache, popupDiv),
    );
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => handleDeposit(cache, popupDiv),
    );

    return popupDiv;
  });
};

// Generate Neighborhood Caches
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache({ i, j });
    }
  }
}
