{
// Start screen and multiplayer lobby UI.
const { useState: useLobbyState } = React;
const useState = useLobbyState;

function cleanPlayerName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return clean || randomPlayerName();
}

function randomPlayerName() {
  const names = [
    'Ace Morgan',
    'Billie Clubs',
    'Casey High',
    'Drew Spades',
    'Frankie Tricks',
    'Harper Hearts',
    'Jamie Trump',
    'Quinn Diamonds',
  ];
  return names[Math.floor(Math.random() * names.length)];
}

function StartScreen({ onStartLocal, onHostGame, onJoinGame, multiplayerError, multiplayerStatus }) {
  const [name, setName] = useState(() => window.localStorage.getItem('trumps_player_name') || randomPlayerName());
  const [roomCode, setRoomCode] = useState('');
  const canJoin = roomCode.trim().length > 0;

  const useRandomName = () => {
    const nextName = randomPlayerName();
    setName(nextName);
    window.localStorage.setItem('trumps_player_name', nextName);
  };

  const rememberName = () => {
    const cleanName = cleanPlayerName(name);
    setName(cleanName);
    window.localStorage.setItem('trumps_player_name', cleanName);
    return cleanName;
  };

  const submitJoin = () => {
    if (!canJoin) return;
    onJoinGame(roomCode, rememberName());
  };

  return (
    <main className="start-screen">
      <section className="start-panel" aria-labelledby="start-title">
        <div className="start-copy">
          <div className="start-brand">
            <div className="brand-mark">♠</div>
            <span>Trumps</span>
          </div>
          <h1 id="start-title">Choose a table</h1>
          <p>Start a solo match against computer opponents, or host a room so other players can join with a code.</p>
          <div className="start-name">
            <label htmlFor="start-player-name">Player name</label>
            <div className="start-name-row">
              <input
                id="start-player-name"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={rememberName}
                maxLength="24"
                placeholder="Your name"
                aria-label="Player name"
              />
              <button className="start-random-btn" type="button" onClick={useRandomName}>
                Random
              </button>
            </div>
          </div>
          <div className="start-actions">
            <button className="start-choice" type="button" onClick={() => onStartLocal(rememberName())}>
              <span>Play Local</span>
              <small>Computer opponents</small>
            </button>
            <button className="start-choice" type="button" onClick={() => onHostGame(rememberName())}>
              <span>Host Game</span>
              <small>{multiplayerStatus === 'connecting' ? 'Opening room...' : 'Share a room code'}</small>
            </button>
          </div>
          <div className="start-join">
            <label htmlFor="start-room-code">Join a game</label>
            <div className="start-join-row">
              <input
                id="start-room-code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') submitJoin(); }}
                placeholder="Room code"
                aria-label="Room code"
              />
              <button className="start-join-btn" type="button" onClick={submitJoin} disabled={!canJoin}>
                Join
              </button>
            </div>
          </div>
          {multiplayerError && <div className="start-error">{multiplayerError}</div>}
        </div>
        <div className="start-table" aria-hidden="true">
          <div className="start-felt" />
        </div>
      </section>
    </main>
  );
}

function LobbyScreen({ room, seat, isHost, error, onChooseSeat, onStart }) {
  const roomCode = room?.code || '...';
  const needsSeat = !seat;
  const hasWaitingPlayers = Boolean(room?.waiting?.length);
  const lobbySeatPositions = [
    { seat: 'N', pos: 'top' },
    { seat: 'E', pos: 'right' },
    { seat: 'S', pos: 'bottom' },
    { seat: 'W', pos: 'left' },
  ];
  const seatLabel = (nextSeat) => room?.seats?.[nextSeat]?.name || nextSeat;

  return (
    <main className="start-screen">
      <section className="start-panel lobby-panel" aria-live="polite">
        <div className="start-copy">
          <div className="start-brand">
            <div className="brand-mark">♠</div>
            <span>Trumps</span>
          </div>
          <h1>{isHost ? 'Host lobby' : 'Table lobby'}</h1>
          <p>{isHost ? 'Share the room code, wait for players to choose seats, then start the match.' : needsSeat ? 'Choose an open seat at the table. The host will start the match.' : 'Seat selected. The host will start the match.'}</p>
          <div className="lobby-code">
            <span>Room code</span>
            <b>{roomCode}</b>
          </div>
          <div className="lobby-seats">
            {SEATS.map(nextSeat => {
              const player = room?.seats?.[nextSeat];
              return (
                <div key={nextSeat} className={`lobby-seat ${seat === nextSeat ? 'mine' : ''} ${player ? 'taken' : ''}`}>
                  <span>{nextSeat}</span>
                  <b>{player?.name || 'Open'}</b>
                  {room?.hostSeat === nextSeat && <em>Host</em>}
                </div>
              );
            })}
          </div>
          {!isHost && room?.waiting?.length > 0 && (
            <div className="lobby-waiting">
              Waiting: {room.waiting.map(player => player.name).join(', ')}
            </div>
          )}
          {isHost ? (
            <button className="start-choice primary lobby-start" type="button" onClick={onStart} disabled={!room || !seat || hasWaitingPlayers}>
              <span>Start Match</span>
              <small>{!seat ? 'Choose your seat' : hasWaitingPlayers ? 'Waiting for seats' : 'Deal the shared game'}</small>
            </button>
          ) : (
            <div className="lobby-wait">Waiting for host to start</div>
          )}
          {error && <div className="start-error">{error}</div>}
        </div>
        <div className="start-table">
          <div className="start-felt">
            {lobbySeatPositions.map(({ seat: nextSeat, pos }) => {
              const taken = Boolean(room?.seats?.[nextSeat]);
              return (
                <button
                  key={nextSeat}
                  type="button"
                  className={`start-seat lobby-table-seat ${pos} ${taken ? 'taken' : ''} ${seat === nextSeat ? 'mine' : ''}`}
                  disabled={!room || taken}
                  onClick={() => onChooseSeat(nextSeat)}
                  aria-label={taken ? `${seatLabel(nextSeat)} seated ${nextSeat}` : `Choose seat ${nextSeat}`}
                >
                  {seatLabel(nextSeat)}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}


Object.assign(window, { cleanPlayerName, randomPlayerName, StartScreen, LobbyScreen });

}
