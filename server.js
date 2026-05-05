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
    createdAt: room.createdAt,
  };
}

function broadcastRoom(room) {
  for (const player of Object.values(room.seats)) {
    if (player?.socket) send(player.socket, protocol.serverEvents.ROOM_STATE, { room: publicRoom(room), seat: player.seat, token: player.token });
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
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
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
    broadcastRoom(room);
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
  if (!room.hostSeat) room.hostSeat = seat;
  ws.player = player;
  ws.room = room;
  broadcastRoom(room);
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
