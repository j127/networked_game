# networked_game

Please see the [specs](./specs/) directory for the technical specifications.

## Project Status Report (2026-01-11)

### Features Implemented

**Backend Infrastructure**

- **Server:** Set up using **Hono** running on **Bun**.
- **Database:** **SQLite** with **Drizzle ORM** for type-safe queries and schema management.
- **Real-time Communication:** WebSocket server implementation for broadcasting `GAME_STATE` updates to connected clients.
- **Game State Management:** Centralized logic for initializing games (`src/game/setup.ts`), managing phases (`src/game/logic.ts`), and handling player actions.

**Frontend Application**

- **Tech Stack:** **Vite** build tool with **Tailwind CSS** for styling.
- **Logic:** Vanilla TypeScript (`main.ts`) handling WebSocket connections, state rendering, and API interactions.
- **UI Components:**
  - Lobby/Join Modal.
  - Status Bar (Phase, Gold, Player Info).
  - Player Hand (Unit cards).
  - Kingdom Board (Territory cards with deployed units).

**Game Mechanics**

- **Game Loop:** Phase transitions (Setup -> Income -> Acquire -> Combat -> Resolution) are functional.
- **Economy:** Gold tracking and Income phase logic.
- **Land Acquisition:** "Draw Land" action (Cost 5g) draws a random territory from the deck and assigns it to the player.
- **Unit Acquisition:** "Draw Unit" action (Cost 5g) draws a random unit from the deck to the player's Hand.
- **Unit Deployment:** "Deploy Unit" action moves a unit from the Hand to a specific Territory owned by the player.

### Known Issues

- **Cyclic References:** The database query for `getPlayersInGame` initially caused cyclic reference errors (Unit -> Owner -> Unit) when serializing to JSON for WebSocket broadcasts. This has been addressed with a manual data mapping fix in `src/db/queries.ts`, but needs robust testing.
- **Server Stability:** The development server (`bun run dev`) has shown instability (exit code 130) during rapid restart cycles or high-frequency requests in testing.
- **Frontend Connectivity:** Verification tests encountered `ERR_CONNECTION_REFUSED` on port 5173 during automated runs, suggesting the frontend dev server might not be starting reliably in the test environment.

---

## Remaining Task List (To Be Completed)

### 1. Stabilization & Verification (Immediate Priority)

- [ ] **Verify Unit Placement Loop:** Manually confirm that "Draw Unit" and "Deploy Unit" work end-to-end without server crashes.
- [ ] **Fix Cyclic Data Issues:** Ensure the sanitized `getPlayersInGame` query is fully robust and covers all needed nested data (Traits, Abilities) without causing cycles.
- [ ] **Integration Tests:** Create a stable script (e.g., `scripts/test_game_flow.ts`) that simulates a full turn (Join -> Draw Land -> Draw Unit -> Deploy) to catch regressions.

### 2. Combat Engine (Core Feature)

- [ ] **Battle State Machine:** Implement the `COMBAT` phase logic.
- [ ] **Combat Stats:** Ensure Units and things have `combat` values correctly defined in data.
- [ ] **Resolution Logic:** Implement dice rolling (or deterministic combat math) and hit assignment.
- [ ] **Casualty Processing:** Handle unit destruction and removal from the database/board.

### 3. Prestige & Victory Conditions

- [ ] **Prestige Calculation:** Implement logic to calculate Prestige points based on Territories owned, Units deployed, and specific "Thing" bonuses.
- [ ] **End Game Trigger:** Check for win conditions (e.g., Target Prestige reached, or last player standing) at the end of the Resolution phase.
- [ ] **Victory Screen:** Add a UI state to announce the winner.

### 4. User Interface Polish

- [ ] **Error Feedback:** Improve the "Action Feedback" area to be more prominent (e.g., Toast notifications).
- [ ] **Visual Assets:** Replace text placeholders with actual icons or distinct colors for different Unit/Terrain types.
- [ ] **Lobby UI:** Show a list of active games or players in the lobby before starting.
- [ ] **Reconnection:** Better handling of page reloads (re-authenticating via `localStorage` IDs automatically).
