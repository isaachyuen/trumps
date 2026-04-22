import React, { useState } from 'react'
import { socket } from '../../socket'
import { useGame } from '../../context/GameContext'
import { formatBid, bidOrder } from '../../utils/bid'
import styles from './BidPanel.module.css'

export default function BidPanel({ roomCode }) {
  const { state } = useGame()
  const { gameState, mySeat, phase } = state
  const [selected, setSelected] = useState(null) // { value, type } | null

  const isMyTurn = phase === 'bidding' && gameState?.currentTurn === mySeat
  const bids = gameState?.bids || {}
  const highestBid = gameState?.highestBid ?? null
  const highestBidder = gameState?.highestBidder

  const bidIdx = gameState?.bidOrder?.indexOf(mySeat) ?? -1
  const isLastBidder = bidIdx === 3
  const passCount = Object.values(bids).filter(b => b === 'pass').length
  const mustBid = isLastBidder && passCount === 3

  const currentOrder = bidOrder(highestBid)

  function isValidBid(value, type) {
    return bidOrder({ value, type }) > currentOrder
  }

  function toggleSelected(value, type) {
    if (!isValidBid(value, type)) return
    if (selected?.value === value && selected?.type === type) {
      setSelected(null)
    } else {
      setSelected({ value, type })
    }
  }

  function submit() {
    if (!selected) return
    socket.emit('placeBid', { roomCode, bid: selected }, res => {
      if (res.error) alert(res.error)
      else setSelected(null)
    })
  }

  function submitPass() {
    socket.emit('placeBid', { roomCode, bid: 'pass' }, res => {
      if (res.error) alert(res.error)
    })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2>Bidding</h2>

        {highestBid && (
          <div className={styles.currentHighest}>
            Current: <strong>{formatBid(highestBid)}</strong> by {highestBidder}
          </div>
        )}

        <div className={styles.bidList}>
          {(gameState?.bidOrder || []).map(seat => (
            <div key={seat} className={`${styles.bidEntry} ${gameState?.currentTurn === seat ? styles.active : ''}`}>
              <span className={styles.seat}>{seat}</span>
              <span className={styles.bidVal}>{formatBid(bids[seat])}</span>
            </div>
          ))}
        </div>

        {isMyTurn ? (
          <>
            <p className={styles.prompt}>Select bid (need 5 + value tricks):</p>

            <div className={styles.bidGrid}>
              <div className={styles.headerRow}>
                <span />
                <span className={styles.typeHead}>High</span>
                <span className={styles.typeHead}>Low</span>
              </div>
              {[0, 1, 2, 3, 4, 5, 6, 7].map(value => (
                <div key={value} className={styles.bidRow}>
                  <span className={styles.valueLabel}>{value}</span>
                  {['high', 'low'].map(type => {
                    const valid = isValidBid(value, type)
                    const isSelected = selected?.value === value && selected?.type === type
                    return (
                      <button
                        key={type}
                        className={`${styles.bidBtn} ${!valid ? styles.disabled : ''} ${isSelected ? styles.selectedBid : ''}`}
                        onClick={() => toggleSelected(value, type)}
                        disabled={!valid}
                        title={valid ? `Bid ${value}-${type}` : 'Must beat current bid'}
                      >
                        {type === 'high' ? 'H' : 'L'}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className={styles.actions}>
              <button
                className={styles.confirmBtn}
                onClick={submit}
                disabled={!selected}
              >
                {selected ? `Bid ${formatBid(selected)}` : 'Select a bid'}
              </button>
              {!mustBid && (
                <button className={styles.passBtn} onClick={submitPass}>Pass</button>
              )}
            </div>
            {mustBid && <p className={styles.mustBid}>You must bid — everyone else passed</p>}
          </>
        ) : (
          <p className={styles.waiting}>Waiting for {gameState?.currentTurn} to bid…</p>
        )}
      </div>
    </div>
  )
}
