# Trumps Next Session Handoff

## Run

```powershell
cd C:\projects\trumps
npm install
npm start
```

Open `http://localhost:8001/trumps_table.html`.

Other devices on the same LAN can use `http://<host-ip>:8001/trumps_table.html`.

The frontend loads React and Babel from CDNs, so internet access is required unless those assets are already cached. After changing a browser-loaded script or stylesheet, bump its `?v=` query in `trumps_table.html`.

## File Map

- `trumps_table.html`: static entry point and browser script loading order.
- `app.jsx`: top-level screen routing and visual tweak integration.
- `game_state.jsx`: React orchestration for local play and online state hydration.
- `shared/game_engine.js`: server-authoritative multiplayer engine, validation, bots, timers, scoring, and private state projections.
- `game.jsx`: local-play card rules and bot helpers.
- `seat_helpers.js`: seat topology, names, teams, and viewer perspective.
- `lobby.jsx`: start screen and multiplayer lobby.
- `table.jsx`: game table and card-hand UI.
- `panels.jsx`: bidding, trump, kitty, score, and action panels.
- `card.jsx`: card rendering.
- `styles.css`: application styling and animations.
- `multiplayer_protocol.js`: protocol version, event names, seats, and room-code helpers.
- `multiplayer_client.js`: browser WebSocket hook and explicit game commands.
- `server.js`: static server, rooms, reconnect tokens, authoritative matches, revisions, and scheduling.
- `tests/game_engine_test.js`: engine, validation, privacy, and bot-match tests.
- `tests/browser_smoke_test.js`: WebSocket and real browser integration test.

## User Flow

- Landing screen supports Play Local, Host Game, and Join by room code.
- Host Game creates a lobby. The host and guests choose seats before the match starts.
- The host cannot start until the host has a seat and no players remain unseated.
- Empty seats become server-controlled bots.
- Local play starts immediately with local bots.
- Online play is server-authoritative for every participant, including the room host.

## Multiplayer Architecture

The Node server owns the canonical online match.

- `server.js` owns rooms, seats, host identity, game revisions, accepted action IDs, and scheduled transitions.
- `shared/game_engine.js` owns shuffle/deal, bidding, trump, kitty exchange, legal plays, trick resolution, scoring, dealer rotation, bots, and match progression.
- Browsers send intent-only commands: `start_match`, `submit_bid`, `choose_trump`, `discard_kitty`, and `play_card`.
- The server derives the acting seat from the connected player token and validates every command.
- Commands include an `actionId` and `expectedRevision`. Stale actions are rejected and duplicate action IDs are ignored.
- Each player receives a seat-specific `game_state` projection. A player sees their own cards, public game data, opponent card counts, and kitty contents only when entitled to view them.
- Opponent hands are represented by hidden placeholder cards; complete hands are never broadcast to every client.
- Bots and phase timers run on the server.
- Match progression continues if the original host disconnects.
- A reconnecting seated player can reclaim the seat with the token stored in browser `localStorage`.

The host role is now limited to lobby ownership and starting a match. It does not grant authority over gameplay.

## Game Flow

```text
dealing -> bidding -> chooseTrump -> reveal -> kitty -> play -> roundEnd/matchEnd
```

Key rules:

- Bidding is one round.
- Bids contain a level and High/Low mode. Trump is chosen after the auction.
- Same-level Low beats High.
- The contract target is `level + 5` tricks.
- Trump beats non-trump in both High and Low contracts.
- The first dealer is selected by high-card draw.
- After each hand, the dealer comes from the losing team and alternates within that team.
- If the first bidder wins the auction, that declarer previews the kitty before choosing trump.
- Bot first-bidder declarers evaluate trump using their hand plus the kitty.
- Match score is displayed from the viewer's perspective.

## Deal Animation

- Implemented by `DealingAnimation` in `table.jsx`.
- Cards originate from the dealer side and advance clockwise by visible table position.
- The dealer is included in the dealing cycle.
- Current local and server deal duration is 4300 ms.

Visual QA is still useful when changing animation timing or table perspective.

## Validation

Run:

```powershell
npm.cmd run check
npm.cmd test
git diff --check
```

`npm.cmd run check` performs syntax checks and engine tests.

`npm.cmd test` verifies:

- A complete 52-card deal with no duplicates.
- Private hand and kitty projections.
- Invalid turn and invalid bid rejection.
- A complete server-driven bot match.
- Room creation, joining, and seat selection.
- Server-created match state and per-seat privacy.
- Server progression after host disconnect.
- Real HTML/Babel/React rendering through host, seat selection, and match start.

The browser test requires access to the React and Babel CDNs used by `trumps_table.html`.

## Remaining Risks

- Rooms and matches are in memory and disappear when the server restarts.
- Reconnect tokens are prototype identifiers generated with `Math.random`, not secure authentication.
- The host token remains required to start another match; there is no host transfer workflow.
- Local play and online play use separate engines (`game.jsx`/`game_state.jsx` versus `shared/game_engine.js`), so rule changes must be kept aligned.
- Server bot strategy is intentionally simpler than the existing local bot strategy.
- There is no production persistence, account system, rate limiting, or deployment configuration.
- Automated tests cover architecture and smoke behavior, but not every scoring, kitty, and reconnect edge case.

## Next Priorities

1. Add focused engine tests for full bidding order, kitty entitlement, following suit, scoring, dealer rotation, duplicate actions, and stale revisions.
2. Consolidate local and online rules onto the shared engine to prevent behavior drift.
3. Add room cleanup, reconnect expiry, and host transfer or host-independent rematch controls.
4. Replace prototype reconnect tokens with cryptographically secure session identifiers before public deployment.
5. Add persistent room or match storage only if restart recovery is required.

## Git State

The checkout is based on:

```text
c8a8ded Merge pull request #1 from isaachyuen/codex-refactor-game-state-bots
```

The server-authoritative multiplayer implementation and this handoff update are currently local changes. Check `git status -sb` before publishing.
