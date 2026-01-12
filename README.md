# networked_game

```bash
bun install
bun run dev
bun run frontend
```

---

Please see the [specs](./specs/) directory for the technical specifications.

## Project Status Report (2026-01-12)

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

- **Game Loop:** Phase transitions (Setup -> Income -> Events -> Acquire -> War) are functional.
- **Economy:** Gold + Prestige calculation matches the PDF (land + forts + settlements + mines + gold/10 + specials).
- **Land Acquisition:** Land Deck draw now honors instruction tiles (For Sale / Public Auction / Fight).
- **Tile Acquisition:** Purchase 1–4 tiles for 2/5/10/20 gold plus a free draw per turn.
- **Combat:** Ranged then melee with hit rules (6 to hit, magic 5/6, charge bonus, terrain bonus).
- **Seeding:** Playing Deck, Land Deck (with instructions), and Special Characters seeded from the PDF list.

### Known Issues

- **Cyclic References:** The database query for `getPlayersInGame` initially caused cyclic reference errors (Unit -> Owner -> Unit) when serializing to JSON for WebSocket broadcasts. This has been addressed with a manual data mapping fix in `src/db/queries.ts`, but needs robust testing.
- **Server Stability:** The development server (`bun run dev`) has shown instability (exit code 130) during rapid restart cycles or high-frequency requests in testing.
- **Frontend Connectivity:** Verification tests encountered `ERR_CONNECTION_REFUSED` on port 5173 during automated runs, suggesting the frontend dev server might not be starting reliably in the test environment.
- **Land Instruction "Fight":** The Fight instruction is not implemented yet.
- **Combat Loss Selection:** Casualty selection is still automatic instead of player-chosen.
- **Magic Items & Special Abilities:** Magic item effects and special-character abilities (Thief/Assassin, etc.) are not wired into gameplay.
- **Turn Structure:** The PDF requires all players to act each phase; current flow still advances per active player.

---

## Remaining Task List (To Be Completed)

### 1. Stabilization & Verification (Immediate Priority)

- [ ] **Verify Unit Placement Loop:** Manually confirm purchase/free draw and deploy work end-to-end without server crashes.
- [ ] **Fix Cyclic Data Issues:** Ensure the sanitized `getPlayersInGame` query is fully robust and covers all needed nested data (Traits, Abilities) without causing cycles.
- [x] **Unit Tests:** Added vitest coverage for income and tile purchase basics.
- [ ] **Integration Tests:** Create a stable script (e.g., `scripts/test_game_flow.ts`) that simulates a full turn (Join -> Draw Land -> Purchase -> Deploy) to catch regressions.

### 2. Combat Engine (Core Feature)

- [x] **Battle State Machine:** Implemented ranged + melee stages with hits and fort absorption.
- [x] **Combat Stats:** Deck data now matches the PDF list.
- [x] **Resolution Logic:** Dice rolling honors magic and charge rules.
- [ ] **Casualty Processing:** Allow defender/attacker to choose losses per hit.

### 3. Prestige & Victory Conditions

- [x] **Prestige Calculation:** Implemented per PDF (holdings + gold/10 + specials).
- [ ] **End Game Trigger:** Check for win conditions (e.g., Target Prestige reached, or last player standing) at the end of the Resolution phase.
- [ ] **Victory Screen:** Add a UI state to announce the winner.

### 4. User Interface Polish

- [ ] **Error Feedback:** Improve the "Action Feedback" area to be more prominent (e.g., Toast notifications).
- [ ] **Visual Assets:** Replace text placeholders with actual icons or distinct colors for different Unit/Terrain types.
- [ ] **Lobby UI:** Show a list of active games or players in the lobby before starting.
- [ ] **Reconnection:** Better handling of page reloads (re-authenticating via `localStorage` IDs automatically).
