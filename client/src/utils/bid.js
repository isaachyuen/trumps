export function formatBid(bid) {
  if (bid === null || bid === undefined) return '—'
  if (bid === 'pass') return 'Pass'
  return `${bid.value}-${bid.type === 'low' ? 'Low' : 'High'}`
}

export function bidOrder(bid) {
  if (!bid || bid === 'pass') return -1
  return bid.value * 2 + (bid.type === 'low' ? 1 : 0)
}
