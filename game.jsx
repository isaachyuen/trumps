// Browser compatibility facade for the shared game engine.
const {
  SUITS,
  RANKS,
  RANK_VALUE,
  BID_SUITS: ALL_BID_SUITS,
  buildDeck,
  shuffle,
  sortHand,
  deal,
  legalCards,
  trickWinner,
  botPlay,
  bidGreaterThan,
  canOpenBid,
  evaluateHand,
  botBid,
} = window.TrumpsGameEngine;

const SUIT_NAMES = {
  '\u2660': 'Spades',
  '\u2665': 'Hearts',
  '\u2666': 'Diamonds',
  '\u2663': 'Clubs',
};
const OPENING_BID_FLOOR = { level: 3, mode: 'high' };

function bidLabel(bid) {
  if (!bid) return '';
  if (bid.pass) return 'Pass';
  return `${bid.level}${bid.mode === 'low' ? ' Low' : ' High'}`;
}

function resolveAuction(bids) {
  return bids.filter(bid => !bid.pass).slice(-1)[0] || null;
}

Object.assign(window, {
  SUITS,
  SUIT_NAMES,
  RANKS,
  RANK_VALUE,
  buildDeck,
  shuffle,
  sortHand,
  deal,
  legalCards,
  trickWinner,
  botPlay,
  ALL_BID_SUITS,
  OPENING_BID_FLOOR,
  bidGreaterThan,
  canOpenBid,
  bidLabel,
  evaluateHand,
  botBid,
  resolveAuction,
});
