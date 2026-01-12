import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";

describe("build functions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds fortification successfully", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-build-fort-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { buildStructure } = await import("../src/game/build");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    await addPlayer(gameId, playerId, "Test", "red");

    // Setup territory and game state
    await db
      .insert(territories)
      .values({
        id: "territory-1",
        game_id: gameId,
        owner_id: playerId,
        location: "BOARD",
        terrain_type: "PLAINS",
        fortification_level: 1,
      })
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "INCOME",
        turn_number: 1,
      })
      .where(eq(games.id, gameId))
      .run();

    await db
      .update(players)
      .set({ gold: 20 })
      .where(eq(players.id, playerId))
      .run();

    const result = await buildStructure(gameId, playerId, "territory-1");
    expect(result.nextLevel).toBe(2);
    expect(result.cost).toBe(10);

    // Check territory was updated
    const territory = await db
      .select()
      .from(territories)
      .where(eq(territories.id, "territory-1"))
      .get();
    expect(territory?.fortification_level).toBe(2);
    expect(territory?.last_fort_build_turn).toBe(1);

    // Check gold was deducted
    const player = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .get();
    expect(player?.gold).toBe(10);
  });

  it("builds settlement successfully", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-build-settlement-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { buildSettlement } = await import("../src/game/build");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    await addPlayer(gameId, playerId, "Test", "red");

    // Setup territory and settlement tile
    await db
      .insert(territories)
      .values({
        id: "territory-1",
        game_id: gameId,
        owner_id: playerId,
        location: "BOARD",
        terrain_type: "PLAINS",
      })
      .run();

    await db
      .insert(things)
      .values({
        id: "tile-1",
        game_id: gameId,
        owner_id: playerId,
        location: "HAND",
        template_id: "village",
      })
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "INCOME",
        turn_number: 1,
      })
      .where(eq(games.id, gameId))
      .run();

    const result = await buildSettlement(
      gameId,
      playerId,
      "territory-1",
      "tile-1"
    );
    expect(result.settlementType).toBe("VILLAGE");
    expect(result.settlementValue).toBe(1);

    // Check territory was updated
    const territory = await db
      .select()
      .from(territories)
      .where(eq(territories.id, "territory-1"))
      .get();
    expect(territory?.settlement_type).toBe("VILLAGE");
    expect(territory?.settlement_value).toBe(1);

    // Check tile was discarded
    const tile = await db
      .select()
      .from(things)
      .where(eq(things.id, "tile-1"))
      .get();
    expect(tile?.location).toBe("DISCARD");
  });

  it("prevents building outside income phase", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-build-wrong-phase-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { buildStructure } = await import("../src/game/build");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    await addPlayer(gameId, playerId, "Test", "red");

    await db
      .insert(territories)
      .values({
        id: "territory-1",
        game_id: gameId,
        owner_id: playerId,
        location: "BOARD",
        terrain_type: "PLAINS",
        fortification_level: 1,
      })
      .run();

    // Set wrong phase
    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "WAR",
      })
      .where(eq(games.id, gameId))
      .run();

    await expect(
      buildStructure(gameId, playerId, "territory-1")
    ).rejects.toThrow("Can only build during INCOME phase");
  });

  it("prevents building on unowned territory", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-build-unowned-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { buildStructure } = await import("../src/game/build");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    const otherPlayerId = "player-2";
    await addPlayer(gameId, playerId, "Test", "red");
    await addPlayer(gameId, otherPlayerId, "Other", "blue");

    await db
      .insert(territories)
      .values({
        id: "territory-1",
        game_id: gameId,
        owner_id: otherPlayerId, // Owned by other player
        location: "BOARD",
        terrain_type: "PLAINS",
        fortification_level: 1,
      })
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "INCOME",
      })
      .where(eq(games.id, gameId))
      .run();

    await expect(
      buildStructure(gameId, playerId, "territory-1")
    ).rejects.toThrow("You don't own this territory");
  });

  it("prevents building max fortification", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-build-max-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { buildStructure } = await import("../src/game/build");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    await addPlayer(gameId, playerId, "Test", "red");

    await db
      .insert(territories)
      .values({
        id: "territory-1",
        game_id: gameId,
        owner_id: playerId,
        location: "BOARD",
        terrain_type: "PLAINS",
        fortification_level: 4, // Already at max
      })
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "INCOME",
      })
      .where(eq(games.id, gameId))
      .run();

    await expect(
      buildStructure(gameId, playerId, "territory-1")
    ).rejects.toThrow("Max fortification reached");
  });
});
