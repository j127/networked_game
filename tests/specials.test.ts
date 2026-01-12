import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";

describe("special characters", () => {
  it("master thief steals gold on a successful roll", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-thief-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, things } = await import("../src/db/schema");
    const { useMasterThief } = await import("../src/game/magic");

    await initDB();

    const gameId = "game-thief";
    const thiefPlayerId = "player-thief";
    const targetPlayerId = "player-target";

    await db
      .insert(games)
      .values({ id: gameId, status: "ACTIVE", current_phase: "WAR" })
      .run();
    await db
      .insert(players)
      .values([
        {
          id: thiefPlayerId,
          game_id: gameId,
          name: "Thief",
          color: "red",
          gold: 0,
        },
        {
          id: targetPlayerId,
          game_id: gameId,
          name: "Target",
          color: "blue",
          gold: 5,
        },
      ])
      .run();
    await db
      .insert(things)
      .values({
        id: "master-thief",
        game_id: gameId,
        owner_id: thiefPlayerId,
        location: "BOARD",
        template_id: "master_thief",
      })
      .run();

    const randomMock = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.0);

    const result = await useMasterThief(gameId, thiefPlayerId, targetPlayerId);
    expect(result.stolen).toBe(5);

    const thief = await db
      .select()
      .from(players)
      .where(eq(players.id, thiefPlayerId))
      .get();
    const target = await db
      .select()
      .from(players)
      .where(eq(players.id, targetPlayerId))
      .get();
    expect(thief?.gold).toBe(5);
    expect(target?.gold).toBe(0);

    randomMock.mockRestore();
  });

  it("assassin kills a random unit on success", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-assassin-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, things } = await import("../src/db/schema");
    const { useAssassin } = await import("../src/game/magic");

    await initDB();

    const gameId = "game-assassin";
    const assassinPlayerId = "player-assassin";
    const targetPlayerId = "player-target";
    const victimId = "victim-1";

    await db
      .insert(games)
      .values({ id: gameId, status: "ACTIVE", current_phase: "WAR" })
      .run();
    await db
      .insert(players)
      .values([
        {
          id: assassinPlayerId,
          game_id: gameId,
          name: "Assassin",
          color: "black",
          gold: 0,
        },
        {
          id: targetPlayerId,
          game_id: gameId,
          name: "Target",
          color: "blue",
          gold: 0,
        },
      ])
      .run();
    await db
      .insert(things)
      .values([
        {
          id: "assassin-primus",
          game_id: gameId,
          owner_id: assassinPlayerId,
          location: "BOARD",
          template_id: "assassin_primus",
        },
        {
          id: victimId,
          game_id: gameId,
          owner_id: targetPlayerId,
          location: "BOARD",
          template_id: "bear",
        },
        {
          id: "victim-2",
          game_id: gameId,
          owner_id: targetPlayerId,
          location: "BOARD",
          template_id: "wolf_pack",
        },
      ])
      .run();

    const randomMock = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);

    const result = await useAssassin(
      gameId,
      assassinPlayerId,
      targetPlayerId
    );
    expect(result.killedUnitId).toBe(victimId);

    const victim = await db
      .select()
      .from(things)
      .where(eq(things.id, victimId))
      .get();
    expect(victim?.location).toBe("DISCARD");

    randomMock.mockRestore();
  });
});
