function useMultiplayerSession() {
  const protocol = window.TrumpsMultiplayerProtocol;
  const [status, setStatus] = React.useState('offline');
  const [room, setRoom] = React.useState(null);
  const [seat, setSeat] = React.useState(null);
  const [error, setError] = React.useState(null);
  const socketRef = React.useRef(null);

  const connect = React.useCallback(() => {
    if (!protocol || socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      return socketRef.current;
    }

    setError(null);
    setStatus('connecting');
    const host = window.location.host || 'localhost:8001';
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`);
    socketRef.current = socket;

    socket.addEventListener('open', () => setStatus('connected'));
    socket.addEventListener('close', () => setStatus('offline'));
    socket.addEventListener('error', () => {
      setError('Multiplayer server unavailable');
      setStatus('offline');
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === protocol.serverEvents.ROOM_STATE) {
        setRoom(message.room);
        setSeat(message.seat);
        if (message.token) window.localStorage.setItem('trumps_player_token', message.token);
      } else if (message.type === protocol.serverEvents.ERROR || message.type === protocol.serverEvents.INVALID_ACTION) {
        setError(message.message);
      }
    });

    return socket;
  }, [protocol]);

  const send = React.useCallback((message) => {
    const socket = connect();
    const transmit = () => socket.send(JSON.stringify(message));
    if (socket.readyState === WebSocket.OPEN) transmit();
    else socket.addEventListener('open', transmit, { once: true });
  }, [connect]);

  const createRoom = React.useCallback(() => {
    send({
      type: protocol.clientEvents.CREATE_ROOM,
      seat: 'S',
      name: 'Host',
      token: window.localStorage.getItem('trumps_player_token'),
    });
  }, [protocol, send]);

  const joinRoom = React.useCallback((roomCode) => {
    const code = protocol.normalizeRoomCode(roomCode);
    if (!code) return;
    send({
      type: protocol.clientEvents.JOIN_ROOM,
      roomCode: code,
      name: 'Guest',
      token: window.localStorage.getItem('trumps_player_token'),
    });
  }, [protocol, send]);

  return { status, room, seat, error, createRoom, joinRoom };
}
