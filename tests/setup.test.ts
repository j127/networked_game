import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";

describe("game setup", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("seeds land deck with terrain types", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-land-deck-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, territories } = await import("../src/db/schema");
    const { seedLandDeck } = await import("../src/game/setup");

    await initDB();

    const gameId = "test-game";
    await db.insert(games).values({ id: gameId, status: "ACTIVE" }).run();

    const landCount = seedLandDeck(gameId);
    expect(landCount).toBeGreaterThan(0);

    const lands = await db
      .select()
      .from(territories)
      .where(eq(territories.game_id, gameId))
      .all();
    expect(lands.length).toBe(landCount);

    // Check that we have different terrain types
    const terrainTypes = new Set(
      lands.map((l: any) => l.terrain_type).filter(Boolean)
    );
    expect(terrainTypes.size).toBeGreaterThan(1);
  });

  it("seeds playing deck with character tiles", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-playing-deck-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, things } = await import("../src/db/schema");
    const { seedDeck } = await import("../src/game/setup");

    await initDB();

    const gameId = "test-game";
    await db.insert(games).values({ id: gameId, status: "ACTIVE" }).run();

    const deckCount = seedDeck(gameId);
    expect(deckCount).toBeGreaterThan(0);

    const tiles = await db
      .select()
      .from(things)
      .where(eq(things.game_id, gameId))
      .all();
    expect(tiles.length).toBe(deckCount);

    // All tiles should be in DECK location
    expect(tiles.every((t: any) => t.location === "DECK")).toBe(true);

    // All tiles should have template_id
    expect(tiles.every((t: any) => t.template_id)).toBe(true);
  });

  it("seeds special characters in bank", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-special-chars-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, things } = await import("../src/db/schema");
    const { seedSpecialCharacters } = await import("../src/game/setup");

    await initDB();

    const gameId = "test-game";
    await db.insert(games).values({ id: gameId, status: "ACTIVE" }).run();

    const specialCount = seedSpecialCharacters(gameId);
    expect(specialCount).toBeGreaterThan(0);

    const specials = await db
      .select()
      .from(things)
      .where(and(eq(things.game_id, gameId), eq(things.location, "BANK")))
      .all();
    expect(specials.length).toBe(specialCount);
  });

  it("initializes game completely", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-init-game-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { initializeGameInternal } = await import("../src/game/setup");

    await initDB();

    const gameId = "test-game";
    const playerId = "player-1";

    // Setup initial state
    await db.insert(games).values({ id: gameId, status: "LOBBY" }).run();
    await db
      .insert(players)
      .values({
        id: playerId,
        game_id: gameId,
        name: "Test",
        color: "red",
        gold: 0,
        prestige: 0,
      })
      .run();

    // Initialize game
    initializeGameInternal(gameId);

    // Check game status
    const game = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .get();
    expect(game?.status).toBe("ACTIVE");
    expect(game?.current_phase).toBe("INCOME");

    // Check player gold
    const player = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .get();
    expect(player?.gold).toBe(10);

    // Check that decks are seeded
    const territoryRecords = await db
      .select()
      .from(territories)
      .where(eq(territories.game_id, gameId))
      .all();
    const thingRecords = await db
      .select()
      .from(things)
      .where(eq(things.game_id, gameId))
      .all();
    expect(territoryRecords.length).toBeGreaterThan(0);
    expect(thingRecords.length).toBeGreaterThan(0);
  });
});
