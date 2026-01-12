import { db } from "../db";
import { games, things, territories, players } from "../db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { THING_TEMPLATES } from "./data";
import { getGame } from "../db/queries";

export interface CombatState {
  attackerId: string;
  defenderId: string;
  territoryId: string;
  attackerUnitIds: string[];
  defenderUnitIds: string[];
  currentRound: number;
  stage: 'INITIATIVE' | 'RANGED' | 'MELEE' | 'CASUALTIES';
  initiativeWinner?: string; // 'ATTACKER' | 'DEFENDER'
  pendingCasualties?: {
    playerId: string;
    count: number;
    source: 'RANGED' | 'MELEE' | 'MAGIC';
  };
  logs: string[];
}

export function declareAttack(gameId: string, attackerId: string, fromTerritoryId: string, toTerritoryId: string, unitIds: string[]) {
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "WAR") throw new Error("Can only attack during WAR phase");

  // 1. Validation
  const fromTerritory = db.select().from(territories).where(eq(territories.id, fromTerritoryId)).get();
  const toTerritory = db.select().from(territories).where(eq(territories.id, toTerritoryId)).get();

  if (!fromTerritory || !toTerritory) throw new Error("Territory not found");
  if (fromTerritory.owner_id !== attackerId) throw new Error("You don't own the source territory");
  if (toTerritory.owner_id === attackerId) throw new Error("You can't attack yourself");
  
  // Validate units
  const units = db.select().from(things).where(and(inArray(things.id, unitIds), eq(things.owner_id, attackerId))).all();
  if (units.length !== unitIds.length) throw new Error("Invalid units selected");
  
  // Ensure units are ON the source territory
  for (const u of units) {
    if (u.territory_id !== fromTerritoryId) throw new Error(`Unit ${u.id} is not on the source territory`);
  }

  // Get Defender Units
  const defenderUnits = db.select().from(things).where(and(eq(things.territory_id, toTerritoryId), eq(things.location, "BOARD"))).all();
  
  if (!toTerritory.owner_id) {
      // Logic for neutral territory or unowned? Specs say "The Land Deck that has been played". 
      // Usually owned once placed. If unowned (e.g. initial exploration?), we might skip combat or fight neutral monsters.
      // For now, assume PVP.
      throw new Error("Cannot attack unowned territory (not implemented)");
  }

  // 2. Initialize Combat State
  const combatState: CombatState = {
    attackerId,
    defenderId: toTerritory.owner_id,
    territoryId: toTerritoryId,
    attackerUnitIds: unitIds,
    defenderUnitIds: defenderUnits.map(u => u.id),
    currentRound: 1,
    stage: 'INITIATIVE',
    logs: [`${attackerId} attacked ${toTerritoryId}!`]
  };

  db.update(games)
    .set({ combat_state: JSON.stringify(combatState) })
    .where(eq(games.id, gameId))
    .run();

  return combatState;
}

export function resolveCombatStep(gameId: string) {
    const game = getGame(gameId);
    if (!game || !game.combat_state) throw new Error("No active combat");
    
    let state: CombatState = JSON.parse(game.combat_state as string);

    // Simple State Machine for Combat Steps
    if (state.stage === 'INITIATIVE') {
        const attRoll = rollD6();
        const defRoll = rollD6();
        state.logs.push(`Initiative: Attacker rolled ${attRoll}, Defender rolled ${defRoll}`);
        
        // Tie goes to defender usually, or re-roll. Let's say Defender wins ties.
        state.initiativeWinner = attRoll > defRoll ? 'ATTACKER' : 'DEFENDER';
        state.stage = 'RANGED';
        state.logs.push(`Phase: RANGED`);
    } 
    else if (state.stage === 'RANGED') {
        // Resolve Ranged Fire (Simultaneous or Initiative based? Specs: "Attacker Ranged -> Defender assigns hits...")
        // Wait, specs say: "Attacker Ranged fire -> Defender assigns hits -> Defender Ranged fire -> Attacker assigns hits."
        // This implies multiple interactions within RANGED.
        
        // For MVP, let's just do a bulk roll for both sides and sum hits.
        const attHits = rollAttacks(state.attackerUnitIds, 'RANGED');
        const defHits = rollAttacks(state.defenderUnitIds, 'RANGED');

        state.logs.push(`Ranged Round: Attacker hits ${attHits}, Defender hits ${defHits}`);

        if (attHits > 0 || defHits > 0) {
            state.pendingCasualties = {
                playerId: state.defenderId, // Simplifying: Just one side resolves first? No, we need a queue.
                // Complex casualty resolution is hard to do fully auto if users need to select.
                // We'll set a generic "pending" state.
                count: attHits,
                source: 'RANGED'
            };
            // NOTE: This logic is incomplete. We need to handle BOTH sides taking casualties.
            // For MVP, we apply damage automatically to random units or ask user.
            // Let's implement AUTO-CASUALTY for now to get the loop working.
            
            applyAutoCasualties(state, state.defenderId, attHits);
            applyAutoCasualties(state, state.attackerId, defHits);
        }
        
        state.stage = 'MELEE';
        state.logs.push(`Phase: MELEE`);
    }
    else if (state.stage === 'MELEE') {
        const attHits = rollAttacks(state.attackerUnitIds, 'MELEE');
        const defHits = rollAttacks(state.defenderUnitIds, 'MELEE');

        state.logs.push(`Melee Round: Attacker hits ${attHits}, Defender hits ${defHits}`);

        applyAutoCasualties(state, state.defenderId, attHits);
        applyAutoCasualties(state, state.attackerId, defHits);

        // Check for end of combat
        if (checkCombatEnd(state)) {
            // Combat Over
            // Handle victory/defeat
            endCombat(gameId, state);
            return { ...state, finished: true };
        } else {
            state.currentRound++;
            state.stage = 'RANGED'; // Loop back? Or stay in Melee? Usually Melee continues until done.
            // Specs don't specify multiple rounds details, but typically Board Games cycle.
            // Let's cycle back to Ranged (some games allow ranged every round) or just Melee.
            // Let's cycle to Ranged for full cycle.
        }
    }

    // Save State
    db.update(games)
      .set({ combat_state: JSON.stringify(state) })
      .where(eq(games.id, gameId))
      .run();

    return state;
}

function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}

function rollAttacks(unitIds: string[], type: 'RANGED' | 'MELEE'): number {
    const units = db.select().from(things).where(inArray(things.id, unitIds)).all();
    let hits = 0;
    for (const unit of units) {
        if (!unit.template_id) continue;
        const template = THING_TEMPLATES[unit.template_id];
        if (!template) continue;

        // Check if unit can attack in this phase
        const isRanged = template.abilities.includes('R');
        if (type === 'RANGED' && !isRanged) continue;
        // Melee units attack in melee. Ranged units ALSO attack in melee? Usually yes, but at penalty?
        // Specs: "Attacker Melee". Assume all units participate in Melee.

        const roll = rollD6();
        // Basic Hit logic: "Hits on 5 or 6" is for Magic. 
        // Standard combat: "Combat Value: Number of dice rolled".
        // Ah, Combat Value is NOT "Hit on X", it's "Number of Dice".
        // Wait, specs: "Combat Value: Number of dice rolled."
        // Then what determines a hit?
        // Usually in Tom Wham games (like Kings & Things), it's 4, 5, 6? Or highest roll?
        // Specs don't explicitly say the "To Hit" number. 
        // Re-reading specs: "Magic: Hits on 5 or 6". 
        // This implies standard units might have different hit thresholds or standard is 5/6?
        // Let's assume standard hit is 5 or 6 for now (common in wargames).
        
        const diceCount = template.combat;
        for(let i=0; i<diceCount; i++) {
             const r = rollD6();
             if (r >= 5) hits++;
        }
    }
    return hits;
}

function applyAutoCasualties(state: CombatState, victimId: string, count: number) {
    if (count <= 0) return;
    const unitIds = victimId === state.attackerId ? state.attackerUnitIds : state.defenderUnitIds;
    
    // Simple logic: remove first N units
    // In real game, user selects.
    const deadUnits = unitIds.splice(0, count); // Removes from the array in state
    
    // Update DB to mark as eliminated (DISCARD)
    if (deadUnits.length > 0) {
        db.update(things)
          .set({ location: 'DISCARD', territory_id: null })
          .where(inArray(things.id, deadUnits))
          .run();
        
        state.logs.push(`${victimId} lost ${deadUnits.length} units.`);
    }
}

function checkCombatEnd(state: CombatState): boolean {
    if (state.attackerUnitIds.length === 0) return true; // Attacker wiped out
    if (state.defenderUnitIds.length === 0) return true; // Defender wiped out
    return false;
}

function endCombat(gameId: string, state: CombatState) {
    // If defender wiped out, attacker takes territory
    if (state.defenderUnitIds.length === 0) {
        db.update(territories)
          .set({ owner_id: state.attackerId })
          .where(eq(territories.id, state.territoryId))
          .run();
        
        // Move attacker units into territory
        db.update(things)
          .set({ territory_id: state.territoryId, location: 'BOARD' })
          .where(inArray(things.id, state.attackerUnitIds))
          .run();
          
        state.logs.push(`Attacker ${state.attackerId} conquered the territory!`);
    } else {
        state.logs.push(`Defender held the territory.`);
    }

    // Clear combat state
    db.update(games)
      .set({ combat_state: null }) // Or keep last logs?
      .where(eq(games.id, gameId))
      .run();
}
