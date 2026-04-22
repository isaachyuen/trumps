import React from 'react'
import Card from '../cards/Card'
import styles from './TrickArea.module.css'

// Maps seat to position on the trick display
const POSITION = { N: 'top', S: 'bottom', E: 'right', W: 'left' }

export default function TrickArea({ currentTrick, mySeat }) {
  // Remap positions so "my" seat appears at bottom
  const seatMap = getSeatMap(mySeat)

  return (
    <div className={styles.area}>
      {currentTrick.map(({ seat, card }) => {
        const pos = POSITION[seatMap[seat]]
        return (
          <div key={seat} className={`${styles.slot} ${styles[pos]}`}>
            <Card card={card} small />
          </div>
        )
      })}
    </div>
  )
}

// Return a mapping of actual seats → display positions (N/S/E/W)
// so that mySeat appears at S (bottom)
function getSeatMap(mySeat) {
  const order = ['N', 'E', 'S', 'W']
  const myIdx = order.indexOf(mySeat)
  const map = {}
  order.forEach((seat, i) => {
    // Shift so mySeat lands at S (index 2)
    const displayIdx = (i - myIdx + 2 + 4) % 4
    map[seat] = order[displayIdx]
  })
  return map
}
