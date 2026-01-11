import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { initDB } from "./db/index";
import type { ServerWebSocket } from "bun";
import { createGame, getGame, addPlayer, getPlayersInGame } from "./db/queries";
import { initializeGameInternal } from "./game/setup";
import { advancePhase } from "./game/logic";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

// Initialize Database
initDB();

// ... (previous imports commented out or removed)

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

app.post("/api/games/:gameId/start", (c) => {
  const gameId = c.req.param("gameId");
  const game = getGame(gameId);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.status !== "LOBBY")
    return c.json({ error: "Game already started" }, 400);

  initializeGameInternal(gameId);
  return c.json({ success: true, status: "ACTIVE" });
});

app.post("/api/games/:gameId/next-phase", (c) => {
  const gameId = c.req.param("gameId");
  try {
    const nextPhase = advancePhase(gameId);
    return c.json({ success: true, phase: nextPhase });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// ... (WS route)
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
        const players = getPlayersInGame(gameId);
        ws.send(JSON.stringify({ type: "GAME_STATE", players }));
      },
      onMessage(event, ws) {
        console.log(`Message received: ${event.data}`);
        // Handle game logic here
      },
      onClose(event, ws) {
        console.log(`Connection closed for game ${gameId}`);
      },
    };
  })
);

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
