import { db } from "../db";
import { games, players, territories, things } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getGame } from "../db/queries";
import { THING_TEMPLATES } from "./data";
import { applyLuckyCharm } from "./combat";
import { endTurn } from "./logic";

type MagicOptions = {
  targetUnitId?: string;
  targetTerritoryId?: string;
  targetPlayerId?: string;
  side?: "ATTACKER" | "DEFENDER" | "FORT";
  rollIndex?: number;
  delta?: 1 | -1;
  unitIds?: string[];
};

export async function useMagicItem(
  gameId: string,
  playerId: string,
  thingId: string,
  options: MagicOptions = {}
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");

  const item = await db
    .select()
    .from(things)
    .where(
      and(
        eq(things.id, thingId),
        eq(things.owner_id, playerId),
        eq(things.location, "HAND")
      )
    )
    .get();
  if (!item) throw new Error("Magic item not found in hand");

  const template = THING_TEMPLATES[item.template_id || ""];
  if (!template) throw new Error("Unknown magic item");

  if (
    game.magic_dispell_player_id === playerId &&
    game.magic_dispell_phase === game.current_phase
  ) {
    throw new Error("You cannot cast magic while dispelled");
  }

  if (template.kind === "TREASURE") {
    const goldValue = template.goldValue || 0;
    const player = await db
      .select()
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.game_id, gameId)))
      .get();
    if (!player) throw new Error("Player not found");

    await db
      .update(players)
      .set({ gold: (player.gold || 0) + goldValue })
      .where(eq(players.id, playerId))
      .run();

    await returnToDeck(item.id);
    return { effect: "TREASURE", gold: goldValue };
  }

  switch (template.id) {
    case "magic_sword":
    case "magic_bow": {
      const targetUnitId = options.targetUnitId;
      if (!targetUnitId) throw new Error("Target unit required");
      const target = await db
        .select()
        .from(things)
        .where(
          and(
            eq(things.id, targetUnitId),
            eq(things.owner_id, playerId),
            eq(things.location, "BOARD")
          )
        )
        .get();
      if (!target) throw new Error("Target unit not found on board");

      await db
        .update(things)
        .set({
          attached_to_thing_id: targetUnitId,
          location: "BOARD",
        })
        .where(eq(things.id, item.id))
        .run();
      return { effect: template.id, attachedTo: targetUnitId };
    }
    case "golem": {
      const targetTerritoryId = options.targetTerritoryId;
      if (!targetTerritoryId) throw new Error("Target territory required");
      const territory = await db
        .select()
        .from(territories)
        .where(
          and(
            eq(territories.id, targetTerritoryId),
            eq(territories.owner_id, playerId),
            eq(territories.game_id, gameId)
          )
        )
        .get();
      if (!territory) throw new Error("You must own the target territory");

      await db
        .update(things)
        .set({
          location: "BOARD",
          territory_id: targetTerritoryId,
        })
        .where(eq(things.id, item.id))
        .run();
      return { effect: "golem", territoryId: targetTerritoryId };
    }
    case "lucky_charm": {
      if (
        options.rollIndex === undefined ||
        options.delta === undefined ||
        !options.side
      ) {
        throw new Error("side, rollIndex, and delta are required");
      }
      const state = await applyLuckyCharm(gameId, {
        side: options.side,
        rollIndex: options.rollIndex,
        delta: options.delta,
      });
      await returnToDeck(item.id);
      return { effect: "lucky_charm", combatState: state };
    }
    case "dust_of_defense": {
      if (!game.combat_state) throw new Error("No active combat to cancel");
      await db
        .update(games)
        .set({ combat_state: null })
        .where(eq(games.id, gameId))
        .run();
      await returnToDeck(item.id);
      return { effect: "dust_of_defense" };
    }
    case "scroll_mist": {
      if (game.current_phase === "WAR") {
        await endTurn(gameId);
      } else {
        await db
          .update(games)
          .set({ war_disabled: 1 })
          .where(eq(games.id, gameId))
          .run();
      }
      if (game.combat_state) {
        await db
          .update(games)
          .set({ combat_state: null })
          .where(eq(games.id, gameId))
          .run();
      }
      await returnToDeck(item.id);
      return { effect: "scroll_mist" };
    }
    case "scroll_dispell": {
      const targetPlayerId = options.targetPlayerId;
      if (!targetPlayerId) throw new Error("Target player required");
      const target = await db
        .select()
        .from(players)
        .where(and(eq(players.id, targetPlayerId), eq(players.game_id, gameId)))
        .get();
      if (!target) throw new Error("Target player not found");
      await db
        .update(games)
        .set({
          magic_dispell_player_id: targetPlayerId,
          magic_dispell_phase: game.current_phase,
        })
        .where(eq(games.id, gameId))
        .run();
      await returnToDeck(item.id);
      return { effect: "scroll_dispell", targetPlayerId };
    }
    case "scroll_fire_wall": {
      if (game.current_phase !== "WAR") {
        throw new Error("Fire Wall can only be cast during WAR");
      }
      const targetTerritoryId = options.targetTerritoryId;
      if (!targetTerritoryId) throw new Error("Target territory required");
      const roll = rollD6();
      await db
        .update(territories)
        .set({ magic_fort_value: roll })
        .where(
          and(
            eq(territories.id, targetTerritoryId),
            eq(territories.game_id, gameId)
          )
        )
        .run();
      if (game.combat_state) {
        const combatState = JSON.parse(game.combat_state as string);
        if (combatState.territoryId === targetTerritoryId) {
          combatState.fortRemaining =
            (combatState.fortRemaining || 0) + roll;
          await db
            .update(games)
            .set({ combat_state: JSON.stringify(combatState) })
            .where(eq(games.id, gameId))
            .run();
        }
      }
      await returnToDeck(item.id);
      return { effect: "scroll_fire_wall", value: roll };
    }
    case "talisman": {
      if (game.current_phase !== "WAR") {
        throw new Error("Talisman can only be used after war");
      }
      const dead = await db
        .select()
        .from(things)
        .where(
          and(
            eq(things.owner_id, playerId),
            eq(things.location, "WAR_DEAD"),
            eq(things.game_id, gameId)
          )
        )
        .all();
      if (dead.length === 0) throw new Error("No dead units to revive");
      const roll = rollD6();
      const reviveCount = Math.min(roll, dead.length);
      const chosenIds =
        options.unitIds && options.unitIds.length > 0
          ? options.unitIds.slice(0, reviveCount)
          : dead.slice(0, reviveCount).map((unit) => unit.id);

      await db
        .update(things)
        .set({ location: "HAND", territory_id: null })
        .where(inArray(things.id, chosenIds))
        .run();
      await returnToDeck(item.id);
      return { effect: "talisman", revived: chosenIds };
    }
    default:
      throw new Error("Unsupported magic item");
  }
}

export async function useMasterThief(
  gameId: string,
  playerId: string,
  targetPlayerId: string
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "WAR") {
    throw new Error("Thief can only be used after war");
  }
  if (game.combat_state) throw new Error("Resolve combat first");

  const thief = await db
    .select()
    .from(things)
    .where(
      and(
        eq(things.owner_id, playerId),
        eq(things.location, "BOARD"),
        eq(things.template_id, "master_thief")
      )
    )
    .get();
  if (!thief) throw new Error("Master Thief not in your army");

  const target = await db
    .select()
    .from(players)
    .where(and(eq(players.id, targetPlayerId), eq(players.game_id, gameId)))
    .get();
  if (!target) throw new Error("Target player not found");
  const thiefPlayer = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.game_id, gameId)))
    .get();
  if (!thiefPlayer) throw new Error("Player not found");

  const first = rollD6();
  const second = rollD6();
  if (first > second) {
    const steal = Math.min(first - second, target.gold || 0);
    await db
      .update(players)
      .set({ gold: (target.gold || 0) - steal })
      .where(eq(players.id, targetPlayerId))
      .run();
    await db
      .update(players)
      .set({ gold: (thiefPlayer.gold || 0) + steal })
      .where(eq(players.id, playerId))
      .run();
    return { effect: "thief", stolen: steal };
  }
  if (first < second) {
    return { effect: "thief", stolen: 0 };
  }

  const tieRollA = rollD6();
  const tieRollB = rollD6();
  if (tieRollA > tieRollB) {
    return { effect: "thief", stolen: 0 };
  }

  await db
    .update(things)
    .set({ location: "BANK", owner_id: null, territory_id: null })
    .where(eq(things.id, thief.id))
    .run();
  return { effect: "thief", stolen: 0, killed: true };
}

export async function useAssassin(
  gameId: string,
  playerId: string,
  targetPlayerId: string
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "WAR") {
    throw new Error("Assassin can only be used after war");
  }
  if (game.combat_state) throw new Error("Resolve combat first");

  const assassin = await db
    .select()
    .from(things)
    .where(
      and(
        eq(things.owner_id, playerId),
        eq(things.location, "BOARD"),
        eq(things.template_id, "assassin_primus")
      )
    )
    .get();
  if (!assassin) throw new Error("Assassin Primus not in your army");

  const targetUnits = await db
    .select()
    .from(things)
    .where(
      and(
        eq(things.owner_id, targetPlayerId),
        eq(things.location, "BOARD"),
        eq(things.game_id, gameId)
      )
    )
    .all();
  if (targetUnits.length === 0) throw new Error("Target has no standing army");

  const first = rollD6();
  const second = rollD6();
  if (first > second) {
    const victim = targetUnits[Math.floor(Math.random() * targetUnits.length)];
    await killUnitDirect(victim.id);
    return { effect: "assassin", killedUnitId: victim.id };
  }
  if (first < second) {
    return { effect: "assassin", killedUnitId: null };
  }

  const tieRollA = rollD6();
  const tieRollB = rollD6();
  if (tieRollA > tieRollB) {
    return { effect: "assassin", killedUnitId: null };
  }

  await db
    .update(things)
    .set({ location: "BANK", owner_id: null, territory_id: null })
    .where(eq(things.id, assassin.id))
    .run();
  return { effect: "assassin", killedUnitId: null, killedAssassin: true };
}

async function killUnitDirect(unitId: string) {
  const unit = await db
    .select()
    .from(things)
    .where(eq(things.id, unitId))
    .get();
  const template = THING_TEMPLATES[unit?.template_id || ""];
  const isSpecial = template?.kind === "SPECIAL";

  await db
    .update(things)
    .set({
      location: isSpecial ? "BANK" : "DISCARD",
      owner_id: isSpecial ? null : unit?.owner_id,
      territory_id: null,
    })
    .where(eq(things.id, unitId))
    .run();

  await db
    .update(things)
    .set({
      location: "DECK",
      owner_id: null,
      attached_to_thing_id: null,
      territory_id: null,
    })
    .where(eq(things.attached_to_thing_id, unitId))
    .run();
}

async function returnToDeck(thingId: string) {
  await db
    .update(things)
    .set({ location: "DECK", owner_id: null, territory_id: null, attached_to_thing_id: null })
    .where(eq(things.id, thingId))
    .run();
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}
