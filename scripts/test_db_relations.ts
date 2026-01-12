import { getPlayersInGame, createGame, addPlayer } from "../src/db/queries";
import { initDB } from "../src/db/index";

initDB();

const gameId = createGame();
const playerId = crypto.randomUUID();
addPlayer(gameId, playerId, "Tester", "Red");

try {
  const players = getPlayersInGame(gameId);
  console.log("Players fetched:", JSON.stringify(players, null, 2));
  if (!players[0].territories) {
    console.error("Territories relation missing!");
    process.exit(1);
  }
  console.log("Relations working.");
} catch (e) {
  console.error("Query failed:", e);
  process.exit(1);
}
