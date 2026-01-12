const BASE_URL = "http://localhost:3000";

async function testGameFlow() {
  console.log("Creating game...");
  const createRes = await fetch(`${BASE_URL}/api/games`, { method: "POST" });
  if (!createRes.ok) throw new Error("Failed to create game");
  const { gameId } = (await createRes.json()) as any;
  console.log(`Game created: ${gameId}`);

  console.log("Joining game...");
  const playerId = "player-" + Math.random().toString(36).substring(7);
  const joinRes = await fetch(`${BASE_URL}/api/games/${gameId}/join`, {
    method: "POST",
    body: JSON.stringify({
      playerId,
      name: "Test Player",
      color: "red",
    }),
    headers: { "Content-Type": "application/json" },
  });

  if (!joinRes.ok) {
    const err = await joinRes.text();
    throw new Error(`Failed to join game: ${err}`);
  }
  console.log("Joined game successfully");

  // Start Game
  console.log("Starting game...");
  const startRes = await fetch(`${BASE_URL}/api/games/${gameId}/start`, {
    method: "POST",
  });
  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error("Failed to start game: " + text);
  }
  const startData = await startRes.json();
  console.log("Game started:", startData);

  // Advance to EVENTS
  console.log("Advancing phase to EVENTS...");
  const phaseRes = await fetch(`${BASE_URL}/api/games/${gameId}/next-phase`, {
    method: "POST",
  });
  if (!phaseRes.ok) throw new Error("Failed to advance phase");
  const phaseData = await phaseRes.json();
  console.log("Phase advanced:", phaseData);

  // Advance to ACQUIRE
  console.log("Advancing phase to ACQUIRE...");
  const phaseRes2 = await fetch(`${BASE_URL}/api/games/${gameId}/next-phase`, {
    method: "POST",
  });
  if (!phaseRes2.ok) throw new Error("Failed to advance phase to ACQUIRE");
  console.log("Phase advanced:", await phaseRes2.json());

  // Draw Land
  console.log("Drawing Land...");
  const drawRes = await fetch(`${BASE_URL}/api/games/${gameId}/draw-land`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
    headers: { "Content-Type": "application/json" },
  });
  if (!drawRes.ok) {
    const err = await drawRes.text();
    throw new Error("Failed to draw land: " + err);
  }
  const drawData = await drawRes.json();
  console.log("Land drawn:", drawData);

  // Connect WS
  // Bun's WebSocket client
  const ws = new WebSocket(
    `ws://localhost:3000/ws/${gameId}?playerId=${playerId}`
  );

  ws.onopen = () => {
    console.log("WS Connected");
    ws.send("Hello Server");
  };

  ws.onmessage = (event) => {
    console.log("WS Message:", event.data);
    ws.close();
  };
}

testGameFlow().catch(console.error);
