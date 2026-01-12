import "./style.css";

// State
let gameId = localStorage.getItem("gameId");
let playerId = localStorage.getItem("playerId");
let playerState = null;
let ws: WebSocket | null = null;

// DOM Elements
const joinModal = document.getElementById("join-modal");
const btnJoin = document.getElementById("btn-join");
const inputName = document.getElementById("join-name") as HTMLInputElement;
const inputColor = document.getElementById("join-color") as HTMLSelectElement;

const phaseDisplay = document.getElementById("phase-display");
const goldDisplay = document.getElementById("gold-display");
const playerDisplay = document.getElementById("player-display");
const actionFeedback = document.getElementById("action-feedback");
const kingdomBoard = document.getElementById("kingdom-board");

const btnDrawLand = document.getElementById("btn-draw-land");
const btnNextPhase = document.getElementById("btn-next-phase");

// --- Initialization ---

async function init() {
  if (gameId && playerId) {
    joinModal?.classList.add("hidden");
    connectWebSocket();
    // Fetch initial state? WS will send it on connect.
  } else {
    // Show join modal (default)
  }
}

// --- Join Game ---

btnJoin?.addEventListener("click", async () => {
  const name = inputName.value;
  const color = inputColor.value;
  if (!name) return alert("Name required");

  // 1. Create Game (if needed, purely for demo we'll create one if none exists or just use a fixed one?)
  // For this demo, let's just CREATE a new game every time we join 'fresh' or try to join a hardcoded one?
  // Let's first create a game.
  try {
    let gid = gameId;
    if (!gid) {
      const res = await fetch("/api/games", { method: "POST" });
      const data = await res.json();
      gid = data.gameId;
      gameId = gid;
      if (!gameId) throw new Error("No game ID returned"); // Type guard
      localStorage.setItem("gameId", gameId);
    }

    // 2. Join Game
    const pid = crypto.randomUUID(); // Generate local ID
    const joinRes = await fetch(`/api/games/${gid}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: pid, name, color }),
    });

    if (!joinRes.ok) throw new Error(await joinRes.text());

    playerId = pid;
    localStorage.setItem("playerId", playerId); // Persist

    // 3. Start Game (Auto-start for demo simplicity if we are the first/only?)
    // Let's just try to start it.
    await fetch(`/api/games/${gid}/start`, { method: "POST" });

    joinModal?.classList.add("hidden");
    connectWebSocket();
  } catch (e: any) {
    alert("Error joining: " + e.message);
  }
});

// --- WebSocket ---

function connectWebSocket() {
  if (!gameId || !playerId) return;

  // Use pure WS path, Vite proxy handles the host/port
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host; // This is localhost:5173
  // Proxy forwards /ws -> localhost:3000/ws
  ws = new WebSocket(`${protocol}//${host}/ws/${gameId}?playerId=${playerId}`);

  ws.onopen = () => {
    console.log("Connected to Game Server");
    updateStatus("Connected");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log("WS Message:", msg);
    if (msg.type === "GAME_STATE") {
      updateUI(msg);
    }
  };

  ws.onclose = () => {
    console.log("Disconnected");
    updateStatus("Disconnected");
  };
}

// --- UI Actions ---

const btnDrawUnit = document.getElementById("btn-draw-unit");

// State for Interaction
let selectedUnitId: string | null = null;

// --- UI Actions ---

btnDrawLand?.addEventListener("click", async () => {
  if (!gameId || !playerId) return;
  showFeedback("Drawing land...");
  try {
    const res = await fetch(`/api/games/${gameId}/draw-land`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Land acquired!", "text-green-600");
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

btnDrawUnit?.addEventListener("click", async () => {
  if (!gameId || !playerId) return;
  showFeedback("Drawing unit...");
  try {
    const res = await fetch(`/api/games/${gameId}/draw-thing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Unit acquired!", "text-green-600");
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

btnNextPhase?.addEventListener("click", async () => {
  if (!gameId) return;
  try {
    const res = await fetch(`/api/games/${gameId}/next-phase`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

// --- Rendering ---

function updateUI(state: any) {
  if (state.game) {
    if (phaseDisplay)
      phaseDisplay.textContent = `Phase: ${state.game.current_phase}`;
  }

  // Render Hand and Kingdom
  // Note: state.players currently only has partial data, we need full state.
  // The backend was updated to send { game, players }, but players might not include nested things/territories
  // unless we specifically query for them or join them.
  // Actually, getPlayersInGame logic needs to be checked if it returns related data.
  // IF NOT, we might not see the units/territories.
  // Let's check getPlayersInGame or implement separate fetching if needed.
  // Assuming the payload includes or we fetch separately.
  // For now, let's look at what we have.
  // Ideally, we want the payload to contain:
  // players: [ { ..., territories: [], things: [] } ]

  // Checking src/db/queries.ts (not visible but assumed) or we can just fetch distinct endpoints.
  // Let's assume for now we need to fetch 'my' assets or the WS sends them.

  // Implementation of specific rendering:
  if (!state.players) return;
  const me = state.players.find((p: any) => p.id === playerId);

  if (me) {
    playerState = me;
    if (goldDisplay) goldDisplay.textContent = `Gold: ${me.gold}`;
    if (playerDisplay) playerDisplay.textContent = `Player: ${me.name}`;

    // Filter things for Hand (location === 'HAND')
    const hand = (me.things || []).filter((t: any) => t.location === "HAND");
    renderHand(hand);
    renderKingdom(me.territories || []);
  }
}

function renderHand(units: any[]) {
  const container = document.getElementById("player-hand");
  if (!container) return;
  container.innerHTML = "";

  if (units.length === 0) {
    container.innerHTML = `<div class="w-32 shrink-0 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-gray-400">Empty</div>`;
    return;
  }

  units.forEach((unit) => {
    const div = document.createElement("div");
    div.className = `w-32 shrink-0 rounded-lg border-2 border-solid p-4 text-center cursor-pointer transition select-none ${selectedUnitId === unit.id ? "border-blue-500 bg-blue-50 shadow-md transform -translate-y-1" : "border-gray-200 bg-white hover:border-gray-400"}`;
    div.innerHTML = `<div class="font-bold text-sm">${unit.template_id}</div><div class="text-xs text-gray-500">Combat: ?</div>`;
    div.onclick = () => {
      if (selectedUnitId === unit.id) {
        selectedUnitId = null; // Deselect
      } else {
        selectedUnitId = unit.id;
      }
      renderHand(units); // Re-render to update selection
    };
    container.appendChild(div);
  });
}

function renderKingdom(territories: any[]) {
  const container = document.getElementById("kingdom-board");
  if (!container) return;
  container.innerHTML = "";

  if (territories.length === 0) {
    container.innerHTML = `<div class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center text-gray-400 col-span-full">No territories owned.</div>`;
    return;
  }

  territories.forEach((terr) => {
    const div = document.createElement("div");
    div.className =
      "rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition cursor-pointer";
    // Show units on this territory?
    // We need 'things' that are on this territory. Handled by backend structure?
    // For now just show terrain.
    const unitsHere = terr.units || [];

    div.innerHTML = `
            <div class="font-bold text-indigo-700 uppercase tracking-wide text-xs mb-2">${terr.terrain_type}</div>
            <div class="text-xs text-gray-500">Units: ${unitsHere.length}</div>
            <div class="mt-2 space-y-1">
                ${unitsHere.map((u: any) => `<div class="bg-indigo-50 text-indigo-800 text-xs px-2 py-1 rounded">${u.template_id}</div>`).join("")}
            </div>
        `;

    div.onclick = async () => {
      if (selectedUnitId) {
        // Try to deploy
        await deployUnit(selectedUnitId, terr.id);
      }
    };

    container.appendChild(div);
  });
}

async function deployUnit(thingId: string, territoryId: string) {
  if (!gameId || !playerId) return;
  showFeedback("Deploying unit...");
  try {
    const res = await fetch(`/api/games/${gameId}/deploy-thing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, thingId, territoryId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Unit Deployed!", "text-green-600");
    selectedUnitId = null; // Clear selection
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
}

function updateStatus(status: string) {
  // console.log(status);
}

function showFeedback(msg: string, colorClass = "text-gray-500") {
  if (actionFeedback) {
    actionFeedback.textContent = msg;
    actionFeedback.className = `text-sm mt-2 h-5 ${colorClass}`;
    setTimeout(() => {
      actionFeedback.textContent = "";
    }, 3000);
  }
}

init();
