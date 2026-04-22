const rm = require('./roomManager')
const engine = require('./gameEngine')
const { drawHighCard } = require('./deck')
const { seatTeam } = require('./utils')

function registerHandlers(io) {
  io.on('connection', socket => {
    socket.on('createRoom', ({ playerName }, cb) => {
      try {
        const room = rm.createRoom(socket.id, playerName)
        socket.join(room.roomCode)
        cb({ roomCode: room.roomCode, playerId: socket.id, isHost: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('joinRoom', ({ roomCode, playerName }, cb) => {
      try {
        const { room, reconnected, seat } = rm.joinRoom(socket.id, roomCode, playerName)
        socket.join(roomCode)
        if (reconnected) {
          cb({ roomCode, playerId: socket.id, roomState: rm.publicRoom(room), reconnected: true })
          if (room.game) {
            socket.emit('gameStarted', {
              gameState: rm.publicRoom(room).game,
              yourHand: room.game.hands[seat],
              yourSeat: seat
            })
          }
          socket.to(roomCode).emit('playerReconnected', { seat, name: playerName })
        } else {
          cb({ roomCode, playerId: socket.id, roomState: rm.publicRoom(room), reconnected: false })
          io.to(roomCode).emit('roomUpdated', { roomState: rm.publicRoom(room) })
        }
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('chooseSeat', ({ roomCode, seat }, cb) => {
      try {
        const room = rm.chooseSeat(socket.id, roomCode, seat)
        io.to(roomCode).emit('roomUpdated', { roomState: rm.publicRoom(room) })
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('setOptions', ({ roomCode, handsPerGame, betPerGame }, cb) => {
      try {
        const room = rm.getRoom(roomCode)
        if (!room) throw new Error('Room not found')
        if (room.host !== socket.id) throw new Error('Only host can set options')
        room.gameOptions = {
          handsPerGame: Math.max(1, Math.min(20, parseInt(handsPerGame) || 5)),
          betPerGame: Math.max(0, parseFloat(betPerGame) || 0)
        }
        io.to(roomCode).emit('roomUpdated', { roomState: rm.publicRoom(room) })
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('startGame', ({ roomCode }, cb) => {
      try {
        const room = rm.getRoom(roomCode)
        if (!room) throw new Error('Room not found')
        if (room.host !== socket.id) throw new Error('Only host can start')
        if (!rm.allSeatsReady(room)) throw new Error('All 4 seats must be filled')
        startWithHighCardDraw(io, room)
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('confirmContinue', ({ roomCode, handsPerGame, betPerGame }, cb) => {
      try {
        const room = rm.getRoom(roomCode)
        if (!room) throw new Error('Room not found')
        if (room.host !== socket.id) throw new Error('Only host can continue')
        room.gameOptions = {
          handsPerGame: Math.max(1, Math.min(20, parseInt(handsPerGame) || room.gameOptions.handsPerGame)),
          betPerGame: Math.max(0, parseFloat(betPerGame) || 0)
        }
        room.wins = { NS: 0, EW: 0 }
        room.handsPlayed = 0
        room.lastDealerByTeam = { NS: null, EW: null }
        startWithHighCardDraw(io, room)
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('placeBid', ({ roomCode, bid }, cb) => {
      try {
        const room = rm.getRoom(roomCode)
        if (!room) throw new Error('Room not found')
        const player = room.players.find(p => p.socketId === socket.id)
        if (!player) throw new Error('Not in room')
        const result = engine.placeBid(room.game, player.seat, bid)
        io.to(roomCode).emit('bidPlaced', {
          seat: player.seat, bid,
          highestBid: room.game.highestBid,
          highestBidder: room.game.highestBidder,
          nextBidder: result.biddingComplete ? null : result.nextBidder
        })
        if (result.biddingComplete) {
          io.to(roomCode).emit('biddingComplete', {
            winner: result.winner, bid: result.bid, bids: room.game.bids
          })
          const winnerPlayer = room.players.find(p => p.seat === result.winner)
          if (winnerPlayer) {
            const ws = io.sockets.sockets.get(winnerPlayer.socketId)
            if (ws) ws.emit('kittyDealt', { kitty: room.game.kitty })
          }
        }
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('selectTrump', ({ roomCode, suit, discards }, cb) => {
      try {
        const room = rm.getRoom(roomCode)
        if (!room) throw new Error('Room not found')
        const player = room.players.find(p => p.socketId === socket.id)
        if (!player) throw new Error('Not in room')
        engine.selectTrump(room.game, player.seat, suit, discards)
        io.to(roomCode).emit('trumpSelected', {
          suit, firstLead: room.game.currentTurn,
          gameState: rm.publicRoom(room).game
        })
        socket.emit('handUpdated', { hand: room.game.hands[player.seat] })
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('playCard', ({ roomCode, card }, cb) => {
      try {
        const room = rm.getRoom(roomCode)
        if (!room) throw new Error('Room not found')
        const player = room.players.find(p => p.socketId === socket.id)
        if (!player) throw new Error('Not in room')
        const result = engine.playCard(room.game, player.seat, card)
        io.to(roomCode).emit('cardPlayed', {
          seat: player.seat, card,
          currentTrick: room.game.currentTrick,
          nextTurn: result.trickComplete ? null : room.game.currentTurn
        })
        if (result.trickComplete) {
          io.to(roomCode).emit('trickComplete', {
            winner: result.winner, winningCard: result.winningCard,
            tricksWon: room.game.tricksWon, nextLeader: room.game.trickLeader
          })
          if (result.roundOver) {
            const { summary, wins } = engine.scoreRound(room.game, room)
            room.handsPlayed++
            const { handsPerGame, betPerGame } = room.gameOptions
            const gameComplete = room.handsPlayed >= handsPerGame

            io.to(roomCode).emit('roundComplete', {
              summary, wins,
              handsPlayed: room.handsPlayed,
              handsPerGame
            })

            if (gameComplete) {
              let gameWinner = null
              if (wins.NS > wins.EW) gameWinner = 'NS'
              else if (wins.EW > wins.NS) gameWinner = 'EW'
              if (gameWinner === 'NS') room.balance += betPerGame
              else if (gameWinner === 'EW') room.balance -= betPerGame

              io.to(roomCode).emit('gameComplete', {
                gameWins: { ...wins }, gameWinner,
                betAmount: betPerGame,
                balance: room.balance,
                options: room.gameOptions
              })
            } else {
              // Next dealer: alternate within losing team
              const losingTeam = summary.winner === 'NS' ? 'EW' : 'NS'
              const nextDealer = getNextDealer(room, losingTeam)
              room.lastDealerByTeam[losingTeam] = nextDealer

              setTimeout(() => {
                engine.startGame(room, nextDealer)
                emitGameStarted(io, room)
              }, 5000)
            }
          }
        }
        cb({ ok: true })
      } catch (e) {
        cb({ error: e.message })
      }
    })

    socket.on('leaveRoom', () => handleDisconnect(socket, io))
    socket.on('disconnect', () => handleDisconnect(socket, io))
  })
}

function getNextDealer(room, team) {
  const seats = team === 'NS' ? ['N', 'S'] : ['E', 'W']
  const last = room.lastDealerByTeam[team]
  if (!last) return seats[0]
  return seats[(seats.indexOf(last) + 1) % 2]
}

function startWithHighCardDraw(io, room) {
  const draw = drawHighCard()
  io.to(room.roomCode).emit('highCardDraw', { draws: draw.draws, winner: draw.winner })
  // Track draw winner as first dealer for their team
  const team = seatTeam(draw.winner)
  room.lastDealerByTeam[team] = draw.winner
  setTimeout(() => {
    engine.startGame(room, draw.winner)
    emitGameStarted(io, room)
  }, 3000)
}

function emitGameStarted(io, room) {
  for (const p of room.players) {
    const ps = io.sockets.sockets.get(p.socketId)
    if (ps) {
      ps.emit('gameStarted', {
        gameState: rm.publicRoom(room).game,
        yourHand: room.game.hands[p.seat],
        yourSeat: p.seat
      })
    }
  }
}

function handleDisconnect(socket, io) {
  const result = rm.removePlayer(socket.id)
  if (!result) return
  const { room, player } = result
  if (room.status === 'lobby') {
    io.to(room.roomCode).emit('roomUpdated', { roomState: rm.publicRoom(room) })
  } else {
    io.to(room.roomCode).emit('playerDisconnected', { seat: player.seat, name: player.name })
  }
}

module.exports = { registerHandlers }
