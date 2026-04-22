import React, { useState } from 'react'
import { socket } from '../../socket'
import { useGame } from '../../context/GameContext'
import { formatBid } from '../../utils/bid'
import Card from '../cards/Card'
import styles from './TrumpSelector.module.css'

const SUITS = [
  { suit: 'S', label: '♠ Spades', color: '#fff' },
  { suit: 'H', label: '♥ Hearts', color: '#e74c3c' },
  { suit: 'D', label: '♦ Diamonds', color: '#e74c3c' },
  { suit: 'C', label: '♣ Clubs', color: '#fff' }
]

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

export default function TrumpSelector({ roomCode }) {
  const { state } = useGame()
  const { myHand, kitty, mySeat, gameState } = state
  const [selectedSuit, setSelectedSuit] = useState(null)
  const [discards, setDiscards] = useState([])

  const isWinner = gameState?.highestBidder === mySeat
  const fullHand = sortHand([...myHand, ...kitty])
  const needed = 4

  function toggleDiscard(card) {
    setDiscards(prev =>
      prev.includes(card)
        ? prev.filter(c => c !== card)
        : prev.length < needed ? [...prev, card] : prev
    )
  }

  function confirm() {
    if (!selectedSuit || discards.length !== needed) return
    socket.emit('selectTrump', { roomCode, suit: selectedSuit, discards }, res => {
      if (res.error) alert(res.error)
    })
  }

  const bid = gameState?.highestBid
  const winner = gameState?.highestBidder

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2>Trump Selection</h2>
        <p className={styles.subtitle}>
          {isWinner
            ? `You won the bid with ${formatBid(bid)}. Choose trump and discard 4 cards.`
            : `${winner} won the bid with ${formatBid(bid)}. Selecting trump…`}
        </p>

        {isWinner ? (
          <>
            <div className={styles.suitGrid}>
              {SUITS.map(({ suit, label, color }) => (
                <button
                  key={suit}
                  className={`${styles.suitBtn} ${selectedSuit === suit ? styles.selectedSuit : ''}`}
                  style={{ color }}
                  onClick={() => setSelectedSuit(suit)}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className={styles.discardPrompt}>
              Select 4 cards to discard ({discards.length}/4):
            </p>

            <div className={styles.handDisplay}>
              {fullHand.map(card => (
                <div
                  key={card}
                  className={`${styles.cardSlot} ${discards.includes(card) ? styles.discarding : ''}`}
                  onClick={() => toggleDiscard(card)}
                >
                  <Card card={card} small />
                  {discards.includes(card) && <div className={styles.discardX}>✕</div>}
                </div>
              ))}
            </div>

            <button
              className={styles.confirmBtn}
              onClick={confirm}
              disabled={!selectedSuit || discards.length !== needed}
            >
              Confirm
            </button>
          </>
        ) : (
          <div className={styles.waiting}>Waiting for {winner} to select trump…</div>
        )}
      </div>
    </div>
  )
}
