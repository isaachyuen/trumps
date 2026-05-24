{
// Main table rendering and table-only widgets.
const { useState: useTableState, useEffect: useTableEffect } = React;
const useState = useTableState;
const useEffect = useTableEffect;

function TopBar({ round, phase, matchHands, handsWon, multiplayer, playMode, mySeat }) {
  const phaseLabel = phase === 'dealing' ? 'Dealing' : phase === 'bidding' ? 'Bidding' : phase === 'chooseTrump' ? 'Trump' : phase === 'reveal' ? 'Contract' : phase === 'play' ? 'In play' : phase === 'matchEnd' ? 'Match end' : 'Round end';
  const myTeam = TEAM[mySeat || 'S'];
  const oppTeam = opponentTeam(myTeam);
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">♠</div>
        <span>Trumps</span>
        <small>4 players</small>
      </div>
      <div className="topbar-meta">
        {playMode === 'host' ? (
          <OnlineRoomControl multiplayer={multiplayer} />
        ) : (
          <span className="local-room"><span className="pip offline" />Local bots</span>
        )}
        <span>Hand {round} • {phaseLabel}</span>
        <span>Best of {matchHands}: {handsWon[myTeam]}-{handsWon[oppTeam]}</span>
      </div>
    </div>
  );
}

function OnlineRoomControl({ multiplayer }) {
  const [roomCode, setRoomCode] = useState('');
  const room = multiplayer.room;
  const statusLabel = room ? `Room ${room.code}` : multiplayer.status === 'connected' ? 'Online' : 'Local';
  const seatLabel = multiplayer.seat ? `Seat ${multiplayer.seat}` : '';

  return (
    <div className="online-room">
      <span className={`pip ${multiplayer.status === 'offline' ? 'offline' : ''}`} />
      <span className="online-status">
        <b>{statusLabel}</b>
        {seatLabel && <em>{seatLabel}</em>}
      </span>
      {!room && (
        <>
          <button className="online-btn" type="button" onClick={multiplayer.createRoom}>Host</button>
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') multiplayer.joinRoom(roomCode); }}
            placeholder="Code"
            aria-label="Room code"
          />
          <button className="online-btn" type="button" onClick={() => multiplayer.joinRoom(roomCode)}>Join</button>
        </>
      )}
      {multiplayer.error && <span className="online-error">{multiplayer.error}</span>}
    </div>
  );
}

function CenterBadge({ phase, trump, contract, currentHigh }) {
  if (phase === 'dealing') {
    return (
      <div className="center-disc bidding">
        <div className="label">Dealer</div>
        <div className="cd-text">Dealing</div>
      </div>
    );
  }
  if (phase === 'bidding') {
    if (!currentHigh) {
      return (
        <div className="center-disc bidding">
          <div className="label">Auction</div>
          <div className="cd-text">Open</div>
        </div>
      );
    }
    return (
      <div className="center-disc bidding">
        <div className="label">High bid</div>
        <div className="cd-bid">
          <span className="cd-level">{currentHigh.level}</span>
          <span className="cd-mode">{currentHigh.mode === 'low' ? 'Low' : 'High'}</span>
        </div>
      </div>
    );
  }
  return null;
}

function Seat({ pos, name, initial, you, active, dealer, tricks, turnTime, lastBid, showBid }) {
  return (
    <div className={`seat seat-${pos} ${active ? 'active' : ''}`}>
      <div className={`avatar ${you ? 'you' : ''}`}>
        {initial}
        {dealer && <span className="dealer-chip" title="Dealer">D</span>}
        {active && <TimerRing start={turnTime} duration={TURN_TIME_MS} />}
      </div>
      <div className="player-name">
        <span>{name}</span>
        {showBid ? (
          <span className="bid-tag">{lastBid ? (lastBid.pass ? 'Pass' : `${lastBid.level}${lastBid.mode === 'low' ? 'L' : 'H'}`) : '—'}</span>
        ) : (
          <span className="tricks"><b>{tricks}</b>/13</span>
        )}
      </div>
    </div>
  );
}

function TimerRing({ start, duration }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf;
    const loop = () => {
      const elapsed = Math.min(duration, Date.now() - start);
      setT(elapsed / duration);
      if (elapsed < duration) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [start, duration]);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg className="timer-ring" viewBox="0 0 68 68">
      <circle cx="34" cy="34" r={r} stroke="oklch(0.78 0.13 85)"
              strokeDasharray={c} strokeDashoffset={c * t} />
    </svg>
  );
}

function OppHand({ pos, count, pattern }) {
  return (
    <div className={`opp-hand ${pos}`}>
      {Array.from({length: count}).map((_,i) => (
        <div key={i} className="opp-card"><CardBack pattern={pattern} /></div>
      ))}
    </div>
  );
}

function PlayerHand({ hand, legalIds, isMyTurn, onPlay, kittyMode, kittyDiscards = [], onToggleDiscard, kittyIds = [] }) {
  const total = hand.length;
  const cardWidth = 80;
  const fanStep = total <= 4 ? 28 : total <= 7 ? 32 : 36;
  const containerWidth = Math.min(700, cardWidth + Math.max(0, total - 1) * fanStep);
  const overlap = total > 1 ? (containerWidth - cardWidth) / (total - 1) : 0;

  return (
    <div className="player-hand" style={{ width: containerWidth }}>
      {hand.map((card, i) => {
        const center = (total - 1) / 2;
        const offset = i - center;
        const x = i * overlap;
        const fanProgress = center > 0 ? offset / center : 0;
        const edge = Math.abs(fanProgress);
        const arc = 1 - edge;
        const angle = 0;
        const lift = 0;
        const isLegal = legalIds.includes(card.id);
        const playable = isMyTurn && isLegal;
        const isFromKitty = kittyMode && kittyIds.includes(card.id);
        const isDiscarding = kittyMode && kittyDiscards.includes(card.id);
        const transform = `translateX(var(--fan-x)) translateY(calc(var(--fan-y) + var(--discard-lift))) rotate(var(--fan-angle))`;

        const handleClick = () => {
          if (kittyMode) onToggleDiscard?.(card.id);
          else onPlay(card);
        };

        return (
          <div
            key={card.id}
            className={`hand-card
              ${playable ? 'playable' : ''}
              ${isMyTurn && !isLegal ? 'disabled' : ''}
              ${kittyMode ? 'kitty-pickable' : ''}
              ${isDiscarding ? 'kitty-selected' : ''}
              ${isFromKitty ? 'kitty-fresh' : ''}`}
            style={{
              left: `calc(50% - ${containerWidth/2}px)`,
              zIndex: i,
              '--fan-x': `${x}px`,
              '--fan-y': `${lift}px`,
              '--fan-angle': `${angle}deg`,
              '--discard-lift': isDiscarding ? '-28px' : '0px',
              ['--rest-transform']: transform,
            }}
            onClick={handleClick}
          >
            <CardFace rank={card.rank} suit={card.suit} />
            {isFromKitty && <div className="kitty-fresh-badge">New</div>}
            {isDiscarding && <div className="kitty-discard-mark">✕</div>}
          </div>
        );
      })}
    </div>
  );
}

function KittyStack({ cards, faceUp, pattern, label }) {
  return (
    <div className={`kitty-stack ${faceUp ? 'face-up' : ''}`}>
      <div className="kitty-stack-label">{label}</div>
      <div className="kitty-stack-cards">
        {cards.map((c, i) => (
          <div
            key={c.id}
            className="kitty-stack-card"
            style={{
              transform: `translateX(${(i - 1.5) * 8}px) rotate(${(i - 1.5) * 2}deg)`,
              zIndex: i,
            }}
          >
            {faceUp ? <CardFace rank={c.rank} suit={c.suit} /> : <CardBack pattern={pattern} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function DealingAnimation({ dealer, pattern, perspectiveSeat = 'S' }) {
  const deckSource = {
    south: { x: '0px', y: '62vh' },
    west: { x: '-62vw', y: '0px' },
    north: { x: '0px', y: '-62vh' },
    east: { x: '62vw', y: '0px' },
  };
  const clockwisePositions = ['south', 'west', 'north', 'east'];
  const viewSeats = seatsFromPerspective(perspectiveSeat);
  const seatsByPosition = Object.fromEntries(Object.entries(viewSeats).map(([position, seat]) => [position, seat]));
  const dealerPosition = pos(dealer, perspectiveSeat);
  const dealPositions = [];
  let positionIndex = clockwisePositions.indexOf(dealerPosition);
  for (let i = 0; i < 48; i++) {
    dealPositions.push(clockwisePositions[positionIndex]);
    positionIndex = (positionIndex + 1) % clockwisePositions.length;
  }
  const previewHands = Object.fromEntries(clockwisePositions.map(position => [position, []]));
  dealPositions.forEach((position, dealIndex) => {
    previewHands[position].push(dealIndex);
  });
  const source = deckSource[dealerPosition];
  return (
    <div className="dealing-animation" aria-hidden="true">
      <div className="deal-stack" style={{ '--sx': source.x, '--sy': source.y }}>
        <CardBack pattern={pattern} />
      </div>
      {dealPositions.map((position, i) => (
        <div
          key={i}
          className={`deal-card to-${position}`}
          data-seat={seatsByPosition[position]}
          style={{ '--sx': source.x, '--sy': source.y, animationDelay: `${i * 0.075}s` }}
        >
          <CardBack pattern={pattern} />
        </div>
      ))}
      {clockwisePositions.map(position => (
        <div key={position} className={`deal-preview-hand ${position}`}>
          {previewHands[position].map((dealIndex, cardIndex) => {
            const center = (previewHands[position].length - 1) / 2;
            const spread = cardIndex - center;
            return (
              <div
                key={dealIndex}
                className="deal-preview-card"
                style={{
                  '--deal-delay': `${dealIndex * 0.075 + 0.28}s`,
                  '--deal-x': `${spread * 11}px`,
                  '--deal-y': `${Math.abs(spread) * 0.7}px`,
                  '--deal-rot': `${spread * 2.2}deg`,
                  zIndex: cardIndex,
                }}
              >
                <CardBack pattern={pattern} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GameTable({ state, tweaks, editMode, setTweaks }) {
  const {
    multiplayer, playMode, mySeat, isRemoteClient, phase, hands, kitty, kittyDiscards, trump, contract, bids,
    bidTurn, trickPlays, collecting, collectingSeat, turn, tricksWon, teamScore, handsWon, matchHands,
    round, toast, turnStart, dealer, currentHigh, hand, isMyTurn, legalIds, teamA_tricks,
    teamB_tricks, showHands, activeSeat, firstBidderPreview, seatName, seatInitial, viewSeats, viewPos,
    startMatch, handleMatchHandsChange, onPlayMine, onMyBid, onChooseTrump, toggleDiscard, confirmKittyDiscard,
  } = state;

  return (
    <div className="app">
      <TopBar round={round} phase={phase} matchHands={matchHands} handsWon={handsWon} multiplayer={multiplayer} playMode={playMode} mySeat={mySeat} />
      <div className="stage">
        <div className="felt"><div className="felt-disc" /></div>

        <Hud trump={trump} round={round} turn={turn} contract={contract} phase={phase} seatName={seatName} />
        <ScoreCard
          teamA_tricks={teamA_tricks}
          teamB_tricks={teamB_tricks}
          teamScore={teamScore}
          handsWon={handsWon}
          matchHands={matchHands}
          onMatchHandsChange={handleMatchHandsChange}
          dealer={dealer}
          contract={contract}
          mySeat={mySeat}
          seatName={seatName}
        />

        {showHands && (
          <>
            {viewSeats.west !== mySeat && <OppHand pos="west" count={hands[viewSeats.west].length} pattern={tweaks.cardBack} />}
            {viewSeats.north !== mySeat && <OppHand pos="north" count={hands[viewSeats.north].length} pattern={tweaks.cardBack} />}
            {viewSeats.east !== mySeat && <OppHand pos="east" count={hands[viewSeats.east].length} pattern={tweaks.cardBack} />}
          </>
        )}

        <Seat pos="south" name={seatName(viewSeats.south)} initial={seatInitial(viewSeats.south)} you={mySeat === viewSeats.south}
              active={activeSeat === viewSeats.south}
              dealer={dealer === viewSeats.south}
              tricks={tricksWon[viewSeats.south]} turnTime={turnStart}
              lastBid={lastBidFor(bids, viewSeats.south)}
              showBid={phase === 'bidding'} />
        <Seat pos="west" name={seatName(viewSeats.west)} initial={seatInitial(viewSeats.west)} you={mySeat === viewSeats.west}
              active={activeSeat === viewSeats.west}
              dealer={dealer === viewSeats.west}
              tricks={tricksWon[viewSeats.west]} turnTime={turnStart}
              lastBid={lastBidFor(bids, viewSeats.west)}
              showBid={phase === 'bidding'} />
        <Seat pos="north" name={seatName(viewSeats.north)} initial={seatInitial(viewSeats.north)} you={mySeat === viewSeats.north}
              active={activeSeat === viewSeats.north}
              dealer={dealer === viewSeats.north}
              tricks={tricksWon[viewSeats.north]} turnTime={turnStart}
              lastBid={lastBidFor(bids, viewSeats.north)}
              showBid={phase === 'bidding'} />
        <Seat pos="east" name={seatName(viewSeats.east)} initial={seatInitial(viewSeats.east)} you={mySeat === viewSeats.east}
              active={activeSeat === viewSeats.east}
              dealer={dealer === viewSeats.east}
              tricks={tricksWon[viewSeats.east]} turnTime={turnStart}
              lastBid={lastBidFor(bids, viewSeats.east)}
              showBid={phase === 'bidding'} />

        <div className="table-center">
          <CenterBadge phase={phase} trump={trump} contract={contract} currentHigh={currentHigh} />
        </div>

        {phase === 'dealing' && <DealingAnimation dealer={dealer} pattern={tweaks.cardBack} perspectiveSeat={mySeat} />}

        <div className="trick-zone">
          {trickPlays.map(p => (
            <div
              key={p.card.id}
              className={`trick-card ${viewPos(p.seat)} ${collecting ? `collecting to-${viewPos(collectingSeat)}` : ''}`}
            >
              <CardFace rank={p.card.rank} suit={p.card.suit} />
            </div>
          ))}
        </div>

        {showHands && (
          <div className="player-hand-zone">
            <PlayerHand
              hand={hand}
              legalIds={legalIds}
              isMyTurn={isMyTurn}
              onPlay={onPlayMine}
              kittyMode={phase === 'kitty' && contract?.declarer === mySeat}
              kittyDiscards={kittyDiscards}
              onToggleDiscard={toggleDiscard}
              kittyIds={kitty.map(c => c.id)}
            />
          </div>
        )}

        {/* Kitty display. The first bidder may preview it before choosing trump if they win the auction. */}
        {phase !== 'roundEnd' && phase !== 'dealing' && kitty.length > 0 && (
          phase === 'bidding' ||
          phase === 'reveal' ||
          (phase === 'chooseTrump' && firstBidderPreview && contract?.declarer === mySeat) ||
          (phase === 'kitty' && contract?.declarer !== mySeat)
        ) && (
          <KittyStack
            cards={kitty}
            faceUp={phase === 'chooseTrump' && firstBidderPreview && contract?.declarer === mySeat}
            pattern={tweaks.cardBack}
            label={
              phase === 'bidding' ? 'Kitty' :
              phase === 'chooseTrump' ? 'Kitty preview' :
              phase === 'kitty' ? `${seatName(contract.declarer)}'s kitty` :
              'Kitty'
            }
          />
        )}

        {/* Kitty exchange panel for human declarer */}
        {phase === 'kitty' && contract?.declarer === mySeat && (
          <KittyPanel
            kitty={kitty}
            picked={kittyDiscards.length}
            onConfirm={confirmKittyDiscard}
          />
        )}

        {/* Bidding panel for human */}
        {phase === 'bidding' && (
          <BiddingPanel
            myTurn={bidTurn === mySeat}
            currentHigh={currentHigh}
            onBid={onMyBid}
            bids={bids}
            seatName={seatName}
          />
        )}

        {phase === 'chooseTrump' && contract?.declarer === mySeat && (
          <TrumpPicker
            mode={contract.mode}
            level={contract.level}
            onChoose={onChooseTrump}
          />
        )}

        {phase !== 'bidding' && (
          <ActionBar
            phase={phase}
            turn={turn}
            bidTurn={bidTurn}
            mySeat={mySeat}
            isMyTurn={isMyTurn}
            collecting={collecting}
            contract={contract}
            firstBidderPreview={firstBidderPreview}
            seatName={seatName}
            onNewMatch={() => { if (!isRemoteClient) startMatch(matchHands); }}
          />
        )}

        {/* Contract reveal */}
        {phase === 'reveal' && contract && (
          <div className="trump-reveal">
            <div className="trump-reveal-card">
              <div className="reveal-label">Contract</div>
              <div className={`contract-display ${contract.suit === '♥' || contract.suit === '♦' ? 'red' : ''}`}>
                <span className="contract-level">{contract.level}</span>
                <span className="contract-suit">{contract.suit}</span>
                <span className="contract-mode">{contract.mode === 'low' ? 'L' : 'H'}</span>
              </div>
              <div className="reveal-name">
                {seatName(contract.declarer)} {contract.declarer === mySeat ? 'declare' : 'declares'} •
                {' '}{contract.mode === 'low' ? 'Low' : 'High'} {SUIT_NAMES[contract.suit]} are trumps
              </div>
              <div className="reveal-sub">Need {contract.level + 5} tricks to make</div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      {editMode && (
        <TweaksPanel title="Tweaks">
          <TweakSection title="Theme">
            <TweakRadio value={tweaks.theme} onChange={(v) => setTweaks({ theme: v })}
              options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'sepia',label:'Sepia'}]} />
          </TweakSection>
          <TweakSection title="Felt color">
            <TweakRadio value={tweaks.felt} onChange={(v) => setTweaks({ felt: v })}
              options={[{value:'green',label:'Green'},{value:'blue',label:'Blue'},{value:'burgundy',label:'Burgundy'},{value:'charcoal',label:'Charcoal'}]} />
          </TweakSection>
          <TweakSection title="Density">
            <TweakRadio value={tweaks.density} onChange={(v) => setTweaks({ density: v })}
              options={[{value:'compact',label:'Compact'},{value:'comfortable',label:'Comfortable'},{value:'roomy',label:'Roomy'}]} />
          </TweakSection>
          <TweakSection title="Card back">
            <TweakRadio value={tweaks.cardBack} onChange={(v) => setTweaks({ cardBack: v })}
              options={[{value:'diamonds',label:'Diamonds'},{value:'weave',label:'Weave'},{value:'lines',label:'Lines'},{value:'solid',label:'Solid'}]} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}


Object.assign(window, {
  TopBar, OnlineRoomControl, CenterBadge, Seat, TimerRing, OppHand, PlayerHand,
  KittyStack, DealingAnimation, GameTable,
});

}
