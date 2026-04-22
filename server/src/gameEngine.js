const { deal, cardRank, cardSuit, drawHighCard } = require('./deck')
const { scoreRound } = require('./scoring')
const { SEAT_ORDER, nextSeat } = require('./utils')

// bid ordering: { value, type } → numeric for comparison
// 0-high=0, 0-low=1, 1-high=2, 1-low=3, ..., 7-high=14, 7-low=15
function bidOrder(bid) {
  if (!bid || bid === 'pass') return -1
  return bid.value * 2 + (bid.type === 'low' ? 1 : 0)
}

// Card rank adjusted for high/low mode
// Low mode: A always highest (14), then 2=13, 3=12, ..., K=2
function cardRankForMode(card, isLow) {
  const rank = cardRank(card)
  if (!isLow) return rank
  if (rank === 14) return 14   // Ace always strongest
  return 15 - rank             // 2→13, 3→12, ..., K→2
}

function startGame(room, dealerSeat) {
  if (!dealerSeat) dealerSeat = SEAT_ORDER[Math.floor(Math.random() * 4)]
  const dealerIdx = SEAT_ORDER.indexOf(dealerSeat)

  // Bidding starts left of dealer (clockwise)
  const startIdx = (dealerIdx + 1) % 4
  const biddingOrder = [0, 1, 2, 3].map(i => SEAT_ORDER[(startIdx + i) % 4])

  const dealt = deal()

  room.status = 'bidding'
  room.game = {
    hands: { N: dealt.N, E: dealt.E, S: dealt.S, W: dealt.W },
    kitty: dealt.kitty,
    bids: { N: null, S: null, E: null, W: null },
    highestBid: null,          // { value, type } or null
    highestBidder: null,
    bidType: null,             // 'high' | 'low' — set when bidding completes
    trumpSuit: null,
    tricksWon: { N: 0, S: 0, E: 0, W: 0 },
    currentTrick: [],
    trickLeader: null,
    currentTurn: biddingOrder[0],
    roundNumber: room.game ? room.game.roundNumber + 1 : 1,
    dealerSeat,
    bidOrder: biddingOrder,
    history: room.game ? room.game.history : []
  }
}

function placeBid(game, seat, bid) {
  // bid: 'pass' | { value: 0-7, type: 'high'|'low' }
  if (game.currentTurn !== seat) throw new Error('Not your turn to bid')
  if (game.bids[seat] !== null) throw new Error('Already bid')

  const bidIdx = game.bidOrder.indexOf(seat)
  const isLastBidder = bidIdx === 3
  const passCount = Object.values(game.bids).filter(b => b === 'pass').length
  const mustBid = isLastBidder && passCount === 3

  if (bid === 'pass') {
    if (mustBid) throw new Error('You must bid — everyone else passed')
    game.bids[seat] = 'pass'
  } else {
    if (!bid || bid.value == null || !['high', 'low'].includes(bid.type))
      throw new Error('Invalid bid format')
    if (bid.value < 0 || bid.value > 7) throw new Error('Bid value must be 0–7')
    if (bidOrder(bid) <= bidOrder(game.highestBid))
      throw new Error(`Must bid higher than current bid`)
    game.bids[seat] = bid
    game.highestBid = bid
    game.highestBidder = seat
  }

  const nextBidder = game.bidOrder[bidIdx + 1] || null

  if (!nextBidder) {
    if (!game.highestBidder) {
      // All passed — dealer forced to 0-high
      const forced = { value: 0, type: 'high' }
      game.bids[game.dealerSeat] = forced
      game.highestBid = forced
      game.highestBidder = game.dealerSeat
    }
    game.bidType = game.highestBid.type
    game.currentTurn = game.highestBidder
    return { biddingComplete: true, winner: game.highestBidder, bid: game.highestBid }
  }

  game.currentTurn = nextBidder
  return { biddingComplete: false, nextBidder }
}

function selectTrump(game, seat, suit, discards) {
  if (game.highestBidder !== seat) throw new Error('Only the winning bidder selects trump')
  if (!['S', 'H', 'D', 'C'].includes(suit)) throw new Error('Invalid suit')

  const fullHand = [...game.hands[seat], ...game.kitty]
  if (discards.length !== 4) throw new Error('Must discard exactly 4 cards')
  for (const c of discards) {
    if (!fullHand.includes(c)) throw new Error(`Card ${c} not available to discard`)
  }

  game.hands[seat] = fullHand.filter(c => !discards.includes(c))
  game.kitty = []
  game.trumpSuit = suit
  game.trickLeader = seat
  game.currentTurn = seat
}

function isValidPlay(game, seat, card) {
  if (game.currentTurn !== seat) return { valid: false, reason: 'Not your turn' }
  if (!game.hands[seat].includes(card)) return { valid: false, reason: 'Card not in hand' }

  if (game.currentTrick.length > 0) {
    const leadSuit = cardSuit(game.currentTrick[0].card)
    const suit = cardSuit(card)
    if (suit !== leadSuit) {
      const hasLeadSuit = game.hands[seat].some(c => cardSuit(c) === leadSuit)
      if (hasLeadSuit) return { valid: false, reason: `Must follow suit (${leadSuit})` }
    }
  }

  return { valid: true }
}

function playCard(game, seat, card) {
  const check = isValidPlay(game, seat, card)
  if (!check.valid) throw new Error(check.reason)

  game.hands[seat] = game.hands[seat].filter(c => c !== card)
  game.currentTrick.push({ seat, card })

  if (game.currentTrick.length < 4) {
    game.currentTurn = nextSeat(seat)
    return { trickComplete: false }
  }

  return { trickComplete: true, ...evaluateTrick(game) }
}

function evaluateTrick(game) {
  const trick = game.currentTrick
  const trump = game.trumpSuit
  const isLow = game.bidType === 'low'
  let winner = trick[0]

  for (let i = 1; i < trick.length; i++) {
    const played = trick[i]
    const winnerSuit = cardSuit(winner.card)
    const playedSuit = cardSuit(played.card)

    if (playedSuit === trump && winnerSuit !== trump) {
      winner = played
    } else if (playedSuit === winnerSuit &&
               cardRankForMode(played.card, isLow) > cardRankForMode(winner.card, isLow)) {
      winner = played
    }
  }

  game.tricksWon[winner.seat]++
  game.currentTrick = []
  game.trickLeader = winner.seat
  game.currentTurn = winner.seat

  const roundOver = Object.values(game.hands).every(h => h.length === 0)
  return { winner: winner.seat, winningCard: winner.card, roundOver }
}

module.exports = { startGame, placeBid, selectTrump, isValidPlay, playCard, scoreRound, drawHighCard }
