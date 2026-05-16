// Game logic — pure functions, no React.
// 4 players: South/North are team A, West/East are team B.
// Turn order: clockwise -> S, W, N, E

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = { '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs' };
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i) => [r, i+2]));
const LOW_SORT_RANK_VALUE = { ...RANK_VALUE, A: 1 };

const SEATS = ['S', 'W', 'N', 'E'];
const NEXT = { S: 'W', W: 'N', N: 'E', E: 'S' };
const TEAM = { S: 'A', N: 'A', W: 'B', E: 'B' };
const SEAT_NAMES = { S: 'South', W: 'West', N: 'North', E: 'East' };

function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r, id: `${r}${s}` });
  return deck;
}

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand, low = false) {
  const order = ['♠','♥','♣','♦'];
  const rankValue = low ? LOW_SORT_RANK_VALUE : RANK_VALUE;
  return [...hand].sort((a,b) => {
    const so = order.indexOf(a.suit) - order.indexOf(b.suit);
    if (so !== 0) return so;
    return rankValue[a.rank] - rankValue[b.rank];
  });
}

function deal(firstSeat = 'S') {
  const deck = shuffle(buildDeck());
  const hands = { S: [], W: [], N: [], E: [] };
  const start = SEATS.indexOf(firstSeat);
  // 12 cards each + 4 to the kitty
  for (let i = 0; i < 48; i++) {
    hands[SEATS[(start + i) % 4]].push(deck[i]);
  }
  const kitty = deck.slice(48, 52);
  for (const s of SEATS) hands[s] = sortHand(hands[s]);
  return { hands, kitty };
}

function legalCards(hand, trick) {
  if (trick.length === 0) return hand.map(c => c.id);
  const lead = trick[0].card.suit;
  const followers = hand.filter(c => c.suit === lead);
  if (followers.length > 0) return followers.map(c => c.id);
  return hand.map(c => c.id);
}

function trickWinner(trick, trump, low = false) {
  const rankValue = low ? LOW_SORT_RANK_VALUE : RANK_VALUE;
  let best = trick[0];
  for (const play of trick) {
    const c = play.card;
    if (c.suit === trump && best.card.suit !== trump) { best = play; continue; }
    if (c.suit === best.card.suit && (low ? rankValue[c.rank] < rankValue[best.card.rank] : rankValue[c.rank] > rankValue[best.card.rank])) {
      best = play;
    }
  }
  return best.seat;
}

// --- Bot AI ---
function botPlay(seat, hand, trick, trump, low = false) {
  const rankValue = low ? LOW_SORT_RANK_VALUE : RANK_VALUE;
  const legal = legalCards(hand, trick).map(id => hand.find(c => c.id === id));
  const weakestFirst = (a, b) => low ? rankValue[b.rank] - rankValue[a.rank] : rankValue[a.rank] - rankValue[b.rank];
  const weakestCard = (cards, preferNonTrump = false) => {
    const nonTrump = preferNonTrump ? cards.filter(c => c.suit !== trump) : [];
    const pool = nonTrump.length > 0 ? nonTrump : cards;
    return [...pool].sort(weakestFirst)[0];
  };

  // No trick yet -> lead. Pick a mid-low non-trump if possible.
  if (trick.length === 0) {
    const nonTrump = legal.filter(c => c.suit !== trump);
    const pool = nonTrump.length > 0 ? nonTrump : legal;
    pool.sort((a,b) => rankValue[a.rank] - rankValue[b.rank]);
    // lead a middling card
    return pool[Math.floor(pool.length / 2)] || pool[0];
  }

  const lead = trick[0].card.suit;
  const currentBest = trick.reduce((best, p) => {
    if (!best) return p;
    if (p.card.suit === trump && best.card.suit !== trump) return p;
    if (p.card.suit === best.card.suit && (low ? rankValue[p.card.rank] < rankValue[best.card.rank] : rankValue[p.card.rank] > rankValue[best.card.rank])) return p;
    return best;
  }, null);

  // Partner currently winning?
  if (currentBest && TEAM[currentBest.seat] === TEAM[seat]) {
    return weakestCard(legal, true);
  }

  // Try to win cheaply if following suit
  const sameSuit = legal.filter(c => c.suit === lead);
  if (sameSuit.length > 0) {
    const winners = sameSuit.filter(c => low ? rankValue[c.rank] < rankValue[currentBest.card.rank] : rankValue[c.rank] > rankValue[currentBest.card.rank]);
    if (winners.length > 0) {
      winners.sort((a,b) => rankValue[a.rank] - rankValue[b.rank]);
      return low ? winners[winners.length - 1] : winners[0]; // cheapest winner
    }
    return weakestCard(sameSuit);
  }

  // Can't follow suit. Try a low trump if not already trumped by opponent higher
  const trumps = legal.filter(c => c.suit === trump);
  if (trumps.length > 0) {
    if (currentBest.card.suit === trump) {
      const overTrumps = trumps.filter(c => low ? rankValue[c.rank] < rankValue[currentBest.card.rank] : rankValue[c.rank] > rankValue[currentBest.card.rank]);
      if (overTrumps.length > 0) {
        overTrumps.sort((a,b) => rankValue[a.rank] - rankValue[b.rank]);
        return low ? overTrumps[overTrumps.length - 1] : overTrumps[0];
      }
      return weakestCard(legal, true);
    } else {
      // safe trump
      const sorted = [...trumps].sort((a,b) => rankValue[a.rank] - rankValue[b.rank]);
      return sorted[0];
    }
  }

  // Discard lowest non-trump
  const nonTrump = legal.filter(c => c.suit !== trump);
  const pool = nonTrump.length > 0 ? nonTrump : legal;
  pool.sort((a,b) => rankValue[a.rank] - rankValue[b.rank]);
  return pool[0];
}

// --- Bidding ---
// A bid is { level: 1..7, mode: 'high'|'low', seat } or { pass: true, seat }
// Tricks needed = level + 5. Suits do not break ties; low beats high at the same level.
const ALL_BID_SUITS = ['♣','♦','♥','♠'];

function bidGreaterThan(a, b) {
  if (!b) return true;
  if (a.level !== b.level) return a.level > b.level;
  return a.mode === 'low' && (b.mode || 'high') === 'high';
}

function bidLabel(b) {
  if (!b) return '';
  if (b.pass) return 'Pass';
  return `${b.level}${b.mode === 'low' ? ' Low' : ' High'}`;
}

// estimate hand strength for AI bidding
function evaluateHand(hand, suit) {
  // High-card points
  let hcp = 0;
  for (const c of hand) {
    if (c.rank === 'A') hcp += 4;
    else if (c.rank === 'K') hcp += 3;
    else if (c.rank === 'Q') hcp += 2;
    else if (c.rank === 'J') hcp += 1;
  }
  // Length points for proposed trump suit
  let lengthPts = 0;
  const len = hand.filter(c => c.suit === suit).length;
  if (len >= 5) lengthPts += (len - 4) * 1.5;
  // void / singleton in non-trump
  for (const s of ['♠','♥','♦','♣']) {
    if (s === suit) continue;
    const l = hand.filter(c => c.suit === s).length;
    if (l === 0) lengthPts += 2;
    else if (l === 1) lengthPts += 1;
  }
  return hcp + lengthPts;
}

// Choose a bot bid given hand, current high bid, and seat partnership awareness
function botBid(hand, currentBid, partnerBid) {
  const bestScore = Math.max(...ALL_BID_SUITS.map(suit => evaluateHand(hand, suit)));

  // estimate tricks the team can take. ~ score / 4 tricks above baseline.
  // partner support adds rough +2 score
  const partnerBonus = partnerBid && !partnerBid.pass ? 3 : 0;
  const teamScore = bestScore + partnerBonus;
  // tricks beyond 5 we'd commit to: at score 13 ~ bid 1, score 17 ~ 2, etc.
  let level = Math.max(1, Math.min(7, Math.floor((teamScore - 9) / 3)));
  if (teamScore < 11) return { pass: true };

  let candidate = { level, mode: 'high' };
  if (currentBid && !bidGreaterThan(candidate, currentBid)) {
    // Try to bump up by one level on same/better suit if score warrants
    if (teamScore >= 15) {
      candidate = {
        level: Math.min(7, currentBid.level + 1),
        mode: 'high',
      };
      if (!bidGreaterThan(candidate, currentBid)) return { pass: true };
    } else {
      return { pass: true };
    }
  }
  return candidate;
}

// Resolve auction → contract
function resolveAuction(bids) {
  // Last non-pass bid wins
  const calls = bids.filter(b => !b.pass);
  if (calls.length === 0) return null;
  return calls[calls.length - 1]; // {level, mode, seat}
}

Object.assign(window, {
  SUITS, SUIT_NAMES, RANKS, RANK_VALUE, SEATS, NEXT, TEAM, SEAT_NAMES,
  buildDeck, shuffle, sortHand, deal, legalCards, trickWinner, botPlay,
  ALL_BID_SUITS, bidGreaterThan, bidLabel, evaluateHand, botBid, resolveAuction,
});
