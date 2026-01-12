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
    updateStatus("Disconnected (Server Offline?)");
    showFeedback("Connection lost. Is the server running?", "text-red-600 font-bold");
  };

  ws.onerror = (err) => {
    console.error("WS Error:", err);
    updateStatus("Connection Error");
    showFeedback("Failed to connect to server.", "text-red-600 font-bold");
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
  // Check for invalid session (Game deleted or Player deleted)
  if (!state.game || (state.players && !state.players.find((p: any) => p.id === playerId))) {
    console.warn("Invalid session detected. Resetting...");
    localStorage.removeItem("gameId");
    localStorage.removeItem("playerId");
    location.reload(); // Reload to show join modal
    return;
  }

  if (state.game) {
    if (phaseDisplay)
      phaseDisplay.textContent = `Phase: ${state.game.current_phase}`;

    if (state.game.combat_state) {
       const cs = JSON.parse(state.game.combat_state);
       renderCombatModal(cs);
    } else {
       document.getElementById("combat-modal")?.remove();
    }
  }

  if (!state.players) return;
  
  // Render ME
  const me = state.players.find((p: any) => p.id === playerId);
  if (me) {
    playerState = me;
    if (goldDisplay) goldDisplay.textContent = `Gold: ${me.gold}`;
    if (playerDisplay) playerDisplay.textContent = `Player: ${me.name}`;

    // Filter things for Hand (location === 'HAND')
    const hand = (me.things || []).filter((t: any) => t.location === "HAND");
    renderHand(hand);
  }

  // Render World (All Players)
  renderWorld(state.players);
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

// Global state for attack planning
let sourceTerritoryId: string | null = null;

function renderWorld(players: any[]) {
    const container = document.getElementById("kingdom-board");
    if (!container) return;
    container.innerHTML = "";
    
    // Flatten territories
    const allTerritories: any[] = [];
    players.forEach(p => {
        if(p.territories) {
            p.territories.forEach((t: any) => {
                t._ownerName = p.name;
                t._ownerId = p.id;
                allTerritories.push(t);
            });
        }
    });

    if (allTerritories.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-400">No territories claimed yet.</div>`;
        return;
    }

    allTerritories.forEach(terr => {
        const isMine = terr._ownerId === playerId;
        const div = document.createElement("div");
        
        let borderClass = isMine ? "border-indigo-200 bg-white" : "border-red-200 bg-red-50";
        if (sourceTerritoryId === terr.id) borderClass = "border-green-500 ring-2 ring-green-200 bg-green-50";

        div.className = `rounded-lg border p-4 shadow-sm hover:shadow-md transition cursor-pointer relative ${borderClass}`;
        
        const unitsHere = terr.units || [];
        const fortLevel = terr.fortification_level || 0;
        const fortLabel = fortLevel > 0 ? `<span class="ml-1 text-xs">🏰${fortLevel}</span>` : '';

        // Add Upgrade Button if INCOME and Mine
        let upgradeBtn = '';
        const phase = document.getElementById("phase-display")?.textContent;
        if (isMine && phase?.includes("INCOME") && fortLevel < 4) {
             upgradeBtn = `<button class="btn-upgrade mt-2 w-full rounded bg-yellow-500 px-2 py-1 text-xs font-bold text-white hover:bg-yellow-600" data-tid="${terr.id}">Upgrade (5g+)</button>`;
        }
        
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold uppercase text-xs tracking-wide ${isMine ? 'text-indigo-700' : 'text-red-700'}">${terr.terrain_type} ${fortLabel}</span>
                <span class="text-[10px] text-gray-500">${terr._ownerName}</span>
            </div>
            <div class="text-xs text-gray-500 mb-2">Units: ${unitsHere.length}</div>
            <div class="space-y-1">
                ${unitsHere.map((u: any) => `<div class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded border border-gray-200">${u.template_id}</div>`).join("")}
            </div>
            ${upgradeBtn}
        `;

        // Interactions
        div.onclick = async (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('btn-upgrade')) {
                e.stopPropagation();
                await upgradeStructure(target.dataset.tid!);
                return;
            }

            // Deployment Logic
            if (selectedUnitId && isMine) {
                await deployUnit(selectedUnitId, terr.id);
                return;
            }

            // Attack Logic
            if (phase?.includes("WAR")) {
                if (isMine) {
                    // Select as source
                    sourceTerritoryId = terr.id;
                    renderWorld(players); // Re-render to show selection
                } else if (sourceTerritoryId) {
                    // Attack this target!
                    if (confirm(`Attack ${terr._ownerName}'s ${terr.terrain_type} from your selected territory?`)) {
                        await declareAttack(sourceTerritoryId, terr.id);
                        sourceTerritoryId = null; // Reset
                    }
                }
            }
        };

        container.appendChild(div);
    });
}

async function upgradeStructure(territoryId: string) {
    if (!confirm("Upgrade structure? Cost increases with level.")) return;
    try {
        const res = await fetch(`/api/games/${gameId}/build`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId, territoryId }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showFeedback("Upgraded!", "text-yellow-600");
    } catch (e: any) {
        showFeedback(e.message, "text-red-500");
    }
}

function renderCombatModal(state: any) {
    let modal = document.getElementById("combat-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "combat-modal";
        modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="w-[500px] rounded-xl bg-white p-6 shadow-2xl">
            <h2 class="mb-4 text-2xl font-bold text-red-600 flex items-center gap-2">
                <span>⚔️</span> Combat Active
            </h2>
            
            <div class="mb-4 space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-60 overflow-y-auto font-mono text-sm">
                ${state.logs.map((l: string) => `<div class="border-b border-gray-100 last:border-0 pb-1">${l}</div>`).join("")}
            </div>

            <div class="flex justify-between items-center bg-gray-100 p-3 rounded mb-4">
                 <div class="text-center">
                    <div class="text-xs text-gray-500">Stage</div>
                    <div class="font-bold">${state.stage}</div>
                 </div>
                 <div class="text-center">
                    <div class="text-xs text-gray-500">Round</div>
                    <div class="font-bold">${state.currentRound}</div>
                 </div>
            </div>

            <button id="btn-combat-next" class="w-full rounded bg-red-600 px-4 py-3 font-bold text-white transition hover:bg-red-700 shadow-lg">
                Roll / Next Step
            </button>
        </div>
    `;

    document.getElementById("btn-combat-next")?.addEventListener("click", async () => {
        try {
            const res = await fetch(`/api/games/${gameId}/combat-step`, { method: "POST" });
            if (!res.ok) throw new Error((await res.json()).error);
        } catch (e: any) {
            alert(e.message);
        }
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
