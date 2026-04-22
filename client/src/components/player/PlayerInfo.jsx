import React from 'react'
import styles from './PlayerInfo.module.css'

export default function PlayerInfo({ player, bid, tricksWon, isCurrentTurn, isMe, cardCount }) {
  if (!player) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptySlot}>Empty</div>
      </div>
    )
  }

  return (
    <div className={`${styles.info} ${isCurrentTurn ? styles.active : ''} ${isMe ? styles.me : ''}`}>
      <div className={styles.name}>{player.name}{isMe ? ' (you)' : ''}</div>
      <div className={styles.stats}>
        {bid !== null && bid !== undefined && (
          <span className={styles.stat}>Bid: {bid === 0 ? 'Nil' : bid}</span>
        )}
        <span className={styles.stat}>Won: {tricksWon ?? 0}</span>
        {cardCount !== undefined && (
          <span className={styles.stat}>Cards: {cardCount}</span>
        )}
      </div>
      {!player.connected && <div className={styles.disconnected}>Disconnected</div>}
    </div>
  )
}
