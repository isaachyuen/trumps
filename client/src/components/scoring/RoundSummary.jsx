import React from 'react'
import { useGame } from '../../context/GameContext'
import { formatBid } from '../../utils/bid'
import styles from './RoundSummary.module.css'

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED_SUITS = new Set(['H', 'D'])

export default function RoundSummary({ onContinue }) {
  const { state } = useGame()
  const { roundSummary, wins } = state
  if (!roundSummary) return null

  const { highestBidder, highestBid, trumpSuit, tricksWon, madeIt, winner } = roundSummary

  const bidderTeam = highestBidder === 'N' || highestBidder === 'S' ? 'NS' : 'EW'
  const [bp1, bp2] = bidderTeam === 'NS' ? ['N', 'S'] : ['E', 'W']
  const teamTricks = (tricksWon[bp1] || 0) + (tricksWon[bp2] || 0)

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Round {roundSummary.round ?? ''} Complete</h2>

        <div className={styles.trumpDisplay}>
          <span className={styles.trumpLabel}>Trump:</span>
          <span
            className={styles.trumpSuit}
            style={{ color: RED_SUITS.has(trumpSuit) ? '#e74c3c' : '#fff' }}
          >
            {SUIT_SYMBOLS[trumpSuit]} {trumpSuit === 'S' ? 'Spades' : trumpSuit === 'H' ? 'Hearts' : trumpSuit === 'D' ? 'Diamonds' : 'Clubs'}
          </span>
        </div>

        <div className={`${styles.result} ${madeIt ? styles.made : styles.failed}`}>
          {highestBidder} bid {formatBid(highestBid)} (needed {5 + (highestBid?.value ?? 0)}) — {madeIt ? `made it with ${teamTricks}` : `failed with ${teamTricks}`}
        </div>

        <div className={styles.winnerBanner}>
          Team {winner} wins this hand!
        </div>

        <div className={styles.winsDisplay}>
          <div className={styles.winTeam}>
            <span className={styles.teamLabel}>NS</span>
            <span className={styles.winCount}>{wins?.NS ?? 0}</span>
          </div>
          <span className={styles.vs}>wins</span>
          <div className={styles.winTeam}>
            <span className={styles.teamLabel}>EW</span>
            <span className={styles.winCount}>{wins?.EW ?? 0}</span>
          </div>
        </div>

        <div className={styles.trickBreakdown}>
          {['N', 'E', 'S', 'W'].map(seat => (
            <div key={seat} className={styles.trickRow}>
              <span>{seat}</span>
              <span>{tricksWon[seat] ?? 0} tricks</span>
            </div>
          ))}
        </div>

        <p className={styles.next}>Next hand starts in 5s…</p>
        <button className={styles.btn} onClick={onContinue}>Continue Now</button>
      </div>
    </div>
  )
}
