const { seatTeam } = require('./utils')

function scoreRound(game, room) {
  const bidderTeam = seatTeam(game.highestBidder)
  const defenderTeam = bidderTeam === 'NS' ? 'EW' : 'NS'

  const [p1, p2] = bidderTeam === 'NS' ? ['N', 'S'] : ['E', 'W']
  const teamTricks = game.tricksWon[p1] + game.tricksWon[p2]
  const madeIt = teamTricks >= 5 + game.highestBid.value

  const winner = madeIt ? bidderTeam : defenderTeam
  room.wins[winner]++

  const summary = {
    round: game.roundNumber,
    highestBidder: game.highestBidder,
    highestBid: game.highestBid,
    trumpSuit: game.trumpSuit,
    tricksWon: { ...game.tricksWon },
    madeIt,
    winner
  }

  game.history.push(summary)
  return { summary, wins: room.wins, winner }
}

module.exports = { scoreRound }
