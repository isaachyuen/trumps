{
// Heads-up display and interaction panels.
const { useState: usePanelState, useEffect: usePanelEffect } = React;
const useState = usePanelState;
const useEffect = usePanelEffect;

function Hud({ trump, round, turn, contract, phase, seatName }) {
  const isRed = trump === '♥' || trump === '♦';
  return (
    <div className="hud">
      <div className="hud-row">
        <span className="hud-label">Phase</span>
        <span className="hud-val">{phase === 'dealing' ? 'Dealing' : phase === 'bidding' ? 'Bidding' : phase === 'chooseTrump' ? 'Choose trump' : phase === 'reveal' ? 'Reveal' : phase === 'matchEnd' ? 'Match end' : phase === 'roundEnd' ? 'Hand end' : 'In play'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Trump</span>
        <span className="hud-val">
          {trump ? <><span className={`trump-mini ${isRed?'red':''}`}>{trump}</span>{SUIT_NAMES[trump]}</> : '—'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Contract</span>
        <span className="hud-val">
          {contract ? (
            <>
              {contract.level}{contract.suit && <span className={`contract-mini-suit ${contract.suit === '♥' || contract.suit === '♦' ? 'red' : ''}`}>{contract.suit}</span>}{contract.mode === 'low' ? ' Low' : ' High'} by {seatName(contract.declarer)}
            </>
          ) : '—'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Hand</span>
        <span className="hud-val">{round}</span>
      </div>
    </div>
  );
}

function ScoreCard({ teamA_tricks, teamB_tricks, teamScore, handsWon, matchHands, onMatchHandsChange, dealer, contract, mySeat, seatName }) {
  const need = contract ? contract.level + 5 : null;
  const matchToWin = Math.ceil(matchHands / 2);
  const myTeam = TEAM[mySeat];
  const oppTeam = opponentTeam(myTeam);
  const tricksByTeam = { A: teamA_tricks, B: teamB_tricks };
  const rows = [
    { kind: 'you', label: 'Us', team: myTeam, tricks: tricksByTeam[myTeam], score: teamScore[myTeam] },
    { kind: 'opp', label: 'Them', team: oppTeam, tricks: tricksByTeam[oppTeam], score: teamScore[oppTeam] },
  ];

  return (
    <div className="score-card">
      <div className="match-row">
        <div>
          <div className="match-label">Match</div>
          <div className="match-score">Hands {handsWon[myTeam]}-{handsWon[oppTeam]} <span>first to {matchToWin}</span></div>
        </div>
        <div className="match-options" aria-label="Match length">
          {[3, 5, 7].map(n => (
            <button
              key={n}
              type="button"
              className={matchHands === n ? 'active' : ''}
              onClick={() => onMatchHandsChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="dealer-row">
        <span>Dealer</span>
        <b>{seatName(dealer)}</b>
      </div>
      {rows.map(row => (
        <div key={row.kind} className={`team-row ${row.kind === 'you' ? 'you-team' : 'opp-team'}`}>
          <div className="team-name">
            <span className="team-dot" />
            {row.label} ({teamLabel(row.team, seatName)})
            {contract && contract.team === row.team && <span className="declarer-badge">Declarer</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="team-tricks">
              {Array.from({length: 13}).map((_,i) => {
                const filled = i < row.tricks;
                const targetMark = need && contract.team === row.team && i === need - 1;
                return <div key={i} className={`trick-pip ${row.kind} ${filled ? 'filled' : ''} ${targetMark ? 'target' : ''}`} />;
              })}
            </div>
            <span className="team-score">{row.score}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionBar({ phase, turn, bidTurn, mySeat, isMyTurn, collecting, contract, firstBidderPreview, seatName, onNewMatch }) {
  let text;
  if (phase === 'dealing') {
    text = 'Dealing cards';
  } else if (phase === 'bidding') {
    text = bidTurn === mySeat ? 'Your bid - call or pass' : `Waiting on ${seatName(bidTurn)} to bid...`;
  } else if (phase === 'chooseTrump') {
    text = firstBidderPreview ? 'Review the kitty, then choose trump' : 'Choose trump suit';
  } else if (phase === 'reveal') {
    return null;
  } else if (phase === 'kitty') {
    if (contract?.declarer === mySeat) {
      text = 'Pick 4 cards to discard';
    } else {
      text = `${seatName(contract?.declarer)} is taking the kitty…`;
    }
  } else if (collecting) {
    text = 'Collecting trick…';
  } else if (isMyTurn) {
    text = 'Your turn — play a card';
  } else if (phase === 'roundEnd') {
    text = 'Round complete';
  } else if (phase === 'matchEnd') {
    text = 'Match complete';
  } else {
    text = `Waiting for ${seatName(turn)}…`;
  }
  return (
    <div className="action-bar">
      <span className="status-pip" />
      <span style={{ marginRight: 8 }}>{text}</span>
      {phase === 'matchEnd' && <button className="btn btn-primary" type="button" onClick={onNewMatch}>New match</button>}
    </div>
  );
}

function KittyPanel({ kitty, picked, onConfirm }) {
  const ready = picked === 4;
  return (
    <div className="kitty-panel">
      <div className="kp-header">
        <div className="kp-title">
          <span className="kp-dot" />
          You took the kitty
        </div>
        <div className="kp-sub">Discard 4 cards to set your final hand</div>
      </div>
      <div className="kp-body">
        <div className="kp-cards">
          {kitty.map(c => (
            <div key={c.id} className="kp-card">
              <CardFace rank={c.rank} suit={c.suit} />
            </div>
          ))}
        </div>
        <div className="kp-counter">
          <span className="kp-counter-label">Selected</span>
          <span className="kp-counter-val">
            <b>{picked}</b><span>/4</span>
          </span>
        </div>
        <button
          className={`kp-confirm ${ready ? 'ready' : ''}`}
          disabled={!ready}
          onClick={onConfirm}
        >
          {ready ? 'Confirm hand' : `Pick ${4 - picked} more`}
        </button>
      </div>
    </div>
  );
}

function TrumpPicker({ mode, level, onChoose }) {
  const handSuitOrder = ['♠','♥','♣','♦'];
  return (
    <div className="trump-picker">
      <div className="tp-header">
        <div className="tp-title">Choose trump</div>
        <div className="tp-sub">{level}{mode === 'low' ? ' Low' : ' High'} won the auction</div>
      </div>
      <div className="tp-suits">
        {handSuitOrder.map(s => {
          const isRed = s === '♥' || s === '♦';
          return (
            <button key={s} type="button" className={isRed ? 'red' : ''} onClick={() => onChoose(s)}>
              <span>{s}</span>
              <b>{SUIT_NAMES[s]}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BiddingPanel({ myTurn, currentHigh, onBid, bids, seatName }) {
  // Bidding is one round: each player gets one call.
  // (Hand size is 12 after the kitty exchange. Tricks needed = level + 5, so a 7-bid means 12 of 12.)
  const levels = [1,2,3,4,5,6,7];
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedMode, setSelectedMode] = useState('high');
  const candidate = { level: selectedLevel, mode: selectedMode };
  const candidateAllowed = !currentHigh || bidGreaterThan(candidate, currentHigh);

  const modeAllowed = (mode) => levels.some(level => !currentHigh || bidGreaterThan({ level, mode }, currentHigh));
  const levelAllowed = (level) => !currentHigh || bidGreaterThan({ level, mode: selectedMode }, currentHigh);

  useEffect(() => {
    if (!candidateAllowed) {
      const nextMode = ['high', 'low'].find(mode => modeAllowed(mode)) || 'high';
      const nextLevel = levels.find(level => !currentHigh || bidGreaterThan({ level, mode: nextMode }, currentHigh)) || 7;
      setSelectedMode(nextMode);
      setSelectedLevel(nextLevel);
    }
  }, [currentHigh, candidateAllowed]);

  return (
    <div className={`bidding-panel ${myTurn ? '' : 'waiting'}`}>
      <div className="bp-header">
        <div className="bp-title">
          <span className="bp-dot" />
          Auction
        </div>
        <div className="bp-sub">{myTurn ? 'Your one call' : 'Waiting…'}</div>
      </div>

      <div className="bid-history">
        {bids.length === 0 ? (
          <div className="bid-history-empty">No bids yet</div>
        ) : bids.map((b, i) => (
          <div key={i} className={`bid-chip ${b.pass ? 'pass' : ''}`}>
            <span className="bc-seat">{seatName(b.seat).slice(0,1)}</span>
            <span className="bc-bid">{b.pass ? 'Pass' : `${b.level}${b.mode === 'low' ? 'L' : 'H'}`}</span>
          </div>
        ))}
      </div>

      <div className="bid-picker">
        <div className="bid-levels" aria-label="Bid level">
          {levels.map(level => {
            const allowed = levelAllowed(level);
            return (
              <button
                key={level}
                type="button"
                className={`bid-level ${selectedLevel === level ? 'active' : ''} ${!allowed ? 'blocked' : ''}`}
                disabled={!myTurn || !allowed}
                onClick={() => setSelectedLevel(level)}
              >
                {level}
              </button>
            );
          })}
        </div>

        <div className="bid-mode-toggle" aria-label="Bid mode">
          {['high', 'low'].map(mode => {
            const allowed = modeAllowed(mode);
            return (
              <button
                key={mode}
                type="button"
                className={selectedMode === mode ? 'active' : ''}
                disabled={!myTurn || !allowed}
                onClick={() => setSelectedMode(mode)}
              >
                {mode === 'low' ? 'Low' : 'High'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bid-actions">
        <button
          className="bid-submit"
          disabled={!myTurn || !candidateAllowed}
          onClick={() => onBid(candidate)}
        >
          Call {selectedLevel} {selectedMode === 'low' ? 'Low' : 'High'}
        </button>
        <button
          className="bid-pass"
          disabled={!myTurn}
          onClick={() => onBid({ pass: true })}
        >
          Pass
        </button>
      </div>
    </div>
  );
}


Object.assign(window, { Hud, ScoreCard, ActionBar, KittyPanel, TrumpPicker, BiddingPanel });

}
