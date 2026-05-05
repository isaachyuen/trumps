# Trumps v2 Next Session Notes

## How to Run

Open `trumps_table.html` directly in a browser, or serve the folder:

```powershell
cd "C:\Users\isaac\trumps_v2"
python -m http.server 8000
```

Then open `http://localhost:8000/trumps_table.html`.

For the multiplayer server scaffold, install dependencies once and run the Node server:

```powershell
cd "C:\Users\isaac\trumps_v2"
npm install
npm start
```

The multiplayer server defaults to port `8001`, so open `http://localhost:8001/trumps_table.html` when running `npm start`. Other devices on the same Wi-Fi can use `http://<your-laptop-ip>:8001/trumps_table.html`.

The HTML uses cache-busting query strings for local JSX/CSS. If you change `app.jsx`, `game.jsx`, `card.jsx`, or `styles.css`, bump the corresponding `?v=` value in `trumps_table.html`.

## File Map

- `trumps_table.html`: static entry point, loads React/Babel from CDN and local JSX files.
- `game.jsx`: pure game rules and bot helpers.
- `app.jsx`: React state machine, bidding/play flow, match/dealer logic, UI components.
- `card.jsx`: card face/back rendering and pip layouts.
- `styles.css`: layout, card styling, animations, panels.
- `tweaks_panel.jsx`: visual tweak UI.
- `multiplayer_protocol.js`: shared client/server event names and room-code helpers.
- `multiplayer_client.js`: browser WebSocket adapter and room lobby hook.
- `server.js`: Node static file server plus WebSocket room scaffold.

## Current Game Flow

Main phases in `app.jsx`:

```text
dealing -> bidding -> chooseTrump -> reveal -> kitty -> play -> roundEnd/matchEnd
```

Important phase notes:

- `dealing`: animated deal before each hand. Real hands are hidden until bidding.
- `bidding`: exactly one round; each player gets one call.
- `chooseTrump`: only appears if South wins the bid. Bot winners auto-pick suit with `chooseTrumpSuit`.
- `reveal`: shows final contract.
- `kitty`: winning bidder takes kitty and discards 4.
- `play`: trick play.

## Bidding Rules

- Bids are number plus direction only: `1H`, `1L`, etc. Here `H/L` means High/Low, not suit.
- Suits are not part of bidding.
- Same-number Low beats High.
- Same-number High does not beat Low.
- Higher number beats lower number.
- After winning the bid, the bidder chooses trump suit.
- Opponent bid history intentionally does not show suit.

Core functions:

- `bidGreaterThan` in `game.jsx`
- `botBid` in `game.jsx`
- `BiddingPanel` in `app.jsx`
- `TrumpPicker` in `app.jsx`

## Trick Rules

- `trickWinner(trick, trump, low)` in `game.jsx`
- High contracts: higher rank wins within suit/trump.
- Low contracts: lower rank wins within suit/trump.
- Trump still outranks non-trump in both High and Low contracts.
- Bot play receives `contract?.mode === 'low'`.

## Dealer Rules

- First dealer is chosen by high-card draw in `drawFirstDealer` in `app.jsx`.
- Tied high-card draws redraw internally.
- Actual deal starts with player left of dealer and proceeds clockwise.
- `deal(firstSeat)` in `game.jsx` supports this.
- After each hand, the next dealer comes from the losing team.
- Losing team alternates between its two players.

Key helpers in `app.jsx`:

- `drawFirstDealer`
- `nextLosingTeamDealer`
- `TEAM_PARTNERS`
- `TEAM_FIRST_DEALER`

## Match Rules

- Player can choose best of 3, 5, or 7 hands in `ScoreCard`.
- Hand wins are tracked separately from point score.
- First to `ceil(bestOf / 2)` wins the match.
- `New match` appears at match end.

## Card UI Notes

- Number card center pips are rendered by `PipGrid` in `card.jsx`.
- Ace center suit uses `.center-suit`.
- Face card center letter uses `.face-letter`.
- Corner rank/suit sizing is in `styles.css` under `.card-face .rank` and `.card-face .corner-suit`.
- Center pips are intentionally smaller than corner indices.
- Clubs and spades remain black but have different glyph treatments for distinguishability.

## Animations And Layout

- Dealing animation: `DealingAnimation` in `app.jsx`, styles at `.dealing-animation` / `.deal-card`.
- Trick collection animation: `.trick-card.collecting.to-*` in `styles.css`.
- Trick collection should animate toward the trick winner.
- Status/action bar is positioned bottom-left to avoid blocking table cards.

## Recent UX Decisions

- Bidding panel has High and Low columns, not a High/Low toggle.
- Choose trump suit order matches hand sort order: `♠ ♥ ♣ ♦`.
- Contract/HUD red suits should render red.
- Toast from high-card draw clears when dealing finishes so it does not block bidding.

## Online Multiplayer Plan

Use a small authoritative server for online multiplayer. Clients should render state and request actions, but the server should own deck shuffle, deal, bidding turn, valid bid checks, trump selection, kitty exchange, legal card checks, trick resolution, scoring, and round/match progression.

Recommended stack:

- Frontend: current static React/Babel app initially; consider moving to Vite later.
- Backend: Node.js WebSocket server.
- Transport: `socket.io` or native WebSocket.
- Hosting: Render, Fly.io, or Railway for the server; GitHub Pages, Netlify, or Vercel for the frontend.
- State: in-memory rooms first; database later for accounts, match history, or persistence.

Implementation sequence:

1. Extract core game state and rules from React state into shared game-engine functions.
2. Create modules such as `game_state.js`, `game_rules.js`, `game_actions.js`, and `bot_players.js`.
3. Define WebSocket events: `create_room`, `join_room`, `start_match`, `submit_bid`, `choose_trump`, `discard_kitty`, `play_card`, and `leave_room`.
4. Add server responses: `room_state`, `player_joined`, `game_state`, `private_hand`, `invalid_action`, and `toast` or `event_log`.
5. Build a room system with 4 seats: South, West, North, East. Seats can be human or bot.
6. Support 1 human plus 3 bots, 2 humans plus bots, and eventually 4 humans.
7. Replace direct local UI calls like `playCard`, `submitBid`, and `startMatch` with an online `sendAction(...)` adapter.
8. Keep an offline/local mode so the current game still works without a server.
9. Add reconnect support with `roomId`, `seat`, and `playerToken` stored in `localStorage`.
10. Run bots server-side with small delays when it is a bot's turn.
11. Deploy the backend and configure the frontend with a server URL.

Hidden information rules:

- Public state can include phase, dealer, bids, contract, trump, trick plays, scores, seat occupancy, and opponent card counts.
- Private state should include only the player's hand, kitty contents when allowed, and optionally server-computed legal cards.
- Never send all hands to every client.

Testing priorities:

- Rule tests for legal cards, trick winner, and scoring.
- Action reducer tests for invalid bids and invalid plays.
- Room tests for join, leave, and reconnect.
- Hidden-information tests proving players cannot see other hands.
- Simulated 4-player full match test.

Biggest engineering step: separate game rules from `app.jsx`. Once rules are server-runnable, online multiplayer is mostly room management plus WebSocket syncing.

## Multiplayer Scaffold Completed

Completed in the first multiplayer pass:

- Added `package.json` and `package-lock.json`.
- Installed the `ws` WebSocket dependency.
- Added `.gitignore` for `node_modules/`, npm debug logs, and local server logs.
- Added `server.js`, which serves the static app and exposes WebSocket endpoint `/ws`.
- Added `multiplayer_protocol.js` for shared event names, seat constants, room-code normalization, and room-code generation.
- Added `multiplayer_client.js` with `useMultiplayerSession`, local reconnect token storage, and Host/Join helpers.
- Loaded multiplayer scripts from `trumps_table.html` and bumped `app.jsx` cache version to `v=44`.
- Added compact Host/Join room controls to `TopBar` in `app.jsx`.
- Added `.online-room` top-bar styling in `styles.css`.
- Set the multiplayer server default port to `8001` so it can coexist with any existing Python static server on `8000`.

Verified:

- `npm run check` passes.
- `node --check server.js` passes.
- `node --check multiplayer_protocol.js` passes.
- `node --check multiplayer_client.js` passes.
- `http://localhost:8001/trumps_table.html` returns HTTP 200 when the server is running.
- WebSocket smoke test against `ws://localhost:8001/ws` can create a room and receive `room_state`.

Current limitation:

- Multiplayer is not wired into gameplay yet. The scaffold supports hosting/joining rooms and socket messages, but the card game still runs locally in `app.jsx`.

Next implementation step:

- Extract authoritative match/round/game action state from `app.jsx` into server-runnable modules, then have the client send bid/play/trump/discard actions over WebSocket instead of mutating local game state directly.

## Cautions

- This is a static Babel-in-browser app. There is no build step or test suite.
- Browser CDN dependencies mean offline loading may fail unless cached.
- Several files contain suit symbols; PowerShell output may show mojibake, but the source bytes are UTF-8.
- Prefer small scoped edits and bump cache query strings after changes.
