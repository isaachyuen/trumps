const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const protocol = require('./multiplayer_protocol');

const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || '0.0.0.0';
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

function publicRoom(room) {
  return {
    code: room.code,
    hostSeat: room.hostSeat,
    seats: Object.fromEntries(protocol.seats.map(seat => {
      const player = room.seats[seat];
      return [seat, player ? { occupied: true, name: player.name, connected: player.connected } : null];
    })),
    waiting: room.waiting.map(player => ({ name: player.name, connected: player.connected })),
    createdAt: room.createdAt,
  };
}

function broadcastRoom(room) {
  for (const player of [...Object.values(room.seats), ...room.waiting]) {
    if (player?.socket) send(player.socket, protocol.serverEvents.ROOM_STATE, { room: publicRoom(room), seat: player.seat, token: player.token });
  }
}

function broadcastGameState(room) {
  if (!room.gameState) return;
  for (const player of [...Object.values(room.seats), ...room.waiting]) {
    if (player?.socket) {
      send(player.socket, protocol.serverEvents.GAME_STATE, {
        state: room.gameState,
        updatedAt: room.updatedAt,
      });
    }
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
    updatedAt: null,
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

function joinRoom(ws, room, payload) {
  const reconnectToken = String(payload.token || '');
  const reconnect = protocol.seats
    .map(seat => room.seats[seat])
    .find(player => player?.token === reconnectToken);

  if (reconnect) {
    reconnect.socket = ws;
    reconnect.connected = true;
    ws.player = reconnect;
    ws.room = room;
    broadcastRoom(room);
    return;
  }

  if (payload.waitForSeat) {
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
    broadcastRoom(room);
    broadcastGameState(room);
    return;
  }

  if (protocol.isSeat(payload.seat) && room.seats[payload.seat]) {
    send(ws, protocol.serverEvents.ERROR, { message: 'Seat is already taken.' });
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
    token: cryptoToken(),
    socket: ws,
    connected: true,
  };
  room.seats[seat] = player;
  if (room.hostToken === player.token) room.hostSeat = seat;
  ws.player = player;
  ws.room = room;
  broadcastRoom(room);
  broadcastGameState(room);
}

function chooseSeat(ws, payload) {
  const room = ws.room;
  const player = ws.player;
  const seat = payload.seat;
  if (!room || !player) {
    send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Join a room before choosing a seat.' });
    return;
  }
  if (!protocol.isSeat(seat)) {
    send(ws, protocol.serverEvents.ERROR, { message: 'Choose a valid seat.' });
    return;
  }
  if (room.seats[seat] && room.seats[seat] !== player) {
    send(ws, protocol.serverEvents.ERROR, { message: 'Seat is already taken.' });
    return;
  }
  if (player.seat && room.seats[player.seat] === player) room.seats[player.seat] = null;
  removeWaiting(room, player);
  player.seat = seat;
  player.waiting = false;
  room.seats[seat] = player;
  if (room.hostToken === player.token) room.hostSeat = seat;
  broadcastRoom(room);
  broadcastGameState(room);
}

function cryptoToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
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
    const code = protocol.normalizeRoomCode(message.roomCode);
    const room = rooms.get(code);
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

  if (message.type === protocol.clientEvents.SYNC_STATE) {
    const room = ws.room;
    const player = ws.player;
    if (!room || !player || player.token !== room.hostToken) {
      send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Only the host can sync game state.' });
      return;
    }
    room.gameState = message.state || null;
    room.updatedAt = Date.now();
    broadcastGameState(room);
    return;
  }

  if (message.type === protocol.clientEvents.PLAYER_ACTION) {
    const room = ws.room;
    const player = ws.player;
    if (!room || !player) {
      send(ws, protocol.serverEvents.INVALID_ACTION, { message: 'Join a room before sending game actions.' });
      return;
    }
    const host = room.seats[room.hostSeat];
    if (!host?.socket) {
      send(ws, protocol.serverEvents.ERROR, { message: 'Host is not connected.' });
      return;
    }
    send(host.socket, protocol.serverEvents.PLAYER_ACTION, {
      seat: player.seat,
      action: message.action,
    });
    return;
  }

  send(ws, protocol.serverEvents.INVALID_ACTION, {
    message: `${message.type || 'Unknown action'} is not wired to game state yet.`,
  });
}

function handleClose(ws) {
  const player = ws.player;
  const room = ws.room;
  if (!player || !room) return;
  player.connected = false;
  player.socket = null;
  if (!player.seat) removeWaiting(room, player);
  broadcastRoom(room);
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

  fs.readFile(filePath, (err, data) => {
    if (err) {
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
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(err);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`Trumps server listening on http://localhost:${port}`);
  });
}

listen(PORT);
