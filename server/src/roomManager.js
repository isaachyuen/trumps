const { generateRoomCode } = require('./utils')

const rooms = new Map()

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [code, room] of rooms) {
    if (room.lastActivity < cutoff) rooms.delete(code)
  }
}, 10 * 60 * 1000)

function createRoom(socketId, playerName) {
  const roomCode = generateRoomCode(rooms)
  const room = {
    roomCode,
    status: 'lobby',
    host: socketId,
    players: [{ socketId, name: playerName, seat: null, connected: true }],
    game: null,
    wins: { NS: 0, EW: 0 },
    gameOptions: { handsPerGame: 5, betPerGame: 0 },
    handsPlayed: 0,
    balance: 0,
    lastDealerByTeam: { NS: null, EW: null },
    lastActivity: Date.now()
  }
  rooms.set(roomCode, room)
  return room
}

function joinRoom(socketId, roomCode, playerName) {
  const room = rooms.get(roomCode)
  if (!room) throw new Error('Room not found')
  if (room.status !== 'lobby') {
    const existing = room.players.find(p => p.name === playerName && !p.connected)
    if (existing) {
      existing.socketId = socketId
      existing.connected = true
      room.lastActivity = Date.now()
      return { room, reconnected: true, seat: existing.seat }
    }
    throw new Error('Game already in progress')
  }
  if (room.players.length >= 4) throw new Error('Room is full')
  if (room.players.find(p => p.name === playerName)) throw new Error('Name already taken')

  room.players.push({ socketId, name: playerName, seat: null, connected: true })
  room.lastActivity = Date.now()
  return { room, reconnected: false }
}

function chooseSeat(socketId, roomCode, seat) {
  const room = rooms.get(roomCode)
  if (!room) throw new Error('Room not found')
  const taken = room.players.find(p => p.seat === seat && p.socketId !== socketId)
  if (taken) throw new Error('Seat already taken')

  const player = room.players.find(p => p.socketId === socketId)
  if (!player) throw new Error('Player not in room')

  player.seat = seat
  room.lastActivity = Date.now()
  return room
}

function getRoom(roomCode) {
  return rooms.get(roomCode)
}

function getRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.find(p => p.socketId === socketId)) return room
  }
  return null
}

function removePlayer(socketId) {
  const room = getRoomBySocketId(socketId)
  if (!room) return null

  const player = room.players.find(p => p.socketId === socketId)
  if (!player) return null

  if (room.status === 'lobby') {
    room.players = room.players.filter(p => p.socketId !== socketId)
    if (room.host === socketId && room.players.length > 0) {
      room.host = room.players[0].socketId
    }
    if (room.players.length === 0) rooms.delete(room.roomCode)
  } else {
    player.connected = false
  }

  room.lastActivity = Date.now()
  return { room, player }
}

function allSeatsReady(room) {
  const seated = room.players.filter(p => p.seat !== null)
  const seats = new Set(seated.map(p => p.seat))
  return seated.length === 4 && seats.size === 4
}

function publicRoom(room) {
  return {
    roomCode: room.roomCode,
    status: room.status,
    host: room.host,
    wins: room.wins,
    gameOptions: room.gameOptions,
    handsPlayed: room.handsPlayed,
    balance: room.balance,
    players: room.players.map(({ socketId, name, seat, connected }) => ({
      socketId, name, seat, connected
    })),
    game: room.game ? publicGame(room.game) : null
  }
}

function publicGame(game) {
  return {
    currentTurn: game.currentTurn,
    trumpSuit: game.trumpSuit,
    bidType: game.bidType,
    highestBid: game.highestBid,
    highestBidder: game.highestBidder,
    bids: game.bids,
    tricksWon: game.tricksWon,
    currentTrick: game.currentTrick,
    roundNumber: game.roundNumber,
    history: game.history
  }
}

module.exports = {
  createRoom, joinRoom, chooseSeat, getRoom, getRoomBySocketId,
  removePlayer, allSeatsReady, publicRoom
}
