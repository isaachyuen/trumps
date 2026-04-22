const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['C', 'D', 'H', 'S']
const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))

function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit)
    }
  }
  return deck
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// 12 cards each + 4-card kitty
function deal() {
  const deck = shuffle(createDeck())
  return {
    N: deck.slice(0, 12),
    E: deck.slice(12, 24),
    S: deck.slice(24, 36),
    W: deck.slice(36, 48),
    kitty: deck.slice(48, 52)
  }
}

function cardRank(card) {
  return RANK_VALUES[card[0]]
}

function cardSuit(card) {
  return card[1]
}

const SUIT_RANK = { C: 0, D: 1, H: 2, S: 3 }

function cardValue(card) {
  return cardRank(card) * 4 + SUIT_RANK[cardSuit(card)]
}

// Draw one card per seat; highest card (rank then suit) wins
function drawHighCard() {
  const deck = shuffle(createDeck())
  const seats = ['N', 'E', 'S', 'W']
  const draws = {}
  seats.forEach((seat, i) => { draws[seat] = deck[i] })
  const winner = seats.reduce((best, seat) =>
    cardValue(draws[seat]) > cardValue(draws[best]) ? seat : best
  )
  return { draws, winner }
}

module.exports = { deal, cardRank, cardSuit, drawHighCard }
