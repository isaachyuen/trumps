import React from 'react'
import { useGame } from '../../context/GameContext'
import styles from './Scoreboard.module.css'

export default function Scoreboard() {
  const { state } = useGame()
  const { wins, gameState, handsPlayed, gameOptions } = state

  const trump = gameState?.trumpSuit
  const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' }
  const RED_SUITS = new Set(['H', 'D'])

  return (
    <div className={styles.board}>
      {gameOptions?.handsPerGame > 0 && (
        <div className={styles.progress}>
          <span className={styles.sub}>{handsPlayed ?? 0}/{gameOptions.handsPerGame}</span>
        </div>
      )}
      <div className={styles.team}>
        <span className={styles.label}>NS</span>
        <span className={styles.score}>{wins?.NS ?? 0}</span>
        <span className={styles.sub}>wins</span>
      </div>
      {trump && (
        <div className={styles.trump}>
          <span className={styles.trumpLabel}>{gameState?.bidType ?? ''} trump</span>
          <span
            className={styles.trumpSuit}
            style={{ color: RED_SUITS.has(trump) ? '#e74c3c' : '#fff' }}
          >
            {SUIT_SYMBOLS[trump]}
          </span>
        </div>
      )}
      <div className={styles.divider} />
      <div className={styles.team}>
        <span className={styles.label}>EW</span>
        <span className={styles.score}>{wins?.EW ?? 0}</span>
        <span className={styles.sub}>wins</span>
      </div>
    </div>
  )
}
