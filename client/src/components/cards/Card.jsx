import React from 'react'
import styles from './Card.module.css'

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED_SUITS = new Set(['H', 'D'])

export default function Card({ card, playable, selected, onClick, faceDown, small }) {
  if (faceDown) {
    return <div className={`${styles.card} ${styles.faceDown} ${small ? styles.small : ''}`} />
  }

  const rank = card[0]
  const suit = card[1]
  const isRed = RED_SUITS.has(suit)
  const symbol = SUIT_SYMBOLS[suit]
  const displayRank = rank === 'T' ? '10' : rank

  return (
    <div
      className={`${styles.card} ${isRed ? styles.red : styles.black} ${playable ? styles.playable : ''} ${selected ? styles.selected : ''} ${small ? styles.small : ''}`}
      onClick={playable ? onClick : undefined}
      title={playable ? `Play ${displayRank}${symbol}` : undefined}
    >
      <div className={styles.corner}>
        <div className={styles.rank}>{displayRank}</div>
        <div className={styles.suit}>{symbol}</div>
      </div>
      <div className={styles.centerSuit}>{symbol}</div>
      <div className={`${styles.corner} ${styles.bottom}`}>
        <div className={styles.rank}>{displayRank}</div>
        <div className={styles.suit}>{symbol}</div>
      </div>
    </div>
  )
}
