import { getPlayersInGame, createGame, addPlayer } from "../src/db/queries";
import { initDB } from "../src/db/index";

initDB();

const gameId = createGame();
const playerId = crypto.randomUUID();
addPlayer(gameId, playerId, "Tester", "Red");

function detectCycle(
  obj: any,
  path: string[] = [],
  seen = new WeakSet()
): boolean {
  if (obj && typeof obj === "object") {
    if (seen.has(obj)) {
      console.log("Cycle detected at path:", path.join("."));
      return true;
    }
    seen.add(obj);
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (detectCycle(obj[key], [...path, key], seen)) return true;
      }
    }
  }
  return false;
}

const players = getPlayersInGame(gameId);
console.log("Got players. checking for cycle...");
if (!detectCycle(players)) {
  console.log(
    "No cycle found in recursion check?! Maybe JSON.stringify sees something else."
  );
  try {
    JSON.stringify(players);
    console.log("Stringify succeeded.");
  } catch (e) {
    console.error("Stringify failed:", e);
  }
}
