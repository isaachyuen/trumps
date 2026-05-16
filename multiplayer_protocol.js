(function attachProtocol(root) {
  const SEATS = ['S', 'W', 'N', 'E'];

  const CLIENT_EVENTS = {
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    CHOOSE_SEAT: 'choose_seat',
    LEAVE_ROOM: 'leave_room',
    START_MATCH: 'start_match',
    SUBMIT_BID: 'submit_bid',
    CHOOSE_TRUMP: 'choose_trump',
    DISCARD_KITTY: 'discard_kitty',
    PLAY_CARD: 'play_card',
    SYNC_STATE: 'sync_state',
    PLAYER_ACTION: 'player_action',
  };

  const SERVER_EVENTS = {
    CONNECTED: 'connected',
    ROOM_STATE: 'room_state',
    GAME_STATE: 'game_state',
    PRIVATE_HAND: 'private_hand',
    PLAYER_ACTION: 'player_action',
    INVALID_ACTION: 'invalid_action',
    ERROR: 'error',
  };

  function normalizeRoomCode(code) {
    return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function makeRoomCode(random = Math.random) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(random() * alphabet.length)];
    return code;
  }

  function isSeat(value) {
    return SEATS.includes(value);
  }

  const protocol = {
    version: 1,
    seats: SEATS,
    clientEvents: CLIENT_EVENTS,
    serverEvents: SERVER_EVENTS,
    normalizeRoomCode,
    makeRoomCode,
    isSeat,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = protocol;
  root.TrumpsMultiplayerProtocol = protocol;
})(typeof window !== 'undefined' ? window : globalThis);
