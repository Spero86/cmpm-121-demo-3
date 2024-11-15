import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// Interfaces
interface LatLngCell {
  i: number;
  j: number;
}

interface CacheCoin {
  original: LatLngCell;
  serial: number;
}

interface GameState {
  map: leaflet.Map;
  playerMarker: leaflet.Marker;
  playerPath: leaflet.LatLng[];
  polyline: leaflet.Polyline;
  playerPoints: number;
  playerInventory: CacheCoin[];
  cacheCoins: Map<string, CacheCoin[]>;
  directions: HTMLDivElement;
  geolocationWatchId: number | null;
}

// Constants
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Cache Icon
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

// Initialize Game State
function initializeGameState(): GameState {
  const map = leaflet.map(document.getElementById("map")!, {
    center: OAKES_CLASSROOM,
    zoom: GAMEPLAY_ZOOM_LEVEL,
    minZoom: GAMEPLAY_ZOOM_LEVEL,
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map);

  const playerMarker = leaflet.marker(OAKES_CLASSROOM).addTo(map);
  playerMarker.bindTooltip("That's you!");

  const polyline = leaflet.polyline([OAKES_CLASSROOM], { color: "blue" }).addTo(
    map,
  );

  return {
    map,
    playerMarker,
    playerPath: [OAKES_CLASSROOM],
    polyline,
    playerPoints: 0,
    playerInventory: [],
    cacheCoins: new Map(),
    directions: document.querySelector<HTMLDivElement>("#statusPanel")!,
    geolocationWatchId: null,
  };
}

// Utility Functions
function latLngToCell(lat: number, lng: number): LatLngCell {
  return {
    i: Math.floor(lat * 1e4),
    j: Math.floor(lng * 1e4),
  };
}

function spawnCache(
  state: GameState,
  i: number,
  j: number,
  icon: leaflet.Icon | leaflet.DivIcon,
): void {
  const marker = leaflet
    .marker([i * TILE_DEGREES, j * TILE_DEGREES], { icon })
    .addTo(state.map);

  marker.bindPopup(() => {
    const cacheKey = `${i},${j}`;
    const coins = state.cacheCoins.get(cacheKey) ?? [];
    if (coins.length === 0) {
      const initialCoins = Math.floor(luck([i, j, "coins"].toString()) * 10);
      for (let serial = 0; serial < initialCoins; serial++) {
        coins.push({ original: { i, j }, serial });
      }
      state.cacheCoins.set(cacheKey, coins);
    }

    const popupDiv = document.createElement("div");
    const list = document.createElement("ul");
    coins.forEach((coin, index) => {
      const listItem = document.createElement("li");
      listItem.innerHTML =
        `${coin.original.i}:${coin.original.j}#${coin.serial}`;
      const collectButton = document.createElement("button");
      collectButton.innerHTML = "collect";
      collectButton.addEventListener("click", () => {
        coins.splice(index, 1);
        state.playerPoints++;
        state.playerInventory.push(coin);
        state.cacheCoins.set(cacheKey, coins);
        updatePopup();
      });
      listItem.appendChild(collectButton);
      list.appendChild(listItem);
    });

    popupDiv.innerHTML = `Cache ${cacheKey}`;
    popupDiv.appendChild(list);

    const depositButton = document.createElement("button");
    depositButton.innerHTML = "deposit";
    depositButton.addEventListener("click", () => {
      if (state.playerPoints > 0 && state.playerInventory.length > 0) {
        const coin = state.playerInventory.pop()!;
        coins.push(coin);
        state.playerPoints--;
        state.cacheCoins.set(cacheKey, coins);
        updatePopup();
      }
    });
    popupDiv.appendChild(depositButton);

    const updatePopup = () => {
      state.directions.innerHTML = `${state.playerPoints} points accumulated.`;
      list.innerHTML = "";
      coins.forEach((coin) => {
        const listItem = document.createElement("li");
        listItem.innerHTML =
          `${coin.original.i}:${coin.original.j}#${coin.serial}`;
        const collectButton = document.createElement("button");
        collectButton.innerHTML = "collect";
        collectButton.addEventListener("click", () => {
          coins.splice(coins.indexOf(coin), 1);
          state.playerPoints++;
          state.playerInventory.push(coin);
          state.cacheCoins.set(cacheKey, coins);
          updatePopup();
        });
        listItem.appendChild(collectButton);
        list.appendChild(listItem);
      });
    };

    return popupDiv;
  });
}

function movePlayer(state: GameState, deltaI: number, deltaJ: number): void {
  const newLatLng = leaflet.latLng(
    state.playerMarker.getLatLng().lat + deltaI * TILE_DEGREES,
    state.playerMarker.getLatLng().lng + deltaJ * TILE_DEGREES,
  );

  state.map.setView(newLatLng);
  state.playerMarker.setLatLng(newLatLng);
  state.playerPath.push(newLatLng);
  state.polyline.setLatLngs(state.playerPath);

  const { i: newI, j: newJ } = latLngToCell(newLatLng.lat, newLatLng.lng);
  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      const cellI = newI + di;
      const cellJ = newJ + dj;
      if (luck([cellI, cellJ].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(state, cellI, cellJ, cacheIcon);
      }
    }
  }
}

function resetGame(state: GameState): void {
  const confirmation = prompt(
    "Erase current game state? Please type 'yes' to confirm.",
  );
  if (confirmation === "yes") {
    state.map.setView(OAKES_CLASSROOM);
    state.playerMarker.setLatLng(OAKES_CLASSROOM);
    state.playerPath.length = 0;
    state.playerPath.push(OAKES_CLASSROOM);
    state.polyline.setLatLngs(state.playerPath);
    state.playerPoints = 0;
    state.playerInventory.length = 0;
    state.cacheCoins.clear();
    state.directions.innerHTML = "No points accumulated.";
    localStorage.clear();
  }
}

// Initialization
const state = initializeGameState();

// Example Usage
movePlayer(state, 1, 0); // Move north
resetGame(state);
