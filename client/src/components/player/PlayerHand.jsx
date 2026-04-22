import React from 'react'
import { socket } from '../../socket'
import { useGame } from '../../context/GameContext'
import Card from '../cards/Card'
import styles from './PlayerHand.module.css'

function cardSuit(card) { return card[1] }
function cardRank(card) {
  const order = '23456789TJQKA'
  return order.indexOf(card[0])
}

function sortHand(hand) {
  const suitOrder = { S: 0, H: 1, D: 2, C: 3 }
  return [...hand].sort((a, b) => {
    const sd = suitOrder[cardSuit(a)] - suitOrder[cardSuit(b)]
    return sd !== 0 ? sd : cardRank(b) - cardRank(a)
  })
}

function canPlayCard(game, mySeat, card, myHand) {
  if (game.currentTurn !== mySeat) return false
  if (game.currentTrick.length > 0) {
    const leadSuit = cardSuit(game.currentTrick[0].card)
    if (cardSuit(card) !== leadSuit) {
      return !myHand.some(c => cardSuit(c) === leadSuit)
    }
  }
  return true
}

export default function PlayerHand({ roomCode }) {
  const { state } = useGame()
  const { myHand, mySeat, gameState, phase } = state
  const isMyTurn = gameState?.currentTurn === mySeat && phase === 'playing'

  function playCard(card) {
    socket.emit('playCard', { roomCode, card }, res => {
      if (res.error) alert(res.error)
    })
  }

  const sorted = sortHand(myHand)

  return (
    <div className={styles.hand}>
      {sorted.map(card => {
        const playable = isMyTurn && canPlayCard(gameState, mySeat, card, myHand)
        return (
          <Card
            key={card}
            card={card}
            playable={playable}
            onClick={() => playCard(card)}
          />
        )
      })}
    </div>
  )
}
