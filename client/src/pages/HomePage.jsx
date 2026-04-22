import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { socket } from '../socket'
import { useGame } from '../context/GameContext'
import styles from './HomePage.module.css'

export default function HomePage() {
  const navigate = useNavigate()
  const { dispatch } = useGame()
  const [createName, setCreateName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const room = params.get('room')
    if (room) setJoinCode(room.toUpperCase())
  }, [])

  function connect() {
    if (!socket.connected) socket.connect()
  }

  function handleCreate(e) {
    e.preventDefault()
    if (!createName.trim()) return
    setLoading(true)
    setError('')
    connect()
    socket.emit('createRoom', { playerName: createName.trim() }, res => {
      setLoading(false)
      if (res.error) { setError(res.error); return }
      dispatch({ type: 'ROOM_CREATED', payload: { roomCode: res.roomCode, playerId: res.playerId, roomState: null } })
      sessionStorage.setItem('spades_name', createName.trim())
      navigate(`/lobby/${res.roomCode}`)
    })
  }

  function handleJoin(e) {
    e.preventDefault()
    if (!joinName.trim() || !joinCode.trim()) return
    setLoading(true)
    setError('')
    connect()
    socket.emit('joinRoom', { roomCode: joinCode.trim().toUpperCase(), playerName: joinName.trim() }, res => {
      setLoading(false)
      if (res.error) { setError(res.error); return }
      dispatch({ type: 'ROOM_JOINED', payload: { roomCode: res.roomCode, playerId: res.playerId, roomState: res.roomState } })
      sessionStorage.setItem('spades_name', joinName.trim())
      if (res.reconnected) {
        navigate(`/game/${res.roomCode}`)
      } else {
        navigate(`/lobby/${res.roomCode}`)
      }
    })
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>♠ Spades</h1>
      <p className={styles.subtitle}>Multiplayer card game for 4 players</p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.panels}>
        <form className={styles.panel} onSubmit={handleCreate}>
          <h2>Create Game</h2>
          <input
            className={styles.input}
            placeholder="Your name"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            maxLength={20}
          />
          <button className={styles.btn} type="submit" disabled={loading || !createName.trim()}>
            Create Room
          </button>
        </form>

        <div className={styles.divider} />

        <form className={styles.panel} onSubmit={handleJoin}>
          <h2>Join Game</h2>
          <input
            className={styles.input}
            placeholder="Your name"
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            maxLength={20}
          />
          <input
            className={styles.input}
            placeholder="Room code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={4}
            style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
          />
          <button className={styles.btn} type="submit" disabled={loading || !joinName.trim() || joinCode.length !== 4}>
            Join Room
          </button>
        </form>
      </div>
    </div>
  )
}
