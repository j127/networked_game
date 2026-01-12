import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";

describe("database queries", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates a new game with default status", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-create-game-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games } = await import("../src/db/schema");
    const { createGame, getGame } = await import("../src/db/queries");

    await initDB();

    const gameId = await createGame();
    expect(gameId).toBeDefined();
    expect(gameId).toMatch(/^[0-9a-f-]{36}$/); // UUID format

    const game = await getGame(gameId);
    expect(game).not.toBeNull();
    expect(game?.id).toBe(gameId);
    expect(game?.status).toBe("LOBBY");
  });

  it("returns null for non-existent game", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-get-game-${Date.now()}-${Math.random()}.sqlite`;
    const { initDB } = await import("../src/db/index");
    const { getGame } = await import("../src/db/queries");

    await initDB();

    const game = await getGame("non-existent-id");
    expect(game).toBeNull();
  });

  it("adds a player to a game", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-add-player-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    const player = await addPlayer(gameId, playerId, "Test Player", "red");

    expect(player.id).toBe(playerId);
    expect(player.game_id).toBe(gameId);
    expect(player.name).toBe("Test Player");
    expect(player.color).toBe("red");
    expect(player.gold).toBe(0);
    expect(player.prestige).toBe(0);
    expect(player.is_eliminated).toBe(0);
  });

  it("returns existing player if already added", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-existing-player-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";

    // Add player first time
    const player1 = await addPlayer(gameId, playerId, "Test Player", "red");

    // Add same player second time
    const player2 = await addPlayer(gameId, playerId, "Different Name", "blue");

    expect(player1.id).toBe(player2.id);
    expect(player1.name).toBe(player2.name); // Should keep original name
  });

  it("gets all players in a game", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-get-players-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players } = await import("../src/db/schema");
    const { createGame, addPlayer, getPlayersInGame } =
      await import("../src/db/queries");

    await initDB();

    const gameId = await createGame();

    // Add multiple players
    await addPlayer(gameId, "player-1", "Player 1", "red");
    await addPlayer(gameId, "player-2", "Player 2", "blue");
    await addPlayer(gameId, "player-3", "Player 3", "green");

    const playersInGame = await getPlayersInGame(gameId);
    expect(playersInGame).toHaveLength(3);
    expect(playersInGame.map((p) => p.name)).toEqual([
      "Player 1",
      "Player 2",
      "Player 3",
    ]);
  });

  it("starts a game and updates status", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-start-game-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games } = await import("../src/db/schema");
    const { createGame, startGame, getGame } =
      await import("../src/db/queries");

    await initDB();

    const gameId = await createGame();

    // Verify initial state
    let game = await getGame(gameId);
    expect(game?.status).toBe("LOBBY");
    expect(game?.current_phase).toBe("SETUP");

    // Start the game
    await startGame(gameId);

    // Verify updated state
    game = await getGame(gameId);
    expect(game?.status).toBe("ACTIVE");
    expect(game?.current_phase).toBe("INCOME");
  });
});
