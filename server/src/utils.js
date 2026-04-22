const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const SEAT_ORDER = ['N', 'E', 'S', 'W']

function generateRoomCode(rooms) {
  let code
  do {
    code = Array.from({ length: 4 }, () =>
      ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
    ).join('')
  } while (rooms.has(code))
  return code
}

function nextSeat(seat) {
  const i = SEAT_ORDER.indexOf(seat)
  return SEAT_ORDER[(i + 1) % 4]
}

function seatTeam(seat) {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW'
}

function teamSeats(team) {
  return team === 'NS' ? ['N', 'S'] : ['E', 'W']
}

module.exports = { generateRoomCode, nextSeat, seatTeam, teamSeats, SEAT_ORDER }
