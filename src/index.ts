import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { initDB } from "./db/index";
import type { ServerWebSocket } from "bun";
import { createGame, getGame, addPlayer, getPlayersInGame } from "./db/queries";
import { initializeGameInternal } from "./game/setup";
import { advancePhase } from "./game/logic";
import { drawLand } from "./game/game_actions";
import { drawThing, deployThing } from "./game/unit_actions";

// ... (existing routes)

const app = new Hono();

// Initialize Database
initDB();

import { serveStatic } from "hono/bun";

app.use("/*", serveStatic({ root: "./public" }));

app.post("/api/games", (c) => {
  const gameId = createGame();
  return c.json({ gameId });
});

app.post("/api/games/:gameId/join", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json();
  const { playerId, name, color } = body;

  const game = getGame(gameId);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.status !== "LOBBY")
    return c.json({ error: "Game already started" }, 400);

  addPlayer(gameId, playerId, name, color);
  return c.json({ success: true });
});

app.post("/api/games/:gameId/draw-thing", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json();
  const { playerId } = body;
  try {
    const thing = drawThing(gameId, playerId);
    broadcastGameState(gameId);
    return c.json({ success: true, thing });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/games/:gameId/deploy-thing", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json();
  const { playerId, thingId, territoryId } = body;
  try {
    deployThing(gameId, playerId, thingId, territoryId);
    broadcastGameState(gameId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

// Connection Manager
const connections = new Map<string, Set<any>>();

function broadcastGameState(gameId: string) {
  const game = getGame(gameId);
  const players = getPlayersInGame(gameId);
  if (!game) return;

  const payload = JSON.stringify({ type: "GAME_STATE", game, players });
  const clients = connections.get(gameId);
  if (clients) {
    for (const ws of clients) {
      ws.send(payload);
    }
  }
}

app.post("/api/games/:gameId/start", (c) => {
  const gameId = c.req.param("gameId");
  const game = getGame(gameId);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.status !== "LOBBY")
    return c.json({ error: "Game already started" }, 400);

  initializeGameInternal(gameId);
  broadcastGameState(gameId);
  return c.json({ success: true, status: "ACTIVE" });
});

app.post("/api/games/:gameId/next-phase", (c) => {
  const gameId = c.req.param("gameId");
  try {
    const nextPhase = advancePhase(gameId);
    broadcastGameState(gameId);
    return c.json({ success: true, phase: nextPhase });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/games/:gameId/draw-land", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json();
  const { playerId } = body;
  try {
    const land = drawLand(gameId, playerId);
    broadcastGameState(gameId);
    return c.json({ success: true, land });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get(
  "/ws/:gameId",
  upgradeWebSocket((c) => {
    const gameId = c.req.param("gameId");
    // Parse query string for playerId if needed, e.g. ?playerId=...
    const url = new URL(c.req.url);
    const playerId = url.searchParams.get("playerId");

    return {
      onOpen(event, ws) {
        console.log(`Connection opened for game ${gameId}, player ${playerId}`);

        // Add to connections
        if (!connections.has(gameId)) {
          connections.set(gameId, new Set());
        }
        connections.get(gameId)?.add(ws);

        // Send initial state
        const game = getGame(gameId);
        const players = getPlayersInGame(gameId);
        ws.send(JSON.stringify({ type: "GAME_STATE", game, players }));
      },
      onMessage(event, ws) {
        console.log(`Message received: ${event.data}`);
        // Handle game logic here
      },
      onClose(event, ws) {
        console.log(`Connection closed for game ${gameId}`);
        connections.get(gameId)?.delete(ws);
        if (connections.get(gameId)?.size === 0) {
          connections.delete(gameId);
        }
      },
    };
  })
);

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
