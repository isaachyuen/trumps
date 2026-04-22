import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { socket } from '../socket'
import { useGame } from '../context/GameContext'
import Table from '../components/layout/Table'
import BidPanel from '../components/bidding/BidPanel'
import TrumpSelector from '../components/trump/TrumpSelector'
import RoundSummary from '../components/scoring/RoundSummary'
import GameOverScreen from '../components/game/GameOverScreen'
import HighCardDraw from '../components/game/HighCardDraw'
import styles from './GamePage.module.css'

export default function GamePage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { phase } = state

  useEffect(() => {
    if (!socket.connected) navigate('/')
  }, [])

  return (
    <div className={styles.page}>
      <Table roomCode={roomCode} />

      {phase === 'highCardDraw' && <HighCardDraw />}
      {phase === 'bidding' && <BidPanel roomCode={roomCode} />}
      {phase === 'selectingTrump' && <TrumpSelector roomCode={roomCode} />}
      {phase === 'roundEnd' && <RoundSummary onContinue={() => dispatch({ type: 'CLEAR_ERROR' })} />}
      {phase === 'gameOver' && <GameOverScreen roomCode={roomCode} />}
    </div>
  )
}
