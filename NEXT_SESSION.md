# Trumps v2 Next Session Notes

## How to Run

Open `Trumps Table.html` directly in a browser, or serve the folder:

```powershell
cd "C:\Users\isaac\trumps v2"
python -m http.server 8000
```

Then open `http://localhost:8000/Trumps%20Table.html`.

The HTML uses cache-busting query strings for local JSX/CSS. If you change `app.jsx`, `game.jsx`, `card.jsx`, or `styles.css`, bump the corresponding `?v=` value in `Trumps Table.html`.

## File Map

- `Trumps Table.html`: static entry point, loads React/Babel from CDN and local JSX files.
- `game.jsx`: pure game rules and bot helpers.
- `app.jsx`: React state machine, bidding/play flow, match/dealer logic, UI components.
- `card.jsx`: card face/back rendering and pip layouts.
- `styles.css`: layout, card styling, animations, panels.
- `tweaks-panel.jsx`: visual tweak UI.

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

## Cautions

- This is a static Babel-in-browser app. There is no build step or test suite.
- Browser CDN dependencies mean offline loading may fail unless cached.
- Several files contain suit symbols; PowerShell output may show mojibake, but the source bytes are UTF-8.
- Prefer small scoped edits and bump cache query strings after changes.
