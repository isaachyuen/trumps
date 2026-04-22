import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { socket } from '../socket'
import { useGame } from '../context/GameContext'
import styles from './LobbyPage.module.css'

const SEAT_LABELS = { N: 'North', S: 'South', E: 'East', W: 'West' }
const TEAM_LABEL = { N: 'Team NS', S: 'Team NS', E: 'Team EW', W: 'Team EW' }
const SEATS = ['N', 'E', 'S', 'W']

export default function LobbyPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { roomState, playerId, gameOptions } = state

  const [handsPerGame, setHandsPerGame] = useState(gameOptions?.handsPerGame ?? 5)
  const [betPerGame, setBetPerGame] = useState(gameOptions?.betPerGame ?? 0)

  useEffect(() => {
    if (!socket.connected) navigate('/')
  }, [])

  useEffect(() => {
    setHandsPerGame(gameOptions?.handsPerGame ?? 5)
    setBetPerGame(gameOptions?.betPerGame ?? 0)
  }, [gameOptions?.handsPerGame, gameOptions?.betPerGame])

  useEffect(() => {
    socket.on('highCardDraw', payload => {
      dispatch({ type: 'HIGH_CARD_DRAW', payload })
      navigate(`/game/${roomCode}`)
    })
    socket.on('gameStarted', payload => {
      dispatch({ type: 'GAME_STARTED', payload })
      navigate(`/game/${roomCode}`)
    })
    return () => {
      socket.off('highCardDraw')
      socket.off('gameStarted')
    }
  }, [roomCode])

  const players = roomState?.players || []
  const isHost = playerId && roomState?.host === playerId
  const allSeated = players.filter(p => p.seat).length === 4 &&
    new Set(players.filter(p => p.seat).map(p => p.seat)).size === 4

  function pickSeat(seat) {
    socket.emit('chooseSeat', { roomCode, seat }, res => {
      if (res.error) alert(res.error)
    })
  }

  function applyOptions() {
    socket.emit('setOptions', { roomCode, handsPerGame, betPerGame }, res => {
      if (res.error) alert(res.error)
    })
  }

  function startGame() {
    socket.emit('startGame', { roomCode }, res => {
      if (res.error) alert(res.error)
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${roomCode}`).catch(() => {})
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>♠ Trumps</h1>
        <div className={styles.roomCode}>
          <span>Room: <strong>{roomCode}</strong></span>
          <button className={styles.copyBtn} onClick={copyLink}>Copy Link</button>
        </div>
      </div>

      <div className={styles.seatGrid}>
        {SEATS.map(seat => {
          const occupant = players.find(p => p.seat === seat)
          const isMe = occupant?.socketId === playerId
          return (
            <div
              key={seat}
              className={`${styles.seat} ${occupant ? styles.occupied : styles.empty} ${isMe ? styles.mine : ''}`}
              onClick={() => !occupant && pickSeat(seat)}
            >
              <div className={styles.seatLabel}>{SEAT_LABELS[seat]}</div>
              <div className={styles.teamLabel}>{TEAM_LABEL[seat]}</div>
              {occupant ? (
                <div className={styles.playerName}>
                  {occupant.name}{isMe && ' (you)'}{roomState?.host === occupant.socketId && ' ★'}
                </div>
              ) : (
                <div className={styles.emptySlot}>Click to sit</div>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.teamDisplay}>
        <div className={styles.team}>
          <span className={styles.teamName}>Team NS</span>
          <span>{players.find(p => p.seat === 'N')?.name || '—'} & {players.find(p => p.seat === 'S')?.name || '—'}</span>
        </div>
        <span className={styles.vs}>vs</span>
        <div className={styles.team}>
          <span className={styles.teamName}>Team EW</span>
          <span>{players.find(p => p.seat === 'E')?.name || '—'} & {players.find(p => p.seat === 'W')?.name || '—'}</span>
        </div>
      </div>

      <div className={styles.options}>
        <h3 className={styles.optionsTitle}>Game Options</h3>
        <div className={styles.optionsRow}>
          <label>Hands per game</label>
          {isHost ? (
            <input
              type="number" min="1" max="20"
              className={styles.optInput}
              value={handsPerGame}
              onChange={e => setHandsPerGame(e.target.value)}
              onBlur={applyOptions}
            />
          ) : (
            <span className={styles.optValue}>{gameOptions?.handsPerGame ?? 5}</span>
          )}
        </div>
        <div className={styles.optionsRow}>
          <label>Bet per game ($)</label>
          {isHost ? (
            <input
              type="number" min="0" step="0.50"
              className={styles.optInput}
              value={betPerGame}
              onChange={e => setBetPerGame(e.target.value)}
              onBlur={applyOptions}
            />
          ) : (
            <span className={styles.optValue}>${gameOptions?.betPerGame ?? 0}</span>
          )}
        </div>
        {isHost && <p className={styles.optHint}>Changes apply when you tab out of the field</p>}
      </div>

      {isHost ? (
        <button
          className={`${styles.startBtn} ${allSeated ? '' : styles.disabled}`}
          onClick={startGame}
          disabled={!allSeated}
        >
          {allSeated ? 'Start Game' : `Waiting for players… (${players.filter(p => p.seat).length}/4 seated)`}
        </button>
      ) : (
        <p className={styles.waiting}>Waiting for host to start…</p>
      )}
    </div>
  )
}
