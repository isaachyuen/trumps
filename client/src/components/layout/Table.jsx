import React from 'react'
import { useGame } from '../../context/GameContext'
import PlayerInfo from '../player/PlayerInfo'
import PlayerHand from '../player/PlayerHand'
import TrickArea from '../trick/TrickArea'
import Card from '../cards/Card'
import Scoreboard from '../scoring/Scoreboard'
import styles from './Table.module.css'

// Return the display seat mapping: where does each actual seat appear visually?
// My seat always at bottom (S), partner at top (N), opponents left (W) and right (E)
function getSeatMap(mySeat) {
  const order = ['N', 'E', 'S', 'W']
  const myIdx = order.indexOf(mySeat)
  const map = {}
  order.forEach((seat, i) => {
    const displayIdx = (i - myIdx + 2 + 4) % 4
    map[seat] = order[displayIdx]
  })
  return map
}

export default function Table({ roomCode }) {
  const { state } = useGame()
  const { gameState, mySeat, myHand, roomState, phase } = state

  const players = roomState?.players || []
  const seatMap = mySeat ? getSeatMap(mySeat) : {}

  function getPlayerBySeat(seat) {
    return players.find(p => p.seat === seat)
  }

  function displaySeat(actualSeat) {
    return seatMap[actualSeat]
  }

  // For each display position, get the actual seat
  const displayToActual = {}
  if (mySeat) {
    Object.entries(seatMap).forEach(([actual, display]) => {
      displayToActual[display] = actual
    })
  }

  const handCounts = {}
  if (gameState?.hands) {
    Object.entries(gameState.hands).forEach(([seat, hand]) => {
      handCounts[seat] = hand.length
    })
  }

  // Estimate hand count from tricks won
  const estimateCardCount = (seat) => {
    if (seat === mySeat) return myHand.length
    if (gameState) {
      return 13 - (gameState.tricksWon ? Object.values(gameState.tricksWon).reduce((a, b) => a + b, 0) / 4 | 0 : 0)
    }
    return 13
  }

  function seatInfo(displayPos) {
    const actual = displayToActual[displayPos]
    if (!actual) return null
    const player = getPlayerBySeat(actual)
    const isMe = actual === mySeat
    const isActive = gameState?.currentTurn === actual
    const bid = gameState?.bids?.[actual]
    const tricks = gameState?.tricksWon?.[actual]
    const cardCount = isMe ? myHand.length : estimateCardCount(actual)
    return { actual, player, isMe, isActive, bid, tricks, cardCount }
  }

  return (
    <div className={styles.table}>
      {/* Scoreboard */}
      <div className={styles.scoreArea}>
        <Scoreboard />
      </div>

      {/* Top player (partner) */}
      <div className={styles.topSeat}>
        {(() => {
          const info = seatInfo('N')
          if (!info) return null
          return (
            <>
              <PlayerInfo
                player={info.player}
                bid={info.bid}
                tricksWon={info.tricks}
                isCurrentTurn={info.isActive}
                isMe={info.isMe}
              />
              <div className={styles.facedownHand}>
                {Array.from({ length: info.cardCount > 0 ? Math.min(info.cardCount, 13) : 0 }).map((_, i) => (
                  <Card key={i} faceDown small />
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* Left player */}
      <div className={styles.leftSeat}>
        {(() => {
          const info = seatInfo('W')
          if (!info) return null
          return (
            <>
              <PlayerInfo
                player={info.player}
                bid={info.bid}
                tricksWon={info.tricks}
                isCurrentTurn={info.isActive}
                isMe={info.isMe}
              />
              <div className={styles.facedownHandVertical}>
                {Array.from({ length: info.cardCount > 0 ? Math.min(info.cardCount, 13) : 0 }).map((_, i) => (
                  <Card key={i} faceDown small />
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* Center trick area */}
      <div className={styles.center}>
        <TrickArea
          currentTrick={gameState?.currentTrick || []}
          mySeat={mySeat || 'S'}
        />
        {gameState?.trumpSuit && (
          <div className={styles.trumpIndicator}>
            Trump: {gameState.trumpSuit === 'S' ? '♠' : gameState.trumpSuit === 'H' ? '♥' : gameState.trumpSuit === 'D' ? '♦' : '♣'}
          </div>
        )}
      </div>

      {/* Right player */}
      <div className={styles.rightSeat}>
        {(() => {
          const info = seatInfo('E')
          if (!info) return null
          return (
            <>
              <PlayerInfo
                player={info.player}
                bid={info.bid}
                tricksWon={info.tricks}
                isCurrentTurn={info.isActive}
                isMe={info.isMe}
              />
              <div className={styles.facedownHandVertical}>
                {Array.from({ length: info.cardCount > 0 ? Math.min(info.cardCount, 13) : 0 }).map((_, i) => (
                  <Card key={i} faceDown small />
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* Bottom: me */}
      <div className={styles.bottomSeat}>
        {(() => {
          const info = seatInfo('S')
          if (!info) return null
          return (
            <>
              <PlayerInfo
                player={info.player}
                bid={info.bid}
                tricksWon={info.tricks}
                isCurrentTurn={info.isActive}
                isMe={info.isMe}
              />
            </>
          )
        })()}
        <PlayerHand roomCode={roomCode} />
      </div>
    </div>
  )
}
