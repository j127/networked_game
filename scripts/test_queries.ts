import { initDB } from "../src/db/index";
import { createGame, addPlayer, getPlayersInGame } from "../src/db/queries";

try {
  initDB();
  console.log("DB Init done");

  const gameId = createGame();
  console.log("Game created:", gameId);

  addPlayer(gameId, crypto.randomUUID(), "Tester", "red");
  console.log("Player added");

  const players = await getPlayersInGame(gameId);
  console.log("Players retrieved:", JSON.stringify(players, null, 2));
} catch (e) {
  console.error("Test failed:", e);
}
