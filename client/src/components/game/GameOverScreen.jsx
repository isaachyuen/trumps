import React, { useState } from 'react'
import { socket } from '../../socket'
import { useGame } from '../../context/GameContext'
import styles from './GameOverScreen.module.css'

export default function GameOverScreen({ roomCode }) {
  const { state } = useGame()
  const { gameResult, playerId, roomState, gameOptions } = state

  const [handsPerGame, setHandsPerGame] = useState(gameOptions?.handsPerGame ?? 5)
  const [betPerGame, setBetPerGame] = useState(gameOptions?.betPerGame ?? 0)

  if (!gameResult) return null

  const isHost = playerId && roomState?.host === playerId
  const { gameWins, gameWinner, betAmount, balance } = gameResult

  const balanceAbs = Math.abs(balance).toFixed(2)
  const balanceTeam = balance > 0 ? 'NS' : balance < 0 ? 'EW' : null
  const gameWinText = gameWinner ? `Team ${gameWinner} wins the game!` : 'Tie game!'

  function startNext() {
    socket.emit('confirmContinue', { roomCode, handsPerGame, betPerGame }, res => {
      if (res.error) alert(res.error)
    })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.screen}>
        <div className={styles.trophy}>{gameWinner ? '🏆' : '🤝'}</div>
        <h1 className={styles.winText}>{gameWinText}</h1>

        <div className={styles.gameScore}>
          <div className={`${styles.teamScore} ${gameWinner === 'NS' ? styles.winner : ''}`}>
            <span className={styles.teamLabel}>NS</span>
            <span className={styles.handWins}>{gameWins.NS}</span>
            <span className={styles.handsLabel}>hands</span>
          </div>
          <span className={styles.vs}>vs</span>
          <div className={`${styles.teamScore} ${gameWinner === 'EW' ? styles.winner : ''}`}>
            <span className={styles.teamLabel}>EW</span>
            <span className={styles.handWins}>{gameWins.EW}</span>
            <span className={styles.handsLabel}>hands</span>
          </div>
        </div>

        {betAmount > 0 && (
          <div className={styles.moneySection}>
            <div className={styles.thisGame}>
              {gameWinner
                ? `Team ${gameWinner === 'NS' ? 'EW' : 'NS'} owes Team ${gameWinner} $${betAmount.toFixed(2)}`
                : 'No money changes hands (tie)'}
            </div>
            {balance !== 0 && (
              <div className={styles.running}>
                Running total: Team {balanceTeam === 'NS' ? 'EW' : 'NS'} owes Team {balanceTeam} ${balanceAbs}
              </div>
            )}
          </div>
        )}

        {isHost ? (
          <div className={styles.hostSection}>
            <h3 className={styles.optTitle}>Next Game Options</h3>
            <div className={styles.optRow}>
              <label>Hands per game</label>
              <input
                type="number" min="1" max="20"
                className={styles.optInput}
                value={handsPerGame}
                onChange={e => setHandsPerGame(e.target.value)}
              />
            </div>
            <div className={styles.optRow}>
              <label>Bet per game ($)</label>
              <input
                type="number" min="0" step="0.50"
                className={styles.optInput}
                value={betPerGame}
                onChange={e => setBetPerGame(e.target.value)}
              />
            </div>
            <button className={styles.startBtn} onClick={startNext}>
              Start Next Game
            </button>
          </div>
        ) : (
          <p className={styles.waiting}>Waiting for host to start the next game…</p>
        )}
      </div>
    </div>
  )
}
