// Game logic — pure functions, no React.
// 4 players: South/North are team A, West/East are team B.
// Turn order: clockwise -> S, W, N, E

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = { '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs' };
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i) => [r, i+2]));
const LOW_SORT_RANK_VALUE = { ...RANK_VALUE, A: 1 };

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
function cardValue(card, low = false) {
  return (low ? LOW_SORT_RANK_VALUE : RANK_VALUE)[card.rank];
}

function compareCardsForMode(a, b, low = false) {
  return low ? cardValue(a, low) - cardValue(b, low) : cardValue(b, low) - cardValue(a, low);
}

function sortWeakestFirst(cards, low = false) {
  return [...cards].sort((a, b) => low ? cardValue(b, low) - cardValue(a, low) : cardValue(a, low) - cardValue(b, low));
}

function sortStrongestFirst(cards, low = false) {
  return [...cards].sort((a, b) => low ? cardValue(a, low) - cardValue(b, low) : cardValue(b, low) - cardValue(a, low));
}

function cardBeats(a, b, leadSuit, trump, low = false) {
  if (!b) return true;
  if (a.suit === trump && b.suit !== trump) return true;
  if (a.suit !== trump && b.suit === trump) return false;
  if (a.suit !== b.suit) return a.suit === leadSuit && b.suit !== leadSuit;
  return low ? cardValue(a, true) < cardValue(b, true) : cardValue(a) > cardValue(b);
}

function winningPlay(trick, trump, low = false) {
  if (trick.length === 0) return null;
  const leadSuit = trick[0].card.suit;
  return trick.reduce((best, play) => cardBeats(play.card, best.card, leadSuit, trump, low) ? play : best, trick[0]);
}

function remainingCardsBySuit(hand, trick, playedCards = []) {
  const known = new Set([...hand, ...trick.map(play => play.card), ...playedCards].map(card => card.id));
  const remaining = Object.fromEntries(SUITS.map(suit => [suit, []]));
  for (const card of buildDeck()) {
    if (!known.has(card.id)) remaining[card.suit].push(card);
  }
  return remaining;
}

function isLikelyBoss(card, remainingBySuit, low = false) {
  return !remainingBySuit[card.suit].some(other => low ? cardValue(other, true) < cardValue(card, true) : cardValue(other) > cardValue(card));
}

function chooseCheapest(cards, low = false) {
  return sortWeakestFirst(cards, low)[0];
}

function chooseCheapestWinner(cards, currentBest, leadSuit, trump, low = false) {
  return sortWeakestFirst(cards.filter(card => cardBeats(card, currentBest.card, leadSuit, trump, low)), low)[0] || null;
}

function shouldPullTrumpOnLead(hand, trump, remainingBySuit) {
  if (!trump) return false;
  const trumpCount = hand.filter(card => card.suit === trump).length;
  if (trumpCount < 2) return false;

  const unseenTrumpCount = remainingBySuit[trump]?.length || 0;
  if (unseenTrumpCount === 0) return false;

  const expectedTrumpPerOtherSeat = unseenTrumpCount / 3;
  return trumpCount > expectedTrumpPerOtherSeat;
}

function botPlay(seat, hand, trick, trump, low = false, context = {}) {
  const legal = legalCards(hand, trick).map(id => hand.find(c => c.id === id)).filter(Boolean);
  if (legal.length === 0) return null;

  const playedCards = context.playedCards || [];
  const remainingBySuit = remainingCardsBySuit(hand, trick, playedCards);
  const contract = context.contract || null;
  const declarerTeam = contract?.team || null;
  const botTeam = TEAM[seat];
  const isDeclarerSide = declarerTeam === botTeam;
  const nonTrump = legal.filter(card => card.suit !== trump);
  const weakestLegal = chooseCheapest(nonTrump.length ? nonTrump : legal, low);

  if (trick.length === 0) {
    const trumpCards = legal.filter(card => card.suit === trump);
    if (isDeclarerSide && trumpCards.length > 0 && shouldPullTrumpOnLead(hand, trump, remainingBySuit)) {
      return sortStrongestFirst(trumpCards, low)[0];
    }

    const bossCards = legal.filter(card => card.suit !== trump && isLikelyBoss(card, remainingBySuit, low));
    if (bossCards.length > 0) return sortStrongestFirst(bossCards, low)[0];

    const suitGroups = SUITS.map(suit => {
      const cards = legal.filter(card => card.suit === suit);
      const handSuitLength = hand.filter(card => card.suit === suit).length;
      const strongest = sortStrongestFirst(cards, low)[0];
      const bossCount = cards.filter(card => isLikelyBoss(card, remainingBySuit, low)).length;
      const trumpPenalty = suit === trump ? 2.5 : 0;
      const shortSuitBonus = !isDeclarerSide && suit !== trump && handSuitLength <= 2 ? 1.2 : 0;
      const score = cards.length + bossCount * 2 + shortSuitBonus - trumpPenalty + (strongest ? cardValue(strongest, low) / 20 : 0);
      return { suit, cards, score };
    }).filter(group => group.cards.length > 0).sort((a, b) => b.score - a.score);

    const leadGroup = suitGroups[0];
    if (!leadGroup) return weakestLegal;
    const boss = leadGroup.cards.filter(card => isLikelyBoss(card, remainingBySuit, low));
    if (boss.length > 0) return sortStrongestFirst(boss, low)[0];
    return sortWeakestFirst(leadGroup.cards, low)[Math.min(1, leadGroup.cards.length - 1)];
  }

  const leadSuit = trick[0].card.suit;
  const currentBest = winningPlay(trick, trump, low);
  const partnerWinning = currentBest && TEAM[currentBest.seat] === botTeam;
  const lastToAct = trick.length === 3;
  const followsSuit = legal.some(card => card.suit === leadSuit);

  if (partnerWinning) {
    const safeDiscards = nonTrump.length ? nonTrump : legal;
    const bossDiscards = safeDiscards.filter(card => isLikelyBoss(card, remainingBySuit, low));
    if (!lastToAct && bossDiscards.length !== safeDiscards.length) {
      const expendable = safeDiscards.filter(card => !isLikelyBoss(card, remainingBySuit, low));
      if (expendable.length > 0) return chooseCheapest(expendable, low);
    }
    return chooseCheapest(safeDiscards, low);
  }

  if (followsSuit) {
    const sameSuit = legal.filter(card => card.suit === leadSuit);
    const winner = chooseCheapestWinner(sameSuit, currentBest, leadSuit, trump, low);
    if (winner) return winner;
    return chooseCheapest(sameSuit, low);
  }

  const trumpCards = legal.filter(card => card.suit === trump);
  if (trumpCards.length > 0) {
    const trumpWinner = chooseCheapestWinner(trumpCards, currentBest, leadSuit, trump, low);
    const needToFight = isDeclarerSide || lastToAct || trick.some(play => TEAM[play.seat] === botTeam);
    if (trumpWinner && needToFight) return trumpWinner;
  }

  const discardPool = nonTrump.length ? nonTrump : legal;
  const expendable = discardPool.filter(card => !isLikelyBoss(card, remainingBySuit, low));
  return chooseCheapest(expendable.length ? expendable : discardPool, low);
}

// --- Bidding ---
// A bid is { level: 1..7, mode: 'high'|'low', seat } or { pass: true, seat }
// Tricks needed = level + 5. Suits do not break ties; low beats high at the same level.
const ALL_BID_SUITS = ['♣','♦','♥','♠'];
const OPENING_BID_FLOOR = { level: 3, mode: 'high' };

function bidGreaterThan(a, b) {
  if (!b) return true;
  if (a.level !== b.level) return a.level > b.level;
  return a.mode === 'low' && (b.mode || 'high') === 'high';
}

function canOpenBid(bid) {
  return bidGreaterThan(bid, OPENING_BID_FLOOR);
}

function minimumOpeningBidForMode(mode) {
  return mode === 'low'
    ? { level: 3, mode: 'low' }
    : { level: 4, mode: 'high' };
}

function normalizeOpeningBid(bid) {
  if (canOpenBid(bid)) return bid;
  return { ...minimumOpeningBidForMode(bid.mode), score: bid.score };
}

function bidLabel(b) {
  if (!b) return '';
  if (b.pass) return 'Pass';
  return `${b.level}${b.mode === 'low' ? ' Low' : ' High'}`;
}

// estimate hand strength for AI bidding
function evaluateHand(hand, suit, mode = 'high') {
  const low = mode === 'low';
  let score = 0;
  const suitCards = hand.filter(card => card.suit === suit);
  const offSuitCards = hand.filter(card => card.suit !== suit);

  for (const card of hand) {
    if (!low) {
      if (card.rank === 'A') score += 4.2;
      else if (card.rank === 'K') score += 3.1;
      else if (card.rank === 'Q') score += 2;
      else if (card.rank === 'J') score += 1;
      else if (card.rank === '10') score += 0.5;
    } else {
      if (card.rank === 'A') score += 4.6;
      else if (card.rank === '2') score += 4.2;
      else if (card.rank === '3') score += 3.1;
      else if (card.rank === '4') score += 2;
      else if (card.rank === '5') score += 1;
      else if (card.rank === '6') score += 0.5;
    }
  }

  const trumpStrength = suitCards.reduce((sum, card) => {
    const value = low ? (15 - cardValue(card, true)) : cardValue(card);
    return sum + value / 5;
  }, 0);
  score += trumpStrength;
  if (suitCards.length >= 5) score += (suitCards.length - 4) * 2;
  if (suitCards.length >= 7) score += 1.5;

  for (const nextSuit of SUITS) {
    if (nextSuit === suit) continue;
    const length = hand.filter(card => card.suit === nextSuit).length;
    if (length === 0) score += 2.4;
    else if (length === 1) score += 1.3;
    else if (length >= 5 && low) score += 0.7;
  }

  const sureSideWinners = offSuitCards.filter(card => !low ? ['A', 'K'].includes(card.rank) : ['2', '3'].includes(card.rank)).length;
  score += sureSideWinners * 0.8;
  return score;
}

function bidLevelFromScore(score) {
  if (score < 21) return 0;
  if (score < 24) return 1;
  if (score < 27) return 2;
  if (score < 30.5) return 3;
  if (score < 34.5) return 4;
  if (score < 39.5) return 5;
  if (score < 46) return 6;
  return 7;
}

// Choose a bot bid given hand, current high bid, and seat partnership awareness.
function botBid(hand, currentBid, partnerBid) {
  const partnerBonus = partnerBid && !partnerBid.pass ? 1.2 + partnerBid.level * 0.2 : 0;
  const candidates = [];

  for (const suit of ALL_BID_SUITS) {
    for (const mode of ['high', 'low']) {
      const score = evaluateHand(hand, suit, mode) + partnerBonus;
      const level = bidLevelFromScore(score);
      candidates.push({ level, mode, score });
    }
  }

  candidates.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    if (b.score !== a.score) return b.score - a.score;
    return a.mode === 'low' ? -1 : 1;
  });

  let choice = candidates.find(candidate => currentBid ? bidGreaterThan(candidate, currentBid) : canOpenBid(candidate));
  if (!choice && !currentBid && candidates.length) {
    choice = normalizeOpeningBid(candidates[0]);
  }
  if (!choice && currentBid) {
    const best = candidates[0];
    if (best && best.score >= 32 && currentBid.level < 5) {
      choice = { level: currentBid.level + 1, mode: best.mode, score: best.score - 2 };
      if (!bidGreaterThan(choice, currentBid)) choice = null;
    }
  }

  if (!choice) return { pass: true };
  return { level: choice.level, mode: choice.mode };
}

// Resolve auction → contract
function resolveAuction(bids) {
  // Last non-pass bid wins
  const calls = bids.filter(b => !b.pass);
  if (calls.length === 0) return null;
  return calls[calls.length - 1]; // {level, mode, seat}
}

Object.assign(window, {
  SUITS, SUIT_NAMES, RANKS, RANK_VALUE,
  buildDeck, shuffle, sortHand, deal, legalCards, trickWinner, botPlay,
  ALL_BID_SUITS, OPENING_BID_FLOOR, bidGreaterThan, canOpenBid, bidLabel, evaluateHand, botBid, resolveAuction,
});
