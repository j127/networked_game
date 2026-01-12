import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and, inArray } from "drizzle-orm";

describe("combat functions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("declares attack successfully", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-declare-attack-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { declareAttack } = await import("../src/game/combat");

    await initDB();

    const gameId = await createGame();
    const attackerId = "player-1";
    const defenderId = "player-2";
    await addPlayer(gameId, attackerId, "Attacker", "red");
    await addPlayer(gameId, defenderId, "Defender", "blue");

    // Setup territories
    await db
      .insert(territories)
      .values([
        {
          id: "territory-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
        {
          id: "territory-2",
          game_id: gameId,
          owner_id: defenderId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
      ])
      .run();

    // Setup units
    await db
      .insert(things)
      .values([
        {
          id: "unit-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          territory_id: "territory-1",
          template_id: "foot_soldier",
        },
      ])
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "WAR",
      })
      .where(eq(games.id, gameId))
      .run();

    const combatState = await declareAttack(
      gameId,
      attackerId,
      "territory-1",
      "territory-2",
      ["unit-1"]
    );

    expect(combatState.attackerId).toBe(attackerId);
    expect(combatState.defenderId).toBe(defenderId);
    expect(combatState.territoryId).toBe("territory-2");
    expect(combatState.attackerUnitIds).toEqual(["unit-1"]);
    expect(combatState.stage).toBe("INITIATIVE");
    expect(combatState.logs).toContain(`${attackerId} attacked territory-2.`);
  });

  it("prevents attack outside war phase", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-attack-wrong-phase-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { declareAttack } = await import("../src/game/combat");

    await initDB();

    const gameId = await createGame();
    const attackerId = "player-1";
    const defenderId = "player-2";
    await addPlayer(gameId, attackerId, "Attacker", "red");
    await addPlayer(gameId, defenderId, "Defender", "blue");

    await db
      .insert(territories)
      .values([
        {
          id: "territory-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
        {
          id: "territory-2",
          game_id: gameId,
          owner_id: defenderId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
      ])
      .run();

    await db
      .insert(things)
      .values({
        id: "unit-1",
        game_id: gameId,
        owner_id: attackerId,
        location: "BOARD",
        territory_id: "territory-1",
        template_id: "foot_soldier",
      })
      .run();

    // Set wrong phase
    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "INCOME",
      })
      .where(eq(games.id, gameId))
      .run();

    await expect(
      declareAttack(gameId, attackerId, "territory-1", "territory-2", [
        "unit-1",
      ])
    ).rejects.toThrow("Can only attack during WAR phase");
  });

  it("prevents attacking own territory", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-attack-self-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { declareAttack } = await import("../src/game/combat");

    await initDB();

    const gameId = await createGame();
    const playerId = "player-1";
    await addPlayer(gameId, playerId, "Player", "red");

    await db
      .insert(territories)
      .values([
        {
          id: "territory-1",
          game_id: gameId,
          owner_id: playerId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
        {
          id: "territory-2",
          game_id: gameId,
          owner_id: playerId, // Same owner
          location: "BOARD",
          terrain_type: "PLAINS",
        },
      ])
      .run();

    await db
      .insert(things)
      .values({
        id: "unit-1",
        game_id: gameId,
        owner_id: playerId,
        location: "BOARD",
        territory_id: "territory-1",
        template_id: "foot_soldier",
      })
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "WAR",
      })
      .where(eq(games.id, gameId))
      .run();

    await expect(
      declareAttack(gameId, playerId, "territory-1", "territory-2", ["unit-1"])
    ).rejects.toThrow("You can't attack yourself");
  });

  it("resolves combat initiative", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-combat-initiative-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { declareAttack, resolveCombatStep } =
      await import("../src/game/combat");

    await initDB();

    const gameId = await createGame();
    const attackerId = "player-1";
    const defenderId = "player-2";
    await addPlayer(gameId, attackerId, "Attacker", "red");
    await addPlayer(gameId, defenderId, "Defender", "blue");

    await db
      .insert(territories)
      .values([
        {
          id: "territory-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
        {
          id: "territory-2",
          game_id: gameId,
          owner_id: defenderId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
      ])
      .run();

    await db
      .insert(things)
      .values([
        {
          id: "unit-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          territory_id: "territory-1",
          template_id: "foot_soldier",
        },
      ])
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "WAR",
      })
      .where(eq(games.id, gameId))
      .run();

    // Declare attack
    await declareAttack(gameId, attackerId, "territory-1", "territory-2", [
      "unit-1",
    ]);

    // Resolve initiative
    const result = await resolveCombatStep(gameId);

    expect(result.stage).toBe("RANGED");
    expect(result.initiativeWinner).toBeDefined();
    expect(result.initiativeWinner).toMatch(/^(ATTACKER|DEFENDER)$/);
    expect(result.logs.some((log) => log.includes("Initiative:"))).toBe(true);
  });

  it("handles combat with no defenders", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-combat-no-defenders-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } =
      await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { declareAttack, resolveCombatStep } =
      await import("../src/game/combat");

    await initDB();

    const gameId = await createGame();
    const attackerId = "player-1";
    const defenderId = "player-2";
    await addPlayer(gameId, attackerId, "Attacker", "red");
    await addPlayer(gameId, defenderId, "Defender", "blue");

    await db
      .insert(territories)
      .values([
        {
          id: "territory-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
        {
          id: "territory-2",
          game_id: gameId,
          owner_id: defenderId,
          location: "BOARD",
          terrain_type: "PLAINS",
        },
      ])
      .run();

    await db
      .insert(things)
      .values([
        {
          id: "unit-1",
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          territory_id: "territory-1",
          template_id: "foot_soldier",
        },
      ])
      .run();

    await db
      .update(games)
      .set({
        status: "ACTIVE",
        current_phase: "WAR",
      })
      .where(eq(games.id, gameId))
      .run();

    // Declare attack
    await declareAttack(gameId, attackerId, "territory-1", "territory-2", [
      "unit-1",
    ]);

    // Skip to melee (no ranged combat needed with no defenders)
    await resolveCombatStep(gameId); // Initiative
    const result = await resolveCombatStep(gameId); // Melee (should finish)

    expect(result.finished).toBe(true);
    expect(
      result.logs.some((log) => log.includes("captured the territory"))
    ).toBe(true);

    // Check territory ownership changed
    const territory = await db
      .select()
      .from(territories)
      .where(eq(territories.id, "territory-2"))
      .get();
    expect(territory?.owner_id).toBe(attackerId);
  });
});
