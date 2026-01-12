import { db } from "../db";
import { games, things, territories } from "../db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { THING_TEMPLATES } from "./data";
import { getGame } from "../db/queries";

type RollEntry = {
  unitId: string;
  value: number;
  hitOn: number;
};

export interface CombatState {
  attackerId: string;
  defenderId: string;
  territoryId: string;
  attackerUnitIds: string[];
  defenderUnitIds: string[];
  defenderAllUnitIds: string[];
  stage: "INITIATIVE" | "RANGED" | "MELEE";
  initiativeWinner?: "ATTACKER" | "DEFENDER";
  logs: string[];
  fortRemaining: number;
  combatType: "PVP" | "FIGHT";
  pendingCasualties?: {
    playerId: string;
    hits: number;
    stage: "RANGED" | "MELEE";
    availableUnitIds: string[];
  }[];
  pendingStage?: "RANGED" | "MELEE";
  unitDamage?: Record<string, number>;
  autoFortApplied?: boolean;
  lastRolls?: {
    stage: "RANGED" | "MELEE";
    attacker: RollEntry[];
    defender: RollEntry[];
    fort: number[];
  };
  lastStageFortStart?: number;
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
  if (game.war_disabled) throw new Error("War has been stopped for this turn");

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
    defenderAllUnitIds: defenderUnits.map((u) => u.id),
    stage: "INITIATIVE",
    logs: [`${attackerId} attacked ${toTerritoryId}.`],
    fortRemaining: fortValue,
    combatType: "PVP",
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

  let state: CombatState = JSON.parse(game.combat_state as string);
  if (state.pendingCasualties && state.pendingCasualties.length > 0) {
    return state;
  }
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
    const rangedResult = await resolveStage(
      state,
      "RANGED",
      game.magic_dispell_player_id
    );
    state.logs.push(...rangedResult.logs);
    state.fortRemaining = rangedResult.fortRemaining;
    state.attackerUnitIds = rangedResult.attackerUnitIds;
    state.defenderUnitIds = rangedResult.defenderUnitIds;
    state.pendingCasualties = rangedResult.pendingCasualties;
    state.pendingStage = rangedResult.pendingStage;
    state.unitDamage = rangedResult.unitDamage;
    state.autoFortApplied = rangedResult.autoFortApplied;
    state.lastRolls = rangedResult.lastRolls;
    state.lastStageFortStart = rangedResult.lastStageFortStart;

    if (state.pendingCasualties && state.pendingCasualties.length > 0) {
      state = await autoResolveNeutralCasualties(state);
      if (state.pendingCasualties && state.pendingCasualties.length > 0) {
        await db
          .update(games)
          .set({ combat_state: JSON.stringify(state) })
          .where(eq(games.id, gameId))
          .run();
        return state;
      }
    }

    if (isBattleOver(state)) {
      return await finishCombat(gameId, state);
    }
    state.stage = "MELEE";
  } else if (state.stage === "MELEE") {
    const meleeResult = await resolveStage(
      state,
      "MELEE",
      game.magic_dispell_player_id
    );
    state.logs.push(...meleeResult.logs);
    state.fortRemaining = meleeResult.fortRemaining;
    state.attackerUnitIds = meleeResult.attackerUnitIds;
    state.defenderUnitIds = meleeResult.defenderUnitIds;
    state.pendingCasualties = meleeResult.pendingCasualties;
    state.pendingStage = meleeResult.pendingStage;
    state.unitDamage = meleeResult.unitDamage;
    state.autoFortApplied = meleeResult.autoFortApplied;
    state.lastRolls = meleeResult.lastRolls;
    state.lastStageFortStart = meleeResult.lastStageFortStart;

    if (state.pendingCasualties && state.pendingCasualties.length > 0) {
      state = await autoResolveNeutralCasualties(state);
      if (state.pendingCasualties && state.pendingCasualties.length > 0) {
        await db
          .update(games)
          .set({ combat_state: JSON.stringify(state) })
          .where(eq(games.id, gameId))
          .run();
        return state;
      }
    }

    return await finishCombat(gameId, state);
  }

  await db
    .update(games)
    .set({ combat_state: JSON.stringify(state) })
    .where(eq(games.id, gameId))
    .run();
  return state;
}

export async function startFightCombat(
  gameId: string,
  attackerId: string,
  territoryId: string,
  defenderUnitIds: string[],
  attackerUnitIds: string[]
) {
  const combatState: CombatState = {
    attackerId,
    defenderId: "LAND_DECK",
    territoryId,
    attackerUnitIds,
    defenderUnitIds: defenderUnitIds,
    defenderAllUnitIds: defenderUnitIds,
    stage: "RANGED",
    logs: ["Fight for land begins."],
    fortRemaining: 0,
    combatType: "FIGHT",
  };

  await db
    .update(games)
    .set({ combat_state: JSON.stringify(combatState) })
    .where(eq(games.id, gameId))
    .run();

  return combatState;
}

async function resolveStage(
  state: CombatState,
  stage: "RANGED" | "MELEE",
  dispellPlayerId?: string | null
) {
  const logs: string[] = [];
  const attackerUnits = await loadUnits(state.attackerUnitIds);
  const defenderUnits = await loadUnits(state.defenderUnitIds);
  const attachments = await loadAttachments([
    ...state.attackerUnitIds,
    ...state.defenderUnitIds,
  ]);
  const territory = await db
    .select()
    .from(territories)
    .where(eq(territories.id, state.territoryId))
    .get();

  if (!territory) {
    throw new Error("Territory not found");
  }

  const attackerLeaders = getLeaderFlags(attackerUnits);
  const defenderLeaders = getLeaderFlags(defenderUnits);

  let fortRemaining = state.fortRemaining;
  if (
    state.combatType === "PVP" &&
    !state.autoFortApplied &&
    fortRemaining > 0
  ) {
    const autoFortHits = calculateAutoFortHits(attackerUnits, fortRemaining);
    if (autoFortHits > 0) {
      fortRemaining -= autoFortHits;
      logs.push(`Siege leaders auto-hit fortifications for ${autoFortHits}.`);
      state.autoFortApplied = true;
    }
  }
  const fortStart = fortRemaining;

  const attackerRoll = rollAttacks(
    attackerUnits,
    territory.terrain_type,
    stage,
    true,
    attackerLeaders,
    defenderLeaders,
    attachments,
    dispellPlayerId
  );
  const defenderRoll = rollAttacks(
    defenderUnits,
    territory.terrain_type,
    stage,
    false,
    defenderLeaders,
    attackerLeaders,
    attachments,
    dispellPlayerId
  );
  const fortRoll = rollFortDice(fortRemaining);
  const fortHits = fortRoll.hits;
  const attackerHits = attackerRoll.hits;
  const defenderUnitHits = defenderRoll.hits;
  const defenderHits = defenderUnitHits + fortHits;

  logs.push(
    `${stage} combat: attacker hits ${attackerHits}, defender hits ${defenderHits} (forts ${fortHits}).`
  );

  const defenderResult = await applyHitsToDefender(
    defenderUnits,
    attackerHits,
    fortRemaining,
    state.unitDamage || {}
  );
  const attackerResult = await applyHitsToAttacker(
    attackerUnits,
    defenderHits,
    state.unitDamage || {}
  );

  logs.push(...defenderResult.logs, ...attackerResult.logs);

  const eligibleAttackers = filterCasualtyCandidates(attackerUnits, stage);
  const eligibleDefenders = filterCasualtyCandidates(defenderUnits, stage);
  const pendingCasualties = buildPendingCasualties(
    state,
    stage,
    attackerResult.pendingHits,
    defenderResult.pendingHits,
    eligibleAttackers,
    eligibleDefenders
  );

  return {
    logs,
    fortRemaining: defenderResult.fortRemaining,
    attackerUnitIds: attackerResult.remainingIds,
    defenderUnitIds: defenderResult.remainingIds,
    pendingCasualties,
    pendingStage: pendingCasualties?.length ? stage : undefined,
    unitDamage: attackerResult.unitDamage,
    autoFortApplied: state.autoFortApplied,
    lastRolls: {
      stage,
      attacker: attackerRoll.rolls,
      defender: defenderRoll.rolls,
      fort: fortRoll.rolls,
    },
    lastStageFortStart: fortStart,
  };
}

function rollAttacks(
  units: typeof things.$inferSelect[],
  terrainType: string | null,
  stage: "RANGED" | "MELEE",
  isAttacker: boolean,
  friendlyLeaders: LeaderFlags,
  enemyLeaders: LeaderFlags,
  attachments: AttachmentMap,
  dispellPlayerId?: string | null
) {
  const rolls: RollEntry[] = [];
  let hits = 0;

  for (const unit of units) {
    const profile = getUnitCombatProfile(
      unit,
      terrainType,
      stage,
      isAttacker,
      attachments[unit.id] || [],
      dispellPlayerId
    );
    if (!profile.canAttack) continue;

    let diceCount = profile.combat;
    if (profile.terrainMatch) {
      diceCount += 1;
    }
    if (stage === "MELEE" && isAttacker && profile.hasCharge) {
      diceCount += rollD6();
    }
    if (isElf(profile.template) && friendlyLeaders.hasElfLord) {
      diceCount += 1;
    }
    if (isElf(profile.template) && enemyLeaders.hasElfLord) {
      diceCount = Math.max(0, diceCount - 1);
    }
    if (isDwarf(profile.template) && friendlyLeaders.hasDwarfKing) {
      diceCount += 1;
    }
    if (isDwarf(profile.template) && enemyLeaders.hasDwarfKing) {
      diceCount = Math.max(0, diceCount - 1);
    }

    for (let i = 0; i < diceCount; i++) {
      const roll = rollD6();
      const hitOn = profile.hitOn;
      if (roll >= hitOn) hits++;
      rolls.push({ unitId: unit.id, value: roll, hitOn });
    }
  }

  return { hits, rolls };
}

async function applyHitsToDefender(
  defenderUnits: typeof things.$inferSelect[],
  hits: number,
  fortRemaining: number,
  unitDamage: Record<string, number>
) {
  const logs: string[] = [];
  let remainingHits = hits;

  if (fortRemaining > 0) {
    const hitsOnFort = Math.min(remainingHits, fortRemaining);
    remainingHits -= hitsOnFort;
    fortRemaining -= hitsOnFort;
    logs.push(`Fortifications absorbed ${hitsOnFort} hits.`);
  }

  const result = await applyHitsToUnits(defenderUnits, remainingHits, unitDamage);
  return {
    logs: logs.concat(result.logs),
    remainingIds: result.remainingIds,
    fortRemaining,
    pendingHits: result.pendingHits,
    unitDamage: result.unitDamage,
  };
}

async function applyHitsToAttacker(
  attackerUnits: typeof things.$inferSelect[],
  hits: number,
  unitDamage: Record<string, number>
) {
  const result = await applyHitsToUnits(attackerUnits, hits, unitDamage);
  return {
    logs: result.logs,
    remainingIds: result.remainingIds,
    pendingHits: result.pendingHits,
    unitDamage: result.unitDamage,
  };
}

async function applyHitsToUnits(
  units: typeof things.$inferSelect[],
  hits: number,
  unitDamage: Record<string, number>
) {
  const logs: string[] = [];
  const remaining = [...units];
  let remainingHits = hits;
  const pendingHits = hits;

  return { remainingIds: remaining.map((u) => u.id), logs, pendingHits, unitDamage };
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

  const attackerWon =
    state.attackerUnitIds.length > 0 &&
    state.defenderUnitIds.length === 0 &&
    state.fortRemaining <= 0;

  if (state.combatType === "FIGHT") {
    if (attackerWon) {
      await db
        .update(territories)
        .set({
          owner_id: state.attackerId,
          location: "BOARD",
          magic_fort_value: 0,
        })
        .where(eq(territories.id, state.territoryId))
        .run();
      state.logs.push(`Attacker ${state.attackerId} claimed the land.`);
    } else {
      await db
        .update(territories)
        .set({ owner_id: null, location: "DECK", magic_fort_value: 0 })
        .where(eq(territories.id, state.territoryId))
        .run();
      state.logs.push("Fight failed. Land returned to deck.");
    }

    if (state.defenderAllUnitIds.length > 0) {
      await db
        .update(things)
        .set({ location: "DECK", owner_id: null, territory_id: null })
        .where(inArray(things.id, state.defenderAllUnitIds))
        .run();
    }
  } else {
    if (attackerWon) {
      await db
        .update(territories)
        .set({ owner_id: state.attackerId, magic_fort_value: 0 })
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
      await db
        .update(territories)
        .set({ magic_fort_value: 0 })
        .where(eq(territories.id, state.territoryId))
        .run();
      state.logs.push("Defender held the territory.");
    }
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
  const magicFort = territory.magic_fort_value || 0;
  return fort + settlementDefense + magicFort;
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollFortDice(count: number) {
  if (count <= 0) return { hits: 0, rolls: [] as number[] };
  let hits = 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rollD6();
    rolls.push(roll);
    if (roll === 6) hits++;
  }
  return { hits, rolls };
}

async function loadUnits(ids: string[]) {
  if (ids.length === 0) return [];
  return await db
    .select()
    .from(things)
    .where(inArray(things.id, ids))
    .all();
}

type AttachmentMap = Record<string, typeof things.$inferSelect[]>;

async function loadAttachments(unitIds: string[]): Promise<AttachmentMap> {
  if (unitIds.length === 0) return {};
  const attached = await db
    .select()
    .from(things)
    .where(inArray(things.attached_to_thing_id, unitIds))
    .all();
  const map: AttachmentMap = {};
  for (const item of attached) {
    const key = item.attached_to_thing_id;
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

type CombatProfile = {
  template: typeof THING_TEMPLATES[string];
  combat: number;
  hitOn: number;
  hasCharge: boolean;
  terrainMatch: boolean;
  canAttack: boolean;
};

function getUnitCombatProfile(
  unit: typeof things.$inferSelect,
  terrainType: string | null,
  stage: "RANGED" | "MELEE",
  isAttacker: boolean,
  attachments: typeof things.$inferSelect[],
  dispellPlayerId?: string | null
): CombatProfile {
  const template = THING_TEMPLATES[unit.template_id || ""];
  const isCombatUnit =
    template && (template.kind === "CHARACTER" || template.id === "golem");
  if (!template || !isCombatUnit) {
    return {
      template,
      combat: 0,
      hitOn: 6,
      hasCharge: false,
      terrainMatch: false,
      canAttack: false,
    };
  }

  const baseHasR = template.abilities.includes("R");
  const baseHasMagic = template.abilities.includes("MAGIC");
  const hasCharge = template.abilities.includes("C");
  const isDispelled = dispellPlayerId && unit.owner_id === dispellPlayerId;

  const attachedIds = new Set(attachments.map((a) => a.template_id));
  const hasSword = attachedIds.has("magic_sword");
  const hasBow = attachedIds.has("magic_bow");

  let hasR = baseHasR;
  let hasMagic = baseHasMagic;
  let hitOn = baseHasMagic ? 5 : 6;

  if (!isDispelled) {
    if (hasBow) {
      if (hasR) {
        hasMagic = true;
        hitOn = Math.min(hitOn, 5);
      } else {
        hasR = true;
        hitOn = hitOn;
      }
    }

    if (hasSword) {
      const alreadyMagic = hasMagic;
      hasMagic = true;
      hitOn = alreadyMagic ? 4 : 5;
    }
  }

  if (isDispelled && hasMagic) {
    hitOn = 6;
  }

  const isRanged = hasR;
  const canAttack =
    stage === "RANGED" ? isRanged : stage === "MELEE" ? !isRanged : false;

  return {
    template,
    combat: template.combat,
    hitOn,
    hasCharge,
    terrainMatch: template.terrain === terrainType,
    canAttack,
  };
}

function filterCasualtyCandidates(
  units: typeof things.$inferSelect[],
  stage: "RANGED" | "MELEE"
) {
  return units
    .filter((unit) => {
      const template = THING_TEMPLATES[unit.template_id || ""];
      if (!template) return false;
      if (stage === "RANGED" && template.abilities.includes("IMMUNE_RANGED")) {
        return false;
      }
      return true;
    })
    .map((unit) => unit.id);
}

type LeaderFlags = {
  hasElfLord: boolean;
  hasDwarfKing: boolean;
};

function getLeaderFlags(units: typeof things.$inferSelect[]): LeaderFlags {
  return {
    hasElfLord: units.some((u) => u.template_id === "elf_lord"),
    hasDwarfKing: units.some((u) => u.template_id === "dwarf_king"),
  };
}

function isElf(template: typeof THING_TEMPLATES[string]) {
  if (!template) return false;
  if (template.id === "elf_lord") return false;
  return template.name.startsWith("Elf") || template.id.startsWith("elves");
}

function isDwarf(template: typeof THING_TEMPLATES[string]) {
  if (!template) return false;
  if (template.id === "dwarf_king") return false;
  return template.name.startsWith("Dwarf") || template.id.startsWith("dwarves");
}

function calculateAutoFortHits(
  attackerUnits: typeof things.$inferSelect[],
  fortRemaining: number
) {
  if (fortRemaining <= 0) return 0;
  const hasBaron = attackerUnits.some((u) => u.template_id === "baron_munchausen");
  const hasDuke = attackerUnits.some((u) => u.template_id === "grand_duke");
  if (hasBaron && hasDuke && fortRemaining >= 2) return 2;
  if (hasBaron || hasDuke) return 1;
  return 0;
}

function buildPendingCasualties(
  state: CombatState,
  stage: "RANGED" | "MELEE",
  attackerHits: number,
  defenderHits: number,
  attackerUnits: string[],
  defenderUnits: string[]
) {
  const pending: CombatState["pendingCasualties"] = [];

  if (attackerHits > 0) {
    if (attackerUnits.length > 0) {
      pending.push({
        playerId: state.attackerId,
        hits: attackerHits,
        stage,
        availableUnitIds: attackerUnits,
      });
    }
  }
  if (defenderHits > 0) {
    const defenderId =
      state.combatType === "FIGHT" ? "LAND_DECK" : state.defenderId;
    if (defenderUnits.length > 0) {
      pending.push({
        playerId: defenderId,
        hits: defenderHits,
        stage,
        availableUnitIds: defenderUnits,
      });
    }
  }

  return pending.length > 0 ? pending : undefined;
}

export async function assignCasualties(
  gameId: string,
  playerId: string,
  unitIds: string[]
) {
  const game = await getGame(gameId);
  if (!game || !game.combat_state) throw new Error("No active combat");

  const state: CombatState = JSON.parse(game.combat_state as string);
  if (!state.pendingCasualties || state.pendingCasualties.length === 0) {
    throw new Error("No casualties pending");
  }

  const pending = state.pendingCasualties[0];
  if (pending.playerId !== playerId) {
    throw new Error("Not your casualties to assign");
  }
  if (unitIds.length !== pending.hits) {
    throw new Error("Must assign all hits");
  }

  const allowed = new Set(pending.availableUnitIds);
  for (const id of unitIds) {
    if (!allowed.has(id)) {
      throw new Error("Invalid casualty selection");
    }
  }

  await applyCasualties(state, pending, unitIds);

  if (state.pendingCasualties.length === 0) {
    if (state.pendingStage === "RANGED") {
      if (isBattleOver(state)) {
        return await finishCombat(gameId, state);
      }
      state.stage = "MELEE";
      state.pendingStage = undefined;
      await db
        .update(games)
        .set({ combat_state: JSON.stringify(state) })
        .where(eq(games.id, gameId))
        .run();
      return state;
    }
    if (state.pendingStage === "MELEE") {
      return await finishCombat(gameId, state);
    }
  }

  await db
    .update(games)
    .set({ combat_state: JSON.stringify(state) })
    .where(eq(games.id, gameId))
    .run();
  return state;
}

export async function applyLuckyCharm(
  gameId: string,
  options: { side: "ATTACKER" | "DEFENDER" | "FORT"; rollIndex: number; delta: 1 | -1 }
) {
  const game = await getGame(gameId);
  if (!game || !game.combat_state) throw new Error("No active combat");

  const state: CombatState = JSON.parse(game.combat_state as string);
  if (!state.lastRolls) {
    throw new Error("No eligible rolls to modify");
  }

  const { side, rollIndex, delta } = options;
  if (delta !== 1 && delta !== -1) throw new Error("Delta must be +1 or -1");

  if (side === "FORT") {
    const rolls = state.lastRolls.fort;
    if (!rolls || rollIndex < 0 || rollIndex >= rolls.length) {
      throw new Error("Invalid roll index");
    }
    rolls[rollIndex] = clampDie(rolls[rollIndex] + delta);
  } else {
    const rolls =
      side === "ATTACKER" ? state.lastRolls.attacker : state.lastRolls.defender;
    if (!rolls || rollIndex < 0 || rollIndex >= rolls.length) {
      throw new Error("Invalid roll index");
    }
    rolls[rollIndex] = {
      ...rolls[rollIndex],
      value: clampDie(rolls[rollIndex].value + delta),
    };
  }

  state.logs.push("Lucky Charm used to modify a die roll.");
  const recomputed = await recomputeStageFromLastRolls(state);
  await db
    .update(games)
    .set({ combat_state: JSON.stringify(recomputed) })
    .where(eq(games.id, gameId))
    .run();
  return recomputed;
}

async function applyCasualties(
  state: CombatState,
  pending: NonNullable<CombatState["pendingCasualties"]>[number],
  unitIds: string[]
) {
  const unitDamage = state.unitDamage || {};
  const unitHitCounts = unitIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  const allUnits = await loadUnits(pending.availableUnitIds);
  const survivors: string[] = [];
  for (const unit of allUnits) {
    const hits = unitHitCounts[unit.id] || 0;
    if (hits === 0) {
      survivors.push(unit.id);
      continue;
    }

    const template = THING_TEMPLATES[unit.template_id || ""];
    if (
      pending.stage === "RANGED" &&
      template?.abilities.includes("IMMUNE_RANGED")
    ) {
      throw new Error("Cannot assign ranged hits to immune units");
    }
    const isFlying = template?.abilities.includes("FLYING");
    const isSwordMaster = template?.id === "sword_master";

    if (isSwordMaster) {
      const total = (unitDamage[unit.id] || 0) + hits;
      if (total >= 2) {
        await killUnit(unit.id);
        delete unitDamage[unit.id];
      } else {
        unitDamage[unit.id] = total;
        survivors.push(unit.id);
      }
      continue;
    }

    if (isFlying) {
      if (hits >= 2) {
        await killUnit(unit.id);
      } else {
        const saved = rollD6() % 2 === 0;
        if (saved) {
          survivors.push(unit.id);
        } else {
          await killUnit(unit.id);
        }
      }
      continue;
    }

    await killUnit(unit.id);
  }

  if (pending.playerId === state.attackerId) {
    state.attackerUnitIds = survivors;
  } else if (pending.playerId === state.defenderId) {
    state.defenderUnitIds = survivors;
  } else if (pending.playerId === "LAND_DECK") {
    state.defenderUnitIds = survivors;
  }

  state.unitDamage = unitDamage;
  state.pendingCasualties?.shift();
}

async function autoResolveNeutralCasualties(state: CombatState) {
  while (
    state.pendingCasualties &&
    state.pendingCasualties.length > 0 &&
    state.pendingCasualties[0].playerId === "LAND_DECK"
  ) {
    const pending = state.pendingCasualties[0];
    const picks = pickRandomIds(pending.availableUnitIds, pending.hits);
    await applyCasualties(state, pending, picks);
  }

  if (state.pendingCasualties && state.pendingCasualties.length === 0) {
    state.pendingCasualties = undefined;
    state.pendingStage = undefined;
  }

  return state;
}

function pickRandomIds(ids: string[], count: number) {
  const pool = [...ids];
  const chosen: string[] = [];
  while (chosen.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    const [id] = pool.splice(index, 1);
    if (id) chosen.push(id);
  }
  while (chosen.length < count && ids.length > 0) {
    chosen.push(ids[Math.floor(Math.random() * ids.length)]);
  }
  return chosen;
}

async function recomputeStageFromLastRolls(state: CombatState) {
  if (!state.lastRolls) {
    throw new Error("No roll data to recompute");
  }
  const stage = state.lastRolls.stage;
  const fortStart = state.lastStageFortStart ?? state.fortRemaining;

  const attackerHits = state.lastRolls.attacker.reduce(
    (sum, roll) => sum + (roll.value >= roll.hitOn ? 1 : 0),
    0
  );
  const defenderUnitHits = state.lastRolls.defender.reduce(
    (sum, roll) => sum + (roll.value >= roll.hitOn ? 1 : 0),
    0
  );
  const fortHits = state.lastRolls.fort.reduce(
    (sum, roll) => sum + (roll === 6 ? 1 : 0),
    0
  );
  const defenderHits = defenderUnitHits + fortHits;

  const attackerUnits = await loadUnits(state.attackerUnitIds);
  const defenderUnits = await loadUnits(state.defenderUnitIds);

  const defenderResult = await applyHitsToDefender(
    defenderUnits,
    attackerHits,
    fortStart,
    state.unitDamage || {}
  );
  const attackerResult = await applyHitsToAttacker(
    attackerUnits,
    defenderHits,
    state.unitDamage || {}
  );

  const eligibleAttackers = filterCasualtyCandidates(attackerUnits, stage);
  const eligibleDefenders = filterCasualtyCandidates(defenderUnits, stage);
  const pendingCasualties = buildPendingCasualties(
    state,
    stage,
    attackerResult.pendingHits,
    defenderResult.pendingHits,
    eligibleAttackers,
    eligibleDefenders
  );

  return {
    ...state,
    fortRemaining: defenderResult.fortRemaining,
    attackerUnitIds: attackerResult.remainingIds,
    defenderUnitIds: defenderResult.remainingIds,
    pendingCasualties,
    pendingStage: pendingCasualties?.length ? stage : undefined,
    unitDamage: attackerResult.unitDamage,
  };
}

function clampDie(value: number) {
  if (value < 1) return 1;
  if (value > 6) return 6;
  return value;
}

async function killUnit(unitId: string) {
  const unit = await db
    .select()
    .from(things)
    .where(eq(things.id, unitId))
    .get();
  const template = THING_TEMPLATES[unit?.template_id || ""];
  const isSpecial = template?.kind === "SPECIAL";
  let location = isSpecial ? "BANK" : "DISCARD";
  let ownerId = isSpecial ? null : unit?.owner_id;

  if (!isSpecial && unit?.game_id) {
    const game = await getGame(unit.game_id);
    if (game?.current_phase === "WAR" && unit.owner_id) {
      const talisman = await db
        .select()
        .from(things)
        .where(
          and(
            eq(things.owner_id, unit.owner_id),
            eq(things.location, "HAND"),
            eq(things.template_id, "talisman")
          )
        )
        .get();
      if (talisman) {
        location = "WAR_DEAD";
      }
    }
  }

  await db
    .update(things)
    .set({
      location,
      territory_id: null,
      owner_id: ownerId,
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
