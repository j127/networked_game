import { db } from "../db";
import { territories, logs, players, things } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { EVENTS_TABLE, THING_TEMPLATES } from "./data";
import { getPlayersInGame } from "../db/queries";

export async function performEventsPhase(gameId: string) {
  const playerList = await getPlayersInGame(gameId);
  await handleEvents(gameId, playerList);
}

async function handleEvents(
  gameId: string,
  playersInGame: { id: string; name: string }[]
) {
  for (const player of playersInGame) {
    const firstDie = rollD6();
    const secondDie = rollD6();
    const event = EVENTS_TABLE.find(
      (entry) =>
        entry.firstDie === firstDie && entry.secondDie.includes(secondDie)
    );
    const effect = event?.effect ?? "NO_EVENT";
    const message = `Event Roll (${player.name}): ${firstDie}, ${secondDie}. ${
      event?.name ?? "No Event"
    }.`;

    await applyEventEffect(gameId, effect, player.id);

    await db
      .insert(logs)
      .values({
        game_id: gameId,
        message,
      })
      .run();
  }
}

async function applyEventEffect(gameId: string, effect: string, playerId: string) {
  switch (effect) {
    case "FOREST_FIRE":
      await applyTerrainDisaster(gameId, "FOREST");
      break;
    case "PRAIRIE_FIRE":
      await applyTerrainDisaster(gameId, "PLAINS");
      break;
    case "FLOODS":
      await applyTerrainDisaster(gameId, "SWAMP");
      break;
    case "EARTHQUAKES":
      await applyTerrainDisaster(gameId, "MOUNTAIN");
      break;
    case "SANDSTORMS":
      await applyTerrainDisaster(gameId, "DESERT");
      break;
    case "WILLING_WORKERS":
      await applyWillingWorkers(gameId, playerId);
      break;
    case "GOOD_OMEN":
      await drawFreeTile(gameId, playerId);
      break;
    case "MOTHER_LODE":
      await applyMotherLode(gameId, playerId);
      break;
    case "PENNIES_FROM_HEAVEN":
      await addGold(playerId, 1);
      break;
    case "D6_TAX_LAW":
      await addGold(playerId, rollD6());
      break;
    case "GOOD_HARVEST":
      await addGold(playerId, await calculateHoldingsGold(gameId, playerId));
      break;
    case "BLACK_PLAGUE":
      await applyBlackPlague(gameId);
      break;
    case "SMALLPOX":
      await applySmallpox(gameId);
      break;
    default:
      break;
  }
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

async function applyTerrainDisaster(gameId: string, terrainType: string) {
  const targets = await db
    .select()
    .from(territories)
    .where(
      and(
        eq(territories.game_id, gameId),
        eq(territories.terrain_type, terrainType),
        eq(territories.location, "BOARD")
      )
    )
    .all();

  for (const t of targets) {
    const roll = rollD6() + rollD6();
    if (roll !== 7) continue;

    if ((t.fortification_level || 0) > 0) {
      await db
        .update(territories)
        .set({ fortification_level: (t.fortification_level || 0) - 1 })
        .where(eq(territories.id, t.id))
        .run();
    }

    const hadSettlement = (t.settlement_value || 0) > 0;
    if (hadSettlement) {
      const saved = rollD6() % 2 === 0;
      if (!saved) {
        await db
          .update(territories)
          .set({ settlement_type: null, settlement_value: 0 })
          .where(eq(territories.id, t.id))
          .run();
      }
    }

    const fortRemaining = (t.fortification_level || 0) > 0;
    const settlementRemaining =
      (t.settlement_value || 0) > 0 || hadSettlement;
    if (!fortRemaining && !settlementRemaining) {
      await db
        .update(territories)
        .set({
          owner_id: null,
          location: "DECK",
          settlement_type: null,
          settlement_value: 0,
          fortification_level: 0,
        })
        .where(eq(territories.id, t.id))
        .run();
    }
  }
}

async function applyWillingWorkers(gameId: string, playerId: string) {
  const owned = await db
    .select()
    .from(territories)
    .where(
      and(
        eq(territories.game_id, gameId),
        eq(territories.owner_id, playerId),
        eq(territories.location, "BOARD")
      )
    )
    .all();

  const forts = owned.filter((t) => (t.fortification_level || 0) > 0);
  if (forts.length === 0) {
    if (owned.length === 0) {
      await addGold(playerId, 10);
      return;
    }
    const target = owned[0];
    await db
      .update(territories)
      .set({ fortification_level: 1 })
      .where(eq(territories.id, target.id))
      .run();
    return;
  }

  const upgradable = forts.filter((t) => (t.fortification_level || 0) < 4);
  if (upgradable.length === 0) {
    await addGold(playerId, 10);
    return;
  }

  const target = upgradable[0];
  await db
    .update(territories)
    .set({ fortification_level: (target.fortification_level || 0) + 1 })
    .where(eq(territories.id, target.id))
    .run();
}

async function drawFreeTile(gameId: string, playerId: string) {
  const tile = await db
    .select()
    .from(things)
    .where(and(eq(things.game_id, gameId), eq(things.location, "DECK")))
    .limit(1)
    .get();
  if (!tile) return;
  await db
    .update(things)
    .set({ location: "HAND", owner_id: playerId })
    .where(eq(things.id, tile.id))
    .run();
}

async function applyMotherLode(gameId: string, playerId: string) {
  const mines = await db
    .select()
    .from(territories)
    .where(
      and(
        eq(territories.game_id, gameId),
        eq(territories.owner_id, playerId),
        eq(territories.location, "BOARD")
      )
    )
    .all()
    .filter((t) => (t.settlement_type || "").startsWith("MINE_"));
  const mineGold = mines.reduce((sum, t) => sum + (t.settlement_value || 0), 0);
  await addGold(playerId, mineGold);
}

async function calculateHoldingsGold(gameId: string, playerId: string) {
  const owned = await db
    .select()
    .from(territories)
    .where(
      and(
        eq(territories.game_id, gameId),
        eq(territories.owner_id, playerId),
        eq(territories.location, "BOARD")
      )
    )
    .all();
  let total = owned.length;
  for (const t of owned) {
    total += t.fortification_level || 0;
    total += t.settlement_value || 0;
  }
  const army = await db
    .select()
    .from(things)
    .where(and(eq(things.owner_id, playerId), eq(things.location, "BOARD")))
    .all();
  const hasDwarfKing = army.some(
    (unit) => THING_TEMPLATES[unit.template_id || ""]?.id === "dwarf_king"
  );
  return hasDwarfKing ? total + 1 : total;
}

async function addGold(playerId: string, amount: number) {
  if (amount <= 0) return;
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (!player) return;
  await db
    .update(players)
    .set({ gold: (player.gold || 0) + amount })
    .where(eq(players.id, playerId))
    .run();
}

async function applySmallpox(gameId: string) {
  const units = await db
    .select()
    .from(things)
    .where(and(eq(things.game_id, gameId), eq(things.location, "BOARD")))
    .all();
  for (const unit of units) {
    const roll = rollD6() + rollD6();
    if (roll === 7) {
      await removeUnit(unit.id);
    }
  }
}

async function applyBlackPlague(gameId: string) {
  const playersInGame = await db
    .select()
    .from(players)
    .where(eq(players.game_id, gameId))
    .all();
  if (playersInGame.length === 0) return;

  let targetPlayer = playersInGame[0];
  let maxArmy = -1;
  for (const player of playersInGame) {
    const count = (await db
      .select()
      .from(things)
      .where(and(eq(things.owner_id, player.id), eq(things.location, "BOARD")))
      .all()).length;
    if (count > maxArmy) {
      maxArmy = count;
      targetPlayer = player;
    }
  }

  const units = await db
    .select()
    .from(things)
    .where(
      and(eq(things.owner_id, targetPlayer.id), eq(things.location, "BOARD"))
    )
    .all();
  for (const unit of units) {
    const roll = rollD6();
    if (roll % 2 === 1) {
      await removeUnit(unit.id);
    }
  }
}

async function removeUnit(unitId: string) {
  await db
    .update(things)
    .set({ location: "DISCARD", territory_id: null })
    .where(eq(things.id, unitId))
    .run();
}
