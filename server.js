const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const protocol = require('./multiplayer_protocol');
const gameEngine = require('./shared/game_engine');

const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || '0.0.0.0';
const TIMER_SCALE = Math.max(0, Number(process.env.TRUMPS_TIMER_SCALE || 1));
const configuredRoomTtl = Number(process.env.TRUMPS_ABANDONED_ROOM_TTL_MS);
const ABANDONED_ROOM_TTL_MS = Number.isFinite(configuredRoomTtl)
  ? Math.max(1000, configuredRoomTtl)
  : 30 * 60 * 1000;
const ROOT = __dirname;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const rooms = new Map();

function send(ws, type, payload = {}) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, ...payload }));
}

function roomPlayers(room) {
  return [...Object.values(room.seats), ...room.waiting].filter(Boolean);
}

function connectedPlayers(room) {
  return roomPlayers(room).filter(player => player.connected && player.socket);
}

function nextHost(room) {
  for (const seat of protocol.seats) {
    const player = room.seats[seat];
    if (player?.connected && player.socket) return player;
  }
  return room.waiting.find(player => player.connected && player.socket) || null;
}

function transferHost(room) {
  const host = nextHost(room);
  room.hostToken = host?.token || null;
  room.hostSeat = host?.seat || null;
  return host;
}

function ensureHost(room) {
  const currentHost = roomPlayers(room).find(player =>
    player.token === room.hostToken && player.connected && player.socket);
  return currentHost || transferHost(room);
}

function cancelRoomCleanup(room) {
  if (!room.cleanupTimer) return;
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
  room.abandonedAt = null;
}

function destroyRoom(room) {
  if (rooms.get(room.code) !== room) return;
  if (room.timer) clearTimeout(room.timer);
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.timer = null;
  room.cleanupTimer = null;
  rooms.delete(room.code);
}

function scheduleRoomCleanup(room) {
  if (connectedPlayers(room).length > 0) {
    cancelRoomCleanup(room);
    return;
  }
  if (room.cleanupTimer) return;
  room.abandonedAt = Date.now();
  room.cleanupTimer = setTimeout(() => {
    room.cleanupTimer = null;
    if (connectedPlayers(room).length > 0) {
      room.abandonedAt = null;
      return;
    }
    destroyRoom(room);
  }, ABANDONED_ROOM_TTL_MS);
}

function publicRoom(room) {
  return {
    code: room.code,
    hostSeat: room.hostSeat,
    matchActive: Boolean(room.gameState),
    seats: Object.fromEntries(protocol.seats.map(seat => {
      const player = room.seats[seat];
      return [seat, player ? { occupied: true, name: player.name, connected: player.connected } : null];
    })),
    waiting: room.waiting.map(player => ({ name: player.name, connected: player.connected })),
    createdAt: room.createdAt,
  };
}

function broadcastRoom(room) {
  for (const player of roomPlayers(room)) {
    if (player.socket) {
      send(player.socket, protocol.serverEvents.ROOM_STATE, {
        room: publicRoom(room),
        seat: player.seat,
        token: player.token,
        isHost: player.token === room.hostToken,
      });
    }
  }
}

function broadcastGameState(room, acceptedActionId = null) {
  if (!room.gameState) return;
  for (const player of roomPlayers(room)) {
    if (!player.socket) continue;
    send(player.socket, protocol.serverEvents.GAME_STATE, {
      state: gameEngine.projectState(room.gameState, player.seat),
      revision: room.revision,
      serverTime: Date.now(),
      turnDeadline: room.gameState.pendingTimer?.dueAt || null,
      acceptedActionId,
    });
  }
}

function createRoom() {
  let code;
  do {
    code = protocol.makeRoomCode();
  } while (rooms.has(code));
  const room = {
    code,
    seats: { S: null, W: null, N: null, E: null },
    hostSeat: null,
    hostToken: null,
    waiting: [],
    createdAt: Date.now(),
    gameState: null,
    revision: 0,
    timer: null,
    cleanupTimer: null,
    abandonedAt: null,
    actionIds: new Set(),
  };
  rooms.set(code, room);
  return room;
}

function removeWaiting(room, player) {
  room.waiting = room.waiting.filter(next => next !== player);
}

function firstOpenSeat(room, preferredSeat) {
  if (protocol.isSeat(preferredSeat) && !room.seats[preferredSeat]) return preferredSeat;
  return protocol.seats.find(seat => !room.seats[seat]) || null;
}

function cryptoToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function joinRoom(ws, room, payload) {
  const reconnectToken = String(payload.token || '');
  const reconnect = roomPlayers(room).find(player => player.token === reconnectToken);
  if (reconnect) {
    cancelRoomCleanup(room);
    reconnect.socket = ws;
    reconnect.connected = true;
    ws.player = reconnect;
    ws.room = room;
    ensureHost(room);
    broadcastRoom(room);
    if (room.gameState) broadcastGameState(room);
    return;
  }

  if (payload.waitForSeat) {
    cancelRoomCleanup(room);
    const player = {
      seat: null,
      name: String(payload.name || 'Guest').slice(0, 24),
      token: reconnectToken || cryptoToken(),
      socket: ws,
      connected: true,
      waiting: true,
    };
    room.waiting.push(player);
    ws.player = player;
    ws.room = room;
    ensureHost(room);
    broadcastRoom(room);
    if (room.gameState) broadcastGameState(room);
    return;
  }

  const seat = firstOpenSeat(room, payload.seat);
  if (!seat) {
    send(ws, protocol.serverEvents.ERROR, { message: 'Room is full.' });
    return;
  }
  const player = {
    seat,
    name: String(payload.name || `Player ${seat}`).slice(0, 24),
    token: reconnectToken || cryptoToken(),
    socket: ws,
    connected: true,
  };
  cancelRoomCleanup(room);
  room.seats[seat] = player;
  ws.player = player;
  ws.room = room;
  ensureHost(room);
  broadcastRoom(room);
  if (room.gameState) broadcastGameState(room);
}

function chooseSeat(ws, payload) {
  const room = ws.room;
  const player = ws.player;
  const seat = payload.seat;
  if (!room || !player) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Join a room before choosing a seat.' });
    return;
  }
  if (room.gameState) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Seats are locked after the match starts.' });
    return;
  }
  if (!protocol.isSeat(seat)) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Choose a valid seat.' });
    return;
  }
  if (room.seats[seat] && room.seats[seat] !== player) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Seat is already taken.' });
    return;
  }
  if (player.seat && room.seats[player.seat] === player) room.seats[player.seat] = null;
  removeWaiting(room, player);
  player.seat = seat;
  player.waiting = false;
  room.seats[seat] = player;
  if (room.hostToken === player.token) room.hostSeat = seat;
  broadcastRoom(room);
}

function rememberAction(room, actionId) {
  if (!actionId) return;
  room.actionIds.add(actionId);
  if (room.actionIds.size > 500) room.actionIds.delete(room.actionIds.values().next().value);
}

function commitGameState(room, state, acceptedActionId = null) {
  room.gameState = state;
  room.revision += 1;
  rememberAction(room, acceptedActionId);
  broadcastRoom(room);
  broadcastGameState(room, acceptedActionId);
  scheduleRoom(room);
}

function scheduleRoom(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  const pending = room.gameState?.pendingTimer;
  if (!pending) return;
  const timerKey = `${pending.type}:${pending.dueAt}`;
  const delay = Math.max(0, pending.delay * TIMER_SCALE);
  room.timer = setTimeout(() => {
    room.timer = null;
    const current = room.gameState?.pendingTimer;
    if (!current || `${current.type}:${current.dueAt}` !== timerKey) return;
    const result = gameEngine.applyScheduled(room.gameState, { now: Date.now() });
    if (result.error) {
      console.error(`Room ${room.code} timer failed: ${result.error}`);
      return;
    }
    commitGameState(room, result.state);
  }, delay);
}

function startMatch(ws, message) {
  const room = ws.room;
  const player = ws.player;
  if (!room || !player || player.token !== room.hostToken) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Only the room host can start the match.', actionId: message.actionId });
    return;
  }
  if (!player.seat) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Choose a seat before starting.', actionId: message.actionId });
    return;
  }
  if (room.waiting.length) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'All waiting players must choose seats.', actionId: message.actionId });
    return;
  }
  if (room.gameState && room.gameState.phase !== 'matchEnd') {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'A match is already active.', actionId: message.actionId });
    return;
  }
  const humanSeats = protocol.seats.filter(seat => room.seats[seat]);
  const seatNames = Object.fromEntries(protocol.seats.map(seat => [
    seat,
    room.seats[seat]?.name || seat,
  ]));
  const state = gameEngine.createMatch({
    matchHands: Number(message.matchHands),
    humanSeats,
    seatNames,
    now: Date.now(),
  });
  commitGameState(room, state, message.actionId);
}

function handleGameCommand(ws, message) {
  const room = ws.room;
  const player = ws.player;
  if (!room || !player?.seat) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Join a seat before sending game actions.', actionId: message.actionId });
    return;
  }
  if (!room.gameState) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'No match is active.', actionId: message.actionId });
    return;
  }
  if (message.actionId && room.actionIds.has(message.actionId)) {
    send(ws, protocol.serverEvents.ACTION_ACCEPTED, { actionId: message.actionId, revision: room.revision, duplicate: true });
    return;
  }
  if (Number.isInteger(message.expectedRevision) && message.expectedRevision !== room.revision) {
    send(ws, protocol.serverEvents.INVALID_ACTION, {
      message: 'Game state changed. Retry from the latest state.',
      actionId: message.actionId,
      revision: room.revision,
    });
    broadcastGameState(room);
    return;
  }
  const command = {
    type: message.type,
    bid: message.bid,
    suit: message.suit,
    discards: message.discards,
    cardId: message.cardId,
  };
  const result = gameEngine.applyCommand(room.gameState, player.seat, command, { now: Date.now() });
  if (result.error) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: result.error, actionId: message.actionId, revision: room.revision });
    return;
  }
  const state = gameEngine.scheduleAutomation(result.state, Date.now());
  send(ws, protocol.serverEvents.ACTION_ACCEPTED, { actionId: message.actionId, revision: room.revision + 1 });
  commitGameState(room, state, message.actionId);
}

function handleMessage(ws, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    send(ws, protocol.serverEvents.ERROR, { message: 'Message must be valid JSON.' });
    return;
  }

  if (message.type === protocol.clientEvents.CREATE_ROOM) {
    const room = createRoom();
    ws.room = room;
    joinRoom(ws, room, message);
    if (ws.player) {
      room.hostToken = ws.player.token;
      room.hostSeat = ws.player.seat;
      broadcastRoom(room);
    }
    return;
  }
  if (message.type === protocol.clientEvents.JOIN_ROOM) {
    const room = rooms.get(protocol.normalizeRoomCode(message.roomCode));
    if (!room) {
      send(ws, protocol.serverEvents.ERROR, { message: 'Room not found.' });
      return;
    }
    ws.room = room;
    joinRoom(ws, room, message);
    return;
  }
  if (message.type === protocol.clientEvents.CHOOSE_SEAT) {
    chooseSeat(ws, message);
    return;
  }
  if (message.type === protocol.clientEvents.START_MATCH) {
    startMatch(ws, message);
    return;
  }
  if ([
    protocol.clientEvents.SUBMIT_BID,
    protocol.clientEvents.CHOOSE_TRUMP,
    protocol.clientEvents.DISCARD_KITTY,
    protocol.clientEvents.PLAY_CARD,
  ].includes(message.type)) {
    handleGameCommand(ws, message);
    return;
  }
  send(ws, protocol.serverEvents.INVALID_ACTION, { message: `Unknown action: ${message.type || 'missing type'}` });
}

function handleClose(ws) {
  const player = ws.player;
  const room = ws.room;
  if (!player || !room) return;
  player.connected = false;
  player.socket = null;
  if (!player.seat) removeWaiting(room, player);
  if (player.token === room.hostToken) transferHost(room);
  broadcastRoom(room);
  scheduleRoomCleanup(room);
}

function serveStatic(req, res) {
  const requested = req.url === '/' ? '/trumps_table.html' : req.url.split('?')[0];
  const decoded = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(ROOT, decoded));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  send(ws, protocol.serverEvents.CONNECTED, { protocolVersion: protocol.version });
  ws.on('message', raw => handleMessage(ws, raw));
  ws.on('close', () => handleClose(ws));
});

function listen(port, attemptsLeft = 10) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`Trumps server listening on http://localhost:${port}`);
  });
}

listen(PORT);
