import React from 'react'
import { useGame } from '../../context/GameContext'
import Card from '../cards/Card'
import styles from './HighCardDraw.module.css'

const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' }

export default function HighCardDraw() {
  const { state } = useGame()
  const { highCardDraw, mySeat } = state
  if (!highCardDraw) return null

  const { draws, winner } = highCardDraw

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2>High-Card Draw</h2>
        <p className={styles.subtitle}>Highest card deals first</p>

        <div className={styles.draws}>
          {['N', 'E', 'S', 'W'].map(seat => (
            <div
              key={seat}
              className={`${styles.drawEntry} ${seat === winner ? styles.winner : ''}`}
            >
              <div className={styles.seatLabel}>
                {SEAT_NAMES[seat]}{seat === mySeat ? ' (you)' : ''}
              </div>
              <Card card={draws[seat]} small />
              {seat === winner && <div className={styles.dealsBadge}>Deals</div>}
            </div>
          ))}
        </div>

        <p className={styles.starting}>Starting in 3 seconds…</p>
      </div>
    </div>
  )
}
