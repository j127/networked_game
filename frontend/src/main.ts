import "./style.css";

// State
let gameId = localStorage.getItem("gameId");
let playerId = localStorage.getItem("playerId");
let playerState = null;
let ws: WebSocket | null = null;
let latestGameState: any = null;

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
const btnPurchaseTiles = document.getElementById("btn-purchase-tiles");
const btnFreeDraw = document.getElementById("btn-free-draw");
const btnNextPhase = document.getElementById("btn-next-phase");
const btnUseSelected = document.getElementById("btn-use-selected");
const btnUseThief = document.getElementById("btn-use-thief");
const btnUseAssassin = document.getElementById("btn-use-assassin");

// --- Initialization ---

async function init() {
  // Check URL for Game ID
  const urlParams = new URLSearchParams(window.location.search);
  const urlGameId = urlParams.get("gameId");

  if (urlGameId && urlGameId !== gameId) {
    // User clicked a shared link, switch to that game
    console.log("Switching to shared game:", urlGameId);
    localStorage.setItem("gameId", urlGameId);
    localStorage.removeItem("playerId"); // Force re-join as new player
    gameId = urlGameId;
    playerId = null;
    location.reload();
    return;
  }

  if (gameId && playerId) {
    joinModal?.classList.add("hidden");
    connectWebSocket();
    // Update URL if missing
    if (!urlGameId) {
      const url = new URL(window.location.href);
      url.searchParams.set("gameId", gameId);
      window.history.replaceState({}, "", url);
    }
  } else {
    // Show join modal (default)
  }
}

// --- Join Game ---

btnJoin?.addEventListener("click", async () => {
  const name = inputName.value;
  const color = inputColor.value;
  if (!name) return alert("Name required");

  // 1. Create Game (if needed)
  try {
    let gid = gameId;

    // Check if we have a URL game ID to join first
    const urlParams = new URLSearchParams(window.location.search);
    const urlGameId = urlParams.get("gameId");

    if (urlGameId) {
      gid = urlGameId;
    } else if (!gid) {
      // Create NEW game
      const res = await fetch("/api/games", { method: "POST" });
      const data = await res.json();
      gid = data.gameId;
    }

    gameId = gid;
    if (!gameId) throw new Error("No game ID returned");
    localStorage.setItem("gameId", gameId);

    // 2. Join Game
    const pid = crypto.randomUUID(); // Generate local ID
    const joinRes = await fetch(`/api/games/${gid}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: pid, name, color }),
    });

    if (!joinRes.ok) {
      let message = await joinRes.text();
      try {
        const parsed = JSON.parse(message);
        message = parsed.error || message;
      } catch {
        // Keep original text.
      }
      throw new Error(message || "Failed to join game");
    }

    playerId = pid;
    localStorage.setItem("playerId", playerId); // Persist

    // 3. Start Game (Try to start, if already started it might fail 400 but that's fine for 2nd player)
    await fetch(`/api/games/${gid}/start`, { method: "POST" });

    joinModal?.classList.add("hidden");

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gid!);
    window.history.pushState({}, "", url);

    connectWebSocket();
  } catch (e: any) {
    if (e.message.includes("already started")) {
      // Ignore specific start error for 2nd player
      joinModal?.classList.add("hidden");
      connectWebSocket();
    } else {
      alert("Error joining: " + e.message);
    }
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
    showFeedback(
      "Connection lost. Is the server running?",
      "text-red-600 font-bold"
    );
  };

  ws.onerror = (err) => {
    console.error("WS Error:", err);
    updateStatus("Connection Error");
    showFeedback("Failed to connect to server.", "text-red-600 font-bold");
  };
}

// --- UI Actions ---

// State for Interaction
let selectedUnitId: string | null = null;
let selectedCasualtyIds: string[] = [];
let activeCasualtyKey: string | null = null;

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
    const data = await res.json();
    if (data.status === "CLAIMED") {
      showFeedback("Land acquired!", "text-green-600");
      return;
    }
    if (data.status === "INSTRUCTION") {
      await handleLandInstruction(data.instruction);
    }
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

async function handleLandInstruction(instruction: any) {
  if (!gameId || !playerId) return;
  const type = instruction?.instructionType;
  if (type === "FOR_SALE") {
    const cost = instruction.instructionValue || 0;
    const accept = confirm(`Land for sale: pay ${cost} gold?`);
    const res = await fetch(`/api/games/${gameId}/resolve-land`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, accept }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showFeedback(accept ? "Land purchased!" : "Land returned.", "text-green-600");
    return;
  }
  if (type === "PUBLIC_AUCTION") {
    const bidStr = prompt("Public auction: enter your bid (0 to pass)", "0");
    const bidAmount = Number(bidStr);
    const res = await fetch(`/api/games/${gameId}/resolve-land`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, bidAmount }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showFeedback("Auction resolved.", "text-green-600");
    return;
  }
  if (type === "FIGHT") {
    const accept = confirm(
      "Fight for the land? You must defeat drawn owners in one battle."
    );
    const res = await fetch(`/api/games/${gameId}/resolve-land`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, accept }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showFeedback(
      accept ? "Fight started!" : "Land returned to deck.",
      "text-green-600"
    );
    return;
  }
  showFeedback("Unknown land instruction.", "text-red-500");
}

btnPurchaseTiles?.addEventListener("click", async () => {
  if (!gameId || !playerId) return;
  const countStr = prompt("How many tiles to buy? (1-4)", "1");
  const count = Number(countStr);
  if (!count || Number.isNaN(count)) return;
  showFeedback("Purchasing tiles...");
  try {
    const res = await fetch(`/api/games/${gameId}/purchase-tiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, count }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Tiles acquired!", "text-green-600");
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

btnFreeDraw?.addEventListener("click", async () => {
  if (!gameId || !playerId) return;
  showFeedback("Drawing free tile...");
  try {
    const res = await fetch(`/api/games/${gameId}/free-draw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Free draw complete!", "text-green-600");
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

btnUseSelected?.addEventListener("click", async () => {
  if (!gameId || !playerId || !playerState) return;
  if (!selectedUnitId) {
    showFeedback("Select a hand item first.", "text-red-500");
    return;
  }

  const item = (playerState.things || []).find(
    (t: any) => t.id === selectedUnitId
  );
  if (!item || item.location !== "HAND") {
    showFeedback("Selected item must be in hand.", "text-red-500");
    return;
  }

  const options: any = {};
  const template = item.template_id || "";
  if (template === "magic_sword" || template === "magic_bow") {
    const units = getOwnedUnitsOnBoard(playerState);
    const target = promptForChoice("Choose unit", units);
    if (!target) return;
    options.targetUnitId = target.id;
  } else if (template === "golem") {
    const territories = getOwnedTerritories(playerState);
    const target = promptForChoice("Choose territory", territories);
    if (!target) return;
    options.targetTerritoryId = target.id;
  } else if (template === "scroll_fire_wall") {
    const territories = getAllTerritories(latestGameState?.players || []);
    const target = promptForChoice("Choose territory", territories);
    if (!target) return;
    options.targetTerritoryId = target.id;
  } else if (template === "scroll_dispell") {
    const targets = getOtherPlayers(latestGameState?.players || [], playerId);
    const target = promptForChoice("Choose player", targets);
    if (!target) return;
    options.targetPlayerId = target.id;
  } else if (template === "lucky_charm") {
    const side = prompt("Side to modify (ATTACKER/DEFENDER/FORT)", "ATTACKER");
    const rollIndex = Number(prompt("Roll index (0-based)", "0"));
    const delta = Number(prompt("Delta (+1 or -1)", "1"));
    if (!side || Number.isNaN(rollIndex) || Number.isNaN(delta)) return;
    options.side = side;
    options.rollIndex = rollIndex;
    options.delta = delta;
  } else if (template === "talisman") {
    const deadUnits = getDeadUnits(playerState);
    if (deadUnits.length === 0) {
      showFeedback("No dead units to revive.", "text-red-500");
      return;
    }
    const picks = promptForMultipleChoices(
      "Choose units to revive (comma-separated indices)",
      deadUnits
    );
    if (picks.length > 0) {
      options.unitIds = picks.map((p) => p.id);
    }
  }

  try {
    const res = await fetch(`/api/games/${gameId}/use-magic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, thingId: item.id, options }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Magic used!", "text-green-600");
    selectedUnitId = null;
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

btnUseThief?.addEventListener("click", async () => {
  if (!gameId || !playerId) return;
  const targets = getOtherPlayers(latestGameState?.players || [], playerId);
  const target = promptForChoice("Choose player to steal from", targets);
  if (!target) return;
  try {
    const res = await fetch(`/api/games/${gameId}/use-thief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, targetPlayerId: target.id }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Thief attempted.", "text-green-600");
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

btnUseAssassin?.addEventListener("click", async () => {
  if (!gameId || !playerId) return;
  const targets = getOtherPlayers(latestGameState?.players || [], playerId);
  const target = promptForChoice("Choose player to assassinate", targets);
  if (!target) return;
  try {
    const res = await fetch(`/api/games/${gameId}/use-assassin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, targetPlayerId: target.id }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showFeedback("Assassin attempted.", "text-green-600");
  } catch (e: any) {
    showFeedback(e.message, "text-red-500");
  }
});

// --- Rendering ---

function updateUI(state: any) {
  latestGameState = state;
  // Check for invalid session (Game deleted or Player deleted)
  if (
    !state.game ||
    (state.players && !state.players.find((p: any) => p.id === playerId))
  ) {
    console.warn("Invalid session detected. Resetting...");
    localStorage.removeItem("gameId");
    localStorage.removeItem("playerId");
    location.reload(); // Reload to show join modal
    return;
  }

  if (state.game) {
    const phase = state.game.current_phase;
    if (phaseDisplay) phaseDisplay.textContent = `Phase: ${phase}`;

    // Update Instructions & Button State
    const instructionEl = document.getElementById("phase-instruction");
    if (instructionEl) {
      let text = "";
      switch (phase) {
        case "INCOME":
          text = "Collect Gold & Upgrade Territories.";
          break;
        case "EVENTS":
          text = "Random events occur. Click Next Phase.";
          break;
        case "ACQUIRE":
          text = "Draw land, buy tiles (2/5/10/20), and take a free draw.";
          break;
        case "WAR":
          text = "Select your territory -> Click enemy to Attack.";
          break;
      }
      instructionEl.textContent = text;
    }

    const isAcquire = phase === "ACQUIRE";
    if (btnDrawLand) {
      (btnDrawLand as HTMLButtonElement).disabled = !isAcquire;
      btnDrawLand.className = isAcquire
        ? "rounded bg-green-500 px-4 py-2 font-bold text-white transition hover:bg-green-600 shadow"
        : "rounded bg-gray-300 px-4 py-2 font-bold text-gray-500 cursor-not-allowed";
    }
    if (btnPurchaseTiles) {
      (btnPurchaseTiles as HTMLButtonElement).disabled = !isAcquire;
      btnPurchaseTiles.className = isAcquire
        ? "rounded bg-orange-500 px-4 py-2 font-bold text-white transition hover:bg-orange-600 shadow"
        : "rounded bg-gray-300 px-4 py-2 font-bold text-gray-500 cursor-not-allowed";
    }
    if (btnFreeDraw) {
      (btnFreeDraw as HTMLButtonElement).disabled = !isAcquire;
      btnFreeDraw.className = isAcquire
        ? "rounded bg-amber-500 px-4 py-2 font-bold text-white transition hover:bg-amber-600 shadow"
        : "rounded bg-gray-300 px-4 py-2 font-bold text-gray-500 cursor-not-allowed";
    }

    // Show Game ID in title or header (append if not there)
    const title = document.querySelector("header h1");
    if (title && !title.textContent?.includes(state.game.id.slice(0, 4))) {
      title.innerHTML = `King of the Tabletop <span class="text-xs font-normal text-gray-500 ml-2">Game: ${state.game.id.slice(0, 6)}...</span>`;
    }

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
    // "Chit" style: Square-ish, thick border, shadow
    const isSelected = selectedUnitId === unit.id;
    div.className = `w-24 h-24 shrink-0 rounded-md border-4 p-2 flex flex-col items-center justify-center cursor-pointer transition select-none shadow-md
        ${
          isSelected
            ? "border-blue-500 bg-blue-100 scale-105 ring-2 ring-blue-300"
            : "border-gray-400 bg-amber-50 hover:border-gray-600 hover:bg-amber-100"
        }`;

    div.innerHTML = `
        <div class="font-bold text-xs text-center leading-tight uppercase tracking-wider text-gray-800">${unit.template_id.replace(/_/g, " ")}</div>
        <div class="mt-1 text-[10px] font-mono text-gray-600">⚔️ ?</div>
    `;
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

function getOwnedUnitsOnBoard(player: any) {
  const units: { id: string; label: string }[] = [];
  (player.territories || []).forEach((t: any) => {
    (t.units || []).forEach((u: any) => {
      units.push({
        id: u.id,
        label: `${u.template_id.replace(/_/g, " ")} (${t.terrain_type})`,
      });
    });
  });
  return units;
}

function getOwnedTerritories(player: any) {
  return (player.territories || []).map((t: any) => ({
    id: t.id,
    label: `${t.terrain_type} (${t.id.slice(0, 4)})`,
  }));
}

function getAllTerritories(players: any[]) {
  const all: { id: string; label: string }[] = [];
  players.forEach((p) => {
    (p.territories || []).forEach((t: any) => {
      all.push({
        id: t.id,
        label: `${t.terrain_type} - ${p.name}`,
      });
    });
  });
  return all;
}

function getOtherPlayers(players: any[], meId: string) {
  return players
    .filter((p) => p.id !== meId)
    .map((p) => ({ id: p.id, label: p.name }));
}

function getDeadUnits(player: any) {
  return (player.things || [])
    .filter((t: any) => t.location === "WAR_DEAD")
    .map((t: any) => ({
      id: t.id,
      label: t.template_id.replace(/_/g, " "),
    }));
}

function promptForChoice(label: string, choices: { id: string; label: string }[]) {
  if (choices.length === 0) {
    alert("No valid choices available.");
    return null;
  }
  const lines = choices.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
  const answer = prompt(`${label}:\n${lines}`, "1");
  const index = Number(answer) - 1;
  if (Number.isNaN(index) || index < 0 || index >= choices.length) return null;
  return choices[index];
}

function promptForMultipleChoices(
  label: string,
  choices: { id: string; label: string }[]
) {
  if (choices.length === 0) return [];
  const lines = choices.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
  const answer = prompt(`${label}:\n${lines}`, "");
  if (!answer) return [];
  return answer
    .split(",")
    .map((entry) => Number(entry.trim()) - 1)
    .filter((index) => !Number.isNaN(index) && index >= 0 && index < choices.length)
    .map((index) => choices[index]);
}

// Global state for attack planning
let sourceTerritoryId: string | null = null;

function renderWorld(players: any[]) {
  const container = document.getElementById("kingdom-board");
  if (!container) return;
  container.innerHTML = "";

  // Flatten territories
  const allTerritories: any[] = [];
  players.forEach((p) => {
    if (p.territories) {
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

  allTerritories.forEach((terr) => {
    const isMine = terr._ownerId === playerId;
    const div = document.createElement("div");

    let borderClass = isMine
      ? "border-indigo-200 bg-white"
      : "border-red-200 bg-red-50";
    if (sourceTerritoryId === terr.id)
      borderClass = "border-green-500 ring-2 ring-green-200 bg-green-50";

    div.className = `rounded-lg border p-4 shadow-sm hover:shadow-md transition cursor-pointer relative ${borderClass}`;

    const unitsHere = terr.units || [];
    const fortLevel = terr.fortification_level || 0;
    const fortLabel =
      fortLevel > 0 ? `<span class="ml-1 text-xs">🏰${fortLevel}</span>` : "";

    // Add Upgrade Button if INCOME and Mine
    let upgradeBtn = "";
    const phase = document.getElementById("phase-display")?.textContent;
    if (isMine && phase?.includes("INCOME") && fortLevel < 4) {
      upgradeBtn = `<button class="btn-upgrade mt-2 w-full rounded bg-yellow-500 px-2 py-1 text-xs font-bold text-white hover:bg-yellow-600" data-tid="${terr.id}">Upgrade (5g+)</button>`;
    }

    div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold uppercase text-xs tracking-wide ${isMine ? "text-indigo-700" : "text-red-700"}">${terr.terrain_type} ${fortLabel}</span>
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
      if (target.classList.contains("btn-upgrade")) {
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
          if (
            confirm(
              `Attack ${terr._ownerName}'s ${terr.terrain_type} from your selected territory?`
            )
          ) {
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
    modal.className =
      "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm";
    document.body.appendChild(modal);
  }

  const pending = state.pendingCasualties?.[0];
  const pendingKey = pending
    ? `${pending.playerId}:${pending.stage}:${pending.hits}:${pending.availableUnitIds.join(",")}`
    : null;
  if (pendingKey !== activeCasualtyKey) {
    selectedCasualtyIds = [];
    activeCasualtyKey = pendingKey;
  }

  const unitLookup = buildUnitLookup(latestGameState?.players || []);
  const playerNameLookup = buildPlayerLookup(latestGameState?.players || []);
  const pendingName = pending ? playerNameLookup[pending.playerId] || pending.playerId : "";
  const remainingHits = pending ? pending.hits - selectedCasualtyIds.length : 0;

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
            </div>

            ${
              pending
                ? `
                <div class="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                  <div class="font-semibold text-amber-900">Assign casualties</div>
                  <div class="text-amber-900">Player: ${pendingName}</div>
                  <div class="text-amber-800">Hits to assign: ${pending.hits}</div>
                  <div class="text-amber-800">Remaining: ${remainingHits}</div>
                </div>
                ${
                  pending.playerId === playerId
                    ? `
                    <div class="mb-4 grid grid-cols-2 gap-2">
                      ${pending.availableUnitIds
                        .map((id: string) => {
                          const label = unitLookup[id] || id;
                          const count = selectedCasualtyIds.filter((s) => s === id).length;
                          const countBadge =
                            count > 0
                              ? `<span class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">x${count}</span>`
                              : "";
                          return `<button class="btn-casualty w-full rounded border border-gray-200 bg-white px-2 py-2 text-left text-xs hover:bg-gray-50" data-unit-id="${id}">
                            ${label}${countBadge}
                          </button>`;
                        })
                        .join("")}
                    </div>
                    <div class="mb-4 flex gap-2">
                      <button id="btn-casualty-undo" class="flex-1 rounded bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">Undo</button>
                      <button id="btn-casualty-clear" class="flex-1 rounded bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">Clear</button>
                    </div>
                    <button id="btn-assign-casualties" class="w-full rounded bg-amber-600 px-4 py-3 font-bold text-white transition hover:bg-amber-700 shadow-lg" ${
                      remainingHits > 0 ? "disabled" : ""
                    }>
                      Confirm Casualties
                    </button>
                  `
                    : `
                    <div class="mb-4 text-sm text-gray-600">Waiting for ${pendingName} to assign losses.</div>
                  `
                }
              `
                : `
                <button id="btn-combat-next" class="w-full rounded bg-red-600 px-4 py-3 font-bold text-white transition hover:bg-red-700 shadow-lg">
                    Roll / Next Step
                </button>
              `
            }
        </div>
    `;

  if (pending?.playerId === playerId) {
    document.querySelectorAll(".btn-casualty").forEach((btn) => {
      btn.addEventListener("click", () => {
        const unitId = (btn as HTMLElement).dataset.unitId;
        if (!unitId) return;
        if (selectedCasualtyIds.length >= pending.hits) return;
        selectedCasualtyIds.push(unitId);
        renderCombatModal(state);
      });
    });

    document.getElementById("btn-casualty-undo")?.addEventListener("click", () => {
      selectedCasualtyIds.pop();
      renderCombatModal(state);
    });

    document.getElementById("btn-casualty-clear")?.addEventListener("click", () => {
      selectedCasualtyIds = [];
      renderCombatModal(state);
    });

    document
      .getElementById("btn-assign-casualties")
      ?.addEventListener("click", async () => {
        if (selectedCasualtyIds.length !== pending.hits) return;
        try {
          const res = await fetch(`/api/games/${gameId}/assign-casualties`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId, unitIds: selectedCasualtyIds }),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          selectedCasualtyIds = [];
        } catch (e: any) {
          alert(e.message);
        }
      });
  } else {
    document
      .getElementById("btn-combat-next")
      ?.addEventListener("click", async () => {
        try {
          const res = await fetch(`/api/games/${gameId}/combat-step`, {
            method: "POST",
          });
          if (!res.ok) throw new Error((await res.json()).error);
        } catch (e: any) {
          alert(e.message);
        }
      });
  }
}

function buildUnitLookup(players: any[]) {
  const map: Record<string, string> = {};
  players.forEach((player) => {
    (player.territories || []).forEach((territory: any) => {
      (territory.units || []).forEach((unit: any) => {
        map[unit.id] = unit.template_id?.replace(/_/g, " ") || unit.id;
      });
    });
  });
  return map;
}

function buildPlayerLookup(players: any[]) {
  const map: Record<string, string> = {};
  players.forEach((player) => {
    map[player.id] = player.name;
  });
  return map;
}

async function deployUnit(thingId: string, territoryId: string) {
  if (!gameId || !playerId) return;
  const item = (playerState?.things || []).find((t: any) => t.id === thingId);
  if (item && !isDeployableThing(item.template_id)) {
    showFeedback("This item cannot be deployed.", "text-red-500");
    return;
  }
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

function isDeployableThing(templateId: string) {
  const blocked = new Set([
    "magic_sword",
    "magic_bow",
    "lucky_charm",
    "dust_of_defense",
    "talisman",
    "golem",
    "scroll_mist",
    "scroll_dispell",
    "scroll_fire_wall",
    "treasure_chest",
    "treasure_diamond",
    "treasure_emerald",
    "treasure_sapphire",
    "treasure_ruby",
    "treasure_nugget",
    "city",
    "village",
    "mine_gold",
    "mine_silver",
    "mine_copper",
  ]);
  return !blocked.has(templateId);
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
