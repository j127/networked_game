import { db } from "../db";
import { games, things, territories } from "../db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { THING_TEMPLATES } from "./data";
import { getGame } from "../db/queries";

export interface CombatState {
  attackerId: string;
  defenderId: string;
  territoryId: string;
  attackerUnitIds: string[];
  defenderUnitIds: string[];
  stage: "INITIATIVE" | "RANGED" | "MELEE";
  initiativeWinner?: "ATTACKER" | "DEFENDER";
  logs: string[];
  fortRemaining: number;
}

export async function declareAttack(
  gameId: string,
  attackerId: string,
  fromTerritoryId: string,
  toTerritoryId: string,
  unitIds: string[]
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "WAR") throw new Error("Can only attack during WAR phase");

  const fromTerritory = await db
    .select()
    .from(territories)
    .where(and(eq(territories.id, fromTerritoryId), eq(territories.game_id, gameId)))
    .get();
  const toTerritory = await db
    .select()
    .from(territories)
    .where(and(eq(territories.id, toTerritoryId), eq(territories.game_id, gameId)))
    .get();

  if (!fromTerritory || !toTerritory) throw new Error("Territory not found");
  if (fromTerritory.owner_id !== attackerId) throw new Error("You don't own the source territory");
  if (!toTerritory.owner_id) throw new Error("Cannot attack unowned territory");
  if (toTerritory.owner_id === attackerId) throw new Error("You can't attack yourself");

  const units = await db
    .select()
    .from(things)
    .where(and(inArray(things.id, unitIds), eq(things.owner_id, attackerId)))
    .all();
  if (units.length !== unitIds.length) throw new Error("Invalid units selected");

  for (const u of units) {
    if (u.territory_id !== fromTerritoryId || u.location !== "BOARD") {
      throw new Error(`Unit ${u.id} is not on the source territory`);
    }
  }

  const defenderUnits = await db
    .select()
    .from(things)
    .where(
      and(
        eq(things.territory_id, toTerritoryId),
        eq(things.location, "BOARD")
      )
    )
    .all();

  const fortValue = calculateFortDefense(toTerritory);
  const combatState: CombatState = {
    attackerId,
    defenderId: toTerritory.owner_id,
    territoryId: toTerritoryId,
    attackerUnitIds: unitIds,
    defenderUnitIds: defenderUnits.map((u) => u.id),
    stage: "INITIATIVE",
    logs: [`${attackerId} attacked ${toTerritoryId}.`],
    fortRemaining: fortValue,
  };

  await db
    .update(games)
    .set({ combat_state: JSON.stringify(combatState) })
    .where(eq(games.id, gameId))
    .run();

  return combatState;
}

export async function resolveCombatStep(gameId: string) {
  const game = await getGame(gameId);
  if (!game || !game.combat_state) throw new Error("No active combat");

  const state: CombatState = JSON.parse(game.combat_state as string);
  if (state.stage === "INITIATIVE") {
    const attackerCount = state.attackerUnitIds.length;
    const defenderCount = state.defenderUnitIds.length;
    const attackerBonus = attackerCount < defenderCount ? 1 : 0;
    const defenderBonus = defenderCount < attackerCount ? 1 : 0;

    let attackerRoll = rollD6() + attackerBonus;
    let defenderRoll = rollD6() + defenderBonus;
    while (attackerRoll === defenderRoll) {
      attackerRoll = rollD6() + attackerBonus;
      defenderRoll = rollD6() + defenderBonus;
    }
    state.initiativeWinner = attackerRoll > defenderRoll ? "ATTACKER" : "DEFENDER";
    state.stage = "RANGED";
    state.logs.push(
      `Initiative: Attacker ${attackerRoll}, Defender ${defenderRoll}. Winner: ${state.initiativeWinner}.`
    );
  } else if (state.stage === "RANGED") {
    const rangedResult = await resolveStage(state, "RANGED");
    state.logs.push(...rangedResult.logs);
    state.fortRemaining = rangedResult.fortRemaining;
    state.attackerUnitIds = rangedResult.attackerUnitIds;
    state.defenderUnitIds = rangedResult.defenderUnitIds;

    if (isBattleOver(state)) {
      return await finishCombat(gameId, state);
    }
    state.stage = "MELEE";
  } else if (state.stage === "MELEE") {
    const meleeResult = await resolveStage(state, "MELEE");
    state.logs.push(...meleeResult.logs);
    state.fortRemaining = meleeResult.fortRemaining;
    state.attackerUnitIds = meleeResult.attackerUnitIds;
    state.defenderUnitIds = meleeResult.defenderUnitIds;

    return await finishCombat(gameId, state);
  }

  await db
    .update(games)
    .set({ combat_state: JSON.stringify(state) })
    .where(eq(games.id, gameId))
    .run();
  return state;
}

async function resolveStage(state: CombatState, stage: "RANGED" | "MELEE") {
  const logs: string[] = [];
  const attackerUnits = await loadUnits(state.attackerUnitIds);
  const defenderUnits = await loadUnits(state.defenderUnitIds);
  const territory = await db
    .select()
    .from(territories)
    .where(eq(territories.id, state.territoryId))
    .get();

  if (!territory) {
    throw new Error("Territory not found");
  }

  const attackerHits = rollAttacks(
    attackerUnits,
    territory.terrain_type,
    stage,
    true
  );
  const defenderUnitHits = rollAttacks(
    defenderUnits,
    territory.terrain_type,
    stage,
    false
  );
  const fortHits = rollFortDice(state.fortRemaining);
  const defenderHits = defenderUnitHits + fortHits;

  logs.push(
    `${stage} combat: attacker hits ${attackerHits}, defender hits ${defenderHits} (forts ${fortHits}).`
  );

  const defenderResult = await applyHitsToDefender(
    defenderUnits,
    attackerHits,
    state.fortRemaining
  );
  const attackerResult = await applyHitsToAttacker(attackerUnits, defenderHits);

  logs.push(...defenderResult.logs, ...attackerResult.logs);

  return {
    logs,
    fortRemaining: defenderResult.fortRemaining,
    attackerUnitIds: attackerResult.remainingIds,
    defenderUnitIds: defenderResult.remainingIds,
  };
}

function rollAttacks(
  units: typeof things.$inferSelect[],
  terrainType: string | null,
  stage: "RANGED" | "MELEE",
  isAttacker: boolean
) {
  let hits = 0;
  for (const unit of units) {
    const template = THING_TEMPLATES[unit.template_id || ""];
    if (!template || template.kind !== "CHARACTER") continue;
    const isRanged = template.abilities.includes("R");
    if (stage === "RANGED" && !isRanged) continue;
    if (stage === "MELEE" && isRanged) continue;

    let diceCount = template.combat;
    if (template.terrain && template.terrain === terrainType) {
      diceCount += 1;
    }
    if (stage === "MELEE" && isAttacker && template.abilities.includes("C")) {
      diceCount += rollD6();
    }

    for (let i = 0; i < diceCount; i++) {
      const roll = rollD6();
      if (template.abilities.includes("MAGIC")) {
        if (roll >= 5) hits++;
      } else {
        if (roll === 6) hits++;
      }
    }
  }
  return hits;
}

async function applyHitsToDefender(
  defenderUnits: typeof things.$inferSelect[],
  hits: number,
  fortRemaining: number
) {
  const logs: string[] = [];
  let remainingHits = hits;

  if (fortRemaining > 0) {
    const hitsOnFort = Math.min(remainingHits, fortRemaining);
    remainingHits -= hitsOnFort;
    fortRemaining -= hitsOnFort;
    logs.push(`Fortifications absorbed ${hitsOnFort} hits.`);
  }

  const result = await applyHitsToUnits(defenderUnits, remainingHits);
  return {
    logs: logs.concat(result.logs),
    remainingIds: result.remainingIds,
    fortRemaining,
  };
}

async function applyHitsToAttacker(
  attackerUnits: typeof things.$inferSelect[],
  hits: number
) {
  const result = await applyHitsToUnits(attackerUnits, hits);
  return {
    logs: result.logs,
    remainingIds: result.remainingIds,
  };
}

async function applyHitsToUnits(
  units: typeof things.$inferSelect[],
  hits: number
) {
  const logs: string[] = [];
  const remaining = [...units];
  let remainingHits = hits;

  while (remainingHits > 0 && remaining.length > 0) {
    const unit = remaining.shift();
    if (!unit) break;

    const template = THING_TEMPLATES[unit.template_id || ""];
    const isFlying = template?.abilities.includes("FLYING");
    const hitPoints = template?.id === "sword_master" ? 2 : 1;

    if (isFlying && remainingHits === 1) {
      const saved = rollD6() % 2 === 0;
      if (saved) {
        remaining.push(unit);
        remainingHits -= 1;
        continue;
      }
    }

    remainingHits -= hitPoints;
    await db
      .update(things)
      .set({ location: "DISCARD", territory_id: null })
      .where(eq(things.id, unit.id))
      .run();
    logs.push(`Unit ${unit.id} was killed.`);
  }

  return { remainingIds: remaining.map((u) => u.id), logs };
}

function isBattleOver(state: CombatState) {
  if (state.attackerUnitIds.length === 0) return true;
  if (state.defenderUnitIds.length === 0 && state.fortRemaining <= 0) return true;
  return false;
}

async function finishCombat(gameId: string, state: CombatState) {
  const territory = await db
    .select()
    .from(territories)
    .where(eq(territories.id, state.territoryId))
    .get();
  if (!territory) throw new Error("Territory not found");

  if (state.attackerUnitIds.length > 0 && state.defenderUnitIds.length === 0 && state.fortRemaining <= 0) {
    await db
      .update(territories)
      .set({ owner_id: state.attackerId })
      .where(eq(territories.id, state.territoryId))
      .run();

    await applyCaptureSavingRolls(territory, state.attackerId);

    await db
      .update(things)
      .set({ territory_id: state.territoryId, location: "BOARD" })
      .where(inArray(things.id, state.attackerUnitIds))
      .run();

    state.logs.push(`Attacker ${state.attackerId} captured the territory.`);
  } else {
    state.logs.push("Defender held the territory.");
  }

  await db
    .update(games)
    .set({ combat_state: null })
    .where(eq(games.id, gameId))
    .run();

  return { ...state, finished: true };
}

async function applyCaptureSavingRolls(
  territory: typeof territories.$inferSelect,
  attackerId: string
) {
  const hasSettlement =
    (territory.settlement_value || 0) > 0 &&
    !(territory.settlement_type || "").startsWith("MINE_");
  const hasMine = (territory.settlement_type || "").startsWith("MINE_");
  const hasFort = (territory.fortification_level || 0) > 0;

  let settlementValue = territory.settlement_value || 0;
  let settlementType = territory.settlement_type;
  if (hasSettlement || hasMine) {
    const saved = rollD6() % 2 === 0;
    if (!saved) {
      settlementType = null;
      settlementValue = 0;
    }
  }

  let fortLevel = territory.fortification_level || 0;
  if (hasFort) {
    const saved = rollD6() % 2 === 0;
    if (!saved) {
      fortLevel = 0;
    }
  }

  if (fortLevel === 4) {
    const existingGran = await db
      .select()
      .from(territories)
      .where(and(eq(territories.owner_id, attackerId), eq(territories.fortification_level, 4)))
      .all();
    if (existingGran.length > 0) {
      fortLevel = 3;
    }
  }

  await db
    .update(territories)
    .set({
      settlement_type: settlementType,
      settlement_value: settlementValue,
      fortification_level: fortLevel,
    })
    .where(eq(territories.id, territory.id))
    .run();
}

function calculateFortDefense(territory: typeof territories.$inferSelect) {
  const fort = territory.fortification_level || 0;
  const isMine = (territory.settlement_type || "").startsWith("MINE_");
  const settlementDefense = isMine ? 0 : territory.settlement_value || 0;
  return fort + settlementDefense;
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollFortDice(count: number) {
  if (count <= 0) return 0;
  let hits = 0;
  for (let i = 0; i < count; i++) {
    if (rollD6() === 6) hits++;
  }
  return hits;
}

async function loadUnits(ids: string[]) {
  if (ids.length === 0) return [];
  return await db
    .select()
    .from(things)
    .where(inArray(things.id, ids))
    .all();
}
