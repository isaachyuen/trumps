function useMultiplayerSession() {
  const protocol = window.TrumpsMultiplayerProtocol;
  const [status, setStatus] = React.useState('offline');
  const [room, setRoom] = React.useState(null);
  const [seat, setSeat] = React.useState(null);
  const [isHost, setIsHost] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [gameState, setGameState] = React.useState(null);
  const [revision, setRevision] = React.useState(0);
  const socketRef = React.useRef(null);
  const revisionRef = React.useRef(0);

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
    socket.addEventListener('close', () => {
      setStatus('offline');
      setIsHost(false);
    });
    socket.addEventListener('error', () => {
      setError('Multiplayer server unavailable');
      setStatus('offline');
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === protocol.serverEvents.ROOM_STATE) {
        setRoom(message.room);
        setSeat(message.seat);
        setIsHost(Boolean(message.isHost));
        if (message.token) window.localStorage.setItem('trumps_player_token', message.token);
      } else if (message.type === protocol.serverEvents.GAME_STATE) {
        setGameState(message.state);
        setRevision(message.revision || 0);
        revisionRef.current = message.revision || 0;
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

  const createRoom = React.useCallback((playerName = 'Host') => {
    send({
      type: protocol.clientEvents.CREATE_ROOM,
      seat: 'S',
      waitForSeat: true,
      name: playerName,
      token: window.localStorage.getItem('trumps_player_token'),
    });
  }, [protocol, send]);

  const joinRoom = React.useCallback((roomCode, playerName = 'Guest', seat = '', waitForSeat = false) => {
    const code = protocol.normalizeRoomCode(roomCode);
    if (!code) return;
    send({
      type: protocol.clientEvents.JOIN_ROOM,
      roomCode: code,
      seat,
      waitForSeat,
      name: playerName,
      token: window.localStorage.getItem('trumps_player_token'),
    });
  }, [protocol, send]);

  const chooseSeat = React.useCallback((seat) => {
    send({
      type: protocol.clientEvents.CHOOSE_SEAT,
      seat,
    });
  }, [protocol, send]);

  const sendGameCommand = React.useCallback((type, payload = {}) => {
    const actionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    send({
      type,
      actionId,
      expectedRevision: revisionRef.current,
      ...payload,
    });
  }, [send]);

  const startMatch = React.useCallback((matchHands = 3) => {
    sendGameCommand(protocol.clientEvents.START_MATCH, { matchHands });
  }, [protocol, sendGameCommand]);

  const submitBid = React.useCallback((bid) => {
    sendGameCommand(protocol.clientEvents.SUBMIT_BID, { bid });
  }, [protocol, sendGameCommand]);

  const chooseTrump = React.useCallback((suit) => {
    sendGameCommand(protocol.clientEvents.CHOOSE_TRUMP, { suit });
  }, [protocol, sendGameCommand]);

  const discardKitty = React.useCallback((discards) => {
    sendGameCommand(protocol.clientEvents.DISCARD_KITTY, { discards });
  }, [protocol, sendGameCommand]);

  const playCard = React.useCallback((cardId) => {
    sendGameCommand(protocol.clientEvents.PLAY_CARD, { cardId });
  }, [protocol, sendGameCommand]);

  return {
    status, room, seat, isHost, error, gameState, revision,
    createRoom, joinRoom, chooseSeat, startMatch, submitBid, chooseTrump, discardKitty, playCard,
  };
}

Object.assign(window, { useMultiplayerSession });
