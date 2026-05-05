// Main game app with bidding phase.
const { useState, useEffect, useRef, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "felt": "green",
  "density": "comfortable",
  "cardBack": "diamonds"
}/*EDITMODE-END*/;

const TURN_TIME_MS = 12000;
const POST_TRICK_MS = 1700;
const PRE_COLLECT_MS = 1300;
const REVEAL_MS = 2200;
const DEAL_MS = 1900;
const BOT_DELAY = [550, 950];
const BID_BOT_DELAY = [800, 1400];
const TEAM_PARTNERS = { S: 'N', N: 'S', W: 'E', E: 'W' };
const TEAM_FIRST_DEALER = { A: 'S', B: 'W' };
const OTHER_TEAM = { A: 'B', B: 'A' };

function drawFirstDealer() {
  while (true) {
    const cards = shuffle(buildDeck()).slice(0, 4);
    const draw = Object.fromEntries(SEATS.map((seat, i) => [seat, cards[i]]));
    const high = Math.max(...cards.map(c => RANK_VALUE[c.rank]));
    const winners = SEATS.filter(seat => RANK_VALUE[draw[seat].rank] === high);
    if (winners.length === 1) return { dealer: winners[0], draw };
  }
}

function nextLosingTeamDealer(losingTeam, currentDealer, nextByTeam) {
  const dealer = TEAM[currentDealer] === losingTeam ? TEAM_PARTNERS[currentDealer] : nextByTeam[losingTeam];
  return {
    dealer,
    nextByTeam: { ...nextByTeam, [losingTeam]: TEAM_PARTNERS[dealer] },
  };
}

function App() {
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = useState(false);

  // game state
  const [phase, setPhase] = useState('dealing'); // 'dealing' | 'bidding' | 'chooseTrump' | 'reveal' | 'kitty' | 'play' | 'roundEnd' | 'matchEnd'
  const [hands, setHands] = useState(null);
  const [kitty, setKitty] = useState([]); // 4 cards
  const [kittyRevealed, setKittyRevealed] = useState(false);
  const [kittyDiscards, setKittyDiscards] = useState([]); // ids selected for discard by human
  const [trump, setTrump] = useState(null);
  const [contract, setContract] = useState(null); // {level, suit, mode, declarer, team}
  const [bids, setBids] = useState([]); // [{seat, level?, suit?, pass?}]
  const [bidMode, setBidMode] = useState('high');
  const [bidTurn, setBidTurn] = useState('S');
  const [trickPlays, setTrickPlays] = useState([]);
  const [collecting, setCollecting] = useState(false);
  const [collectingSeat, setCollectingSeat] = useState(null);
  const [turn, setTurn] = useState('S');
  const [tricksWon, setTricksWon] = useState({ S: 0, W: 0, N: 0, E: 0 });
  const [teamScore, setTeamScore] = useState({ A: 0, B: 0 });
  const [handsWon, setHandsWon] = useState({ A: 0, B: 0 });
  const [matchHands, setMatchHands] = useState(3);
  const [round, setRound] = useState(1);
  const [emote, setEmote] = useState(null);
  const [toast, setToast] = useState(null);
  const [turnStart, setTurnStart] = useState(Date.now());
  const [dealer, setDealer] = useState('E');
  const [dealerDraw, setDealerDraw] = useState(null);
  const [firstDealer, setFirstDealer] = useState(null);
  const [nextDealerByTeam, setNextDealerByTeam] = useState(TEAM_FIRST_DEALER);
  const [nextRoundDealer, setNextRoundDealer] = useState(null);
  const turnRef = useRef(turn);
  turnRef.current = turn;

  const currentHigh = bids.filter(b => !b.pass).slice(-1)[0] || null;
  const lowSortActive = contract?.mode === 'low' || currentHigh?.mode === 'low';
  const hand = sortHand(hands?.S || [], lowSortActive);
  const isMyTurn = phase === 'play' && turn === 'S' && !collecting;
  const legalIds = isMyTurn && hands ? legalCards(hand, trickPlays) : [];

  // Apply theme attrs
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
    document.documentElement.setAttribute('data-felt', tweaks.felt);
    document.documentElement.setAttribute('data-density', tweaks.density);
  }, [tweaks]);

  // listen for tweak panel toggle
  useEffect(() => {
    function onMsg(e) {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setEditMode(true);
      else if (d.type === '__deactivate_edit_mode') setEditMode(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Init / new round → bidding
  const startRound = useCallback((roundDealer = dealer) => {
    const d = deal(NEXT[roundDealer]);
    setHands(d.hands);
    setKitty(d.kitty);
    setKittyRevealed(false);
    setKittyDiscards([]);
    setTrump(null);
    setContract(null);
    setBids([]);
    setBidMode('high');
    setTrickPlays([]);
    setCollecting(false);
    setCollectingSeat(null);
    setTricksWon({ S: 0, W: 0, N: 0, E: 0 });
    setNextRoundDealer(null);
    setPhase('dealing');
    setBidTurn(NEXT[roundDealer]); // first bidder = left of dealer
    setTurnStart(Date.now());
  }, [dealer]);

  const startMatch = useCallback((hands = matchHands) => {
    const opening = drawFirstDealer();
    const initialNextDealerByTeam = {
      ...TEAM_FIRST_DEALER,
      [TEAM[opening.dealer]]: TEAM_PARTNERS[opening.dealer],
    };
    setMatchHands(hands);
    setTeamScore({ A: 0, B: 0 });
    setHandsWon({ A: 0, B: 0 });
    setRound(1);
    setDealer(opening.dealer);
    setDealerDraw(opening.draw);
    setFirstDealer(opening.dealer);
    setNextDealerByTeam(initialNextDealerByTeam);
    setNextRoundDealer(null);
    setToast(`High-card draw: ${SEAT_NAMES[opening.dealer]} ${opening.dealer === 'S' ? 'deal' : 'deals'} first`);
    startRound(opening.dealer);
  }, [matchHands, startRound]);

  useEffect(() => { startMatch(matchHands); }, []); // eslint-disable-line

  useEffect(() => {
    if (phase !== 'dealing') return;
    const t = setTimeout(() => {
      setToast(null);
      setPhase('bidding');
      setTurnStart(Date.now());
    }, DEAL_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // ----- BIDDING -----
  const submitBid = useCallback((seat, bid) => {
    setBids(prev => [...prev, { seat, ...bid }]);
  }, []);

  // Bot bidding
  useEffect(() => {
    if (phase !== 'bidding' || !hands) return;
    if (bidTurn === 'S') return; // wait for human

    const t = setTimeout(() => {
      const partnerLastBid = [...bids].reverse().find(b => TEAM[b.seat] === TEAM[bidTurn]);
      const bid = botBid(hands[bidTurn], currentHigh, partnerLastBid);
      submitBid(bidTurn, bid);
      setBidTurn(NEXT[bidTurn]);
      setTurnStart(Date.now());
    }, BID_BOT_DELAY[0] + Math.random() * (BID_BOT_DELAY[1] - BID_BOT_DELAY[0]));
    return () => clearTimeout(t);
  }, [phase, bidTurn, hands, bids, currentHigh, submitBid]);

  // Auction termination
  useEffect(() => {
    if (phase !== 'bidding') return;
    if (bids.length === 0) return;
    if (bids.length < 4) return;

    // All four pass → redeal
    if (bids.length === 4 && bids.every(b => b.pass)) {
      setToast('All passed — redealing');
      const t = setTimeout(() => { setToast(null); startRound(); }, 1600);
      return () => clearTimeout(t);
    }

    // One round of bidding: highest non-pass call after four seats wins.
    const calls = bids.filter(b => !b.pass);
    if (calls.length > 0) {
      const winner = calls[calls.length - 1];
      const newContract = {
        level: winner.level,
        suit: null,
        mode: winner.mode || 'high',
        declarer: winner.seat,
        team: TEAM[winner.seat],
      };
      setContract(newContract);
      setTurn(winner.seat); // winning bidder leads first
      if (winner.seat === 'S') {
        setPhase('chooseTrump');
      } else {
        const suit = chooseTrumpSuit(hands[winner.seat]);
        setContract({ ...newContract, suit });
        setTrump(suit);
        setPhase('reveal');
      }
    }
  }, [bids, phase, startRound, hands]);

  // Reveal → kitty transition (own effect so it isn't canceled by re-renders)
  useEffect(() => {
    if (phase !== 'reveal') return;
    const t = setTimeout(() => {
      setPhase('kitty');
      setKittyRevealed(true);
      setTurnStart(Date.now());
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Play a card
  const playCard = useCallback((seat, card) => {
    setHands(h => ({ ...h, [seat]: h[seat].filter(c => c.id !== card.id) }));
    setTrickPlays(plays => [...plays, { seat, card }]);
  }, []);

  // Bot play
  useEffect(() => {
    if (phase !== 'play' || !hands || collecting) return;
    if (turn === 'S') return;
    if (trickPlays.length >= 4) return;

    const t = setTimeout(() => {
      if (turnRef.current !== turn) return;
      const seat = turn;
      const card = botPlay(seat, hands[seat], trickPlays, trump, contract?.mode === 'low');
      if (!card) return;
      playCard(seat, card);
      setTurn(NEXT[seat]);
      setTurnStart(Date.now());
    }, BOT_DELAY[0] + Math.random() * (BOT_DELAY[1] - BOT_DELAY[0]));
    return () => clearTimeout(t);
  }, [turn, hands, trickPlays, phase, collecting, trump, contract, playCard]);

  // Resolve trick
  useEffect(() => {
    if (phase !== 'play' || trickPlays.length !== 4) return;
    const winner = trickWinner(trickPlays, trump, contract?.mode === 'low');
    setToast(`${SEAT_NAMES[winner]} ${winner === 'S' ? 'win' : 'wins'} the trick`);

    const t1 = setTimeout(() => {
      setCollecting(true);
      setCollectingSeat(winner);
    }, PRE_COLLECT_MS);
    const t2 = setTimeout(() => {
      setTricksWon(tw => ({ ...tw, [winner]: tw[winner] + 1 }));
      setTrickPlays([]);
      setCollecting(false);
      setCollectingSeat(null);
      setTurn(winner);
      setTurnStart(Date.now());
      setToast(null);
    }, PRE_COLLECT_MS + POST_TRICK_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [trickPlays, trump, phase, contract]);

  // Round end detection: score and flip to roundEnd
  useEffect(() => {
    if (phase !== 'play' || !hands || !contract) return;
    if (trickPlays.length !== 0) return; // wait until any in-flight trick has resolved
    const total = Object.values(hands).reduce((a,b) => a + b.length, 0);
    const tricksLeft = total / 4;
    const teamA = tricksWon.S + tricksWon.N;
    const teamB = tricksWon.W + tricksWon.E;
    const need = contract.level + 5;
    const declTeam = contract.team;
    const declTricks = declTeam === 'A' ? teamA : teamB;
    // Contract is locked-set once defenders have made it mathematically impossible
    const setLocked = declTricks + tricksLeft < need;
    if (total === 0 || setLocked) {
      // Contract scoring: declaring team needs (level + 5) tricks
      let aPts = 0, bPts = 0;
      if (declTricks >= need) {
        const pts = contract.level + (declTricks - need); // contract + overtricks
        if (declTeam === 'A') aPts = pts; else bPts = pts;
      } else {
        // Setback to defenders. Give declarer credit for any unplayed tricks
        // they could still have theoretically won (minimum guaranteed margin).
        const set = need - (declTricks + tricksLeft);
        if (declTeam === 'A') bPts = set; else aPts = set;
      }
      setTeamScore(s => ({ A: s.A + aPts, B: s.B + bPts }));
      const made = declTricks >= need;
      const handWinner = aPts > bPts ? 'A' : bPts > aPts ? 'B' : null;
      let nextHandsWon = handsWon;
      if (handWinner) {
        nextHandsWon = { ...handsWon, [handWinner]: handsWon[handWinner] + 1 };
        setHandsWon(nextHandsWon);
        const losingTeam = OTHER_TEAM[handWinner];
        const nextDealer = nextLosingTeamDealer(losingTeam, dealer, nextDealerByTeam);
        setDealer(nextDealer.dealer);
        setNextDealerByTeam(nextDealer.nextByTeam);
        setNextRoundDealer(nextDealer.dealer);
      }
      const matchToWin = Math.ceil(matchHands / 2);
      const matchWinner = handWinner && nextHandsWon[handWinner] >= matchToWin ? handWinner : null;
      setToast(`${made ? 'Contract made' : 'Set'} • Us ${teamA} – ${teamB} Them`);
      if (matchWinner) {
        setToast(`${matchWinner === 'A' ? 'Us' : 'Them'} win the best of ${matchHands}`);
      }
      setPhase(matchWinner ? 'matchEnd' : 'roundEnd');
    }
  }, [hands, tricksWon, phase, contract, trickPlays, handsWon, matchHands, dealer, nextDealerByTeam]);

  // roundEnd → next round (own effect so the timeout isn't canceled when
  // setPhase('roundEnd') above causes the detection effect to re-run)
  useEffect(() => {
    if (phase !== 'roundEnd') return;
    const t = setTimeout(() => {
      setRound(r => r + 1);
      startRound(nextRoundDealer || dealer);
    }, 2800);
    return () => clearTimeout(t);
  }, [phase, startRound, dealer, nextRoundDealer]);

  // Bot emotes
  useEffect(() => {
    if (!hands || phase === 'dealing' || phase === 'reveal') return;
    const emotes = ['👏','🤔','😅','💭','✨','🎯'];
    const t = setInterval(() => {
      if (Math.random() < 0.18) {
        const seats = ['W','N','E'];
        const seat = seats[Math.floor(Math.random()*3)];
        setEmote({ seat, text: emotes[Math.floor(Math.random()*emotes.length)], key: Date.now() });
        setTimeout(() => setEmote(null), 2400);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [hands, phase]);

  const onPlayMine = (card) => {
    if (!isMyTurn) return;
    if (!legalIds.includes(card.id)) return;
    playCard('S', card);
    setTurn('W');
    setTurnStart(Date.now());
  };

  const onMyBid = (bid) => {
    if (phase !== 'bidding' || bidTurn !== 'S') return;
    if (!bid.pass && currentHigh && !bidGreaterThan(bid, currentHigh)) return;
    submitBid('S', bid);
    setBidTurn(NEXT['S']);
    setTurnStart(Date.now());
  };

  const onChooseTrump = (suit) => {
    if (phase !== 'chooseTrump' || !contract || contract.declarer !== 'S') return;
    setContract(c => ({ ...c, suit }));
    setTrump(suit);
    setPhase('reveal');
    setTurnStart(Date.now());
  };

  // ----- KITTY EXCHANGE -----
  // When the kitty phase starts: declarer takes the 4 kitty cards into hand,
  // then must discard 4 (any suit). Bots auto-pick. Human picks 4 to discard.
  useEffect(() => {
    if (phase !== 'kitty' || !contract) return;

    if (contract.declarer === 'S') {
      // Add kitty to my hand for visual selection
      setHands(h => ({ ...h, S: sortHand([...h.S, ...kitty], contract.mode === 'low') }));
      // wait for human discards
      return;
    }
    // Bot declarer: pick 4 lowest non-trump from combined; auto-advance.
    const t = setTimeout(() => {
      const combined = [...hands[contract.declarer], ...kitty];
      const sorted = [...combined].sort((a, b) => {
        // discard non-trump first, lowest rank first
        const at = a.suit === contract.suit ? 1 : 0;
        const bt = b.suit === contract.suit ? 1 : 0;
        if (at !== bt) return at - bt;
        return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
      });
      const discards = sorted.slice(0, 4).map(c => c.id);
      const remaining = combined.filter(c => !discards.includes(c.id));
      setHands(h => ({ ...h, [contract.declarer]: sortHand(remaining, contract.mode === 'low') }));
      setToast(`${SEAT_NAMES[contract.declarer]} took the kitty`);
      setTimeout(() => setToast(null), 1400);
      setTurn(contract.declarer);
      setPhase('play');
      setTurnStart(Date.now());
    }, 2000);
    return () => clearTimeout(t);
  }, [phase, contract, kitty]);

  const toggleDiscard = (cardId) => {
    if (phase !== 'kitty' || !contract || contract.declarer !== 'S') return;
    setKittyDiscards(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 4) return prev;
      return [...prev, cardId];
    });
  };

  const confirmKittyDiscard = () => {
    if (kittyDiscards.length !== 4) return;
    setHands(h => ({ ...h, S: h.S.filter(c => !kittyDiscards.includes(c.id)) }));
    setKittyDiscards([]);
    setKittyRevealed(false);
    setTurn(contract.declarer);
    setPhase('play');
    setTurnStart(Date.now());
  };

  const teamA_tricks = tricksWon.S + tricksWon.N;
  const teamB_tricks = tricksWon.W + tricksWon.E;

  const showHands = hands && phase !== 'dealing';
  const activeSeat =
    phase === 'bidding' ? bidTurn :
    phase === 'play' && !collecting ? turn :
    null;

  const handleMatchHandsChange = (hands) => {
    startMatch(hands);
  };

  return (
    <div className="app">
      <TopBar round={round} phase={phase} matchHands={matchHands} handsWon={handsWon} />
      <div className="stage">
        <div className="felt"><div className="felt-disc" /></div>

        <Hud trump={trump} round={round} turn={turn} contract={contract} phase={phase} />
        <ScoreCard
          teamA_tricks={teamA_tricks}
          teamB_tricks={teamB_tricks}
          teamScore={teamScore}
          handsWon={handsWon}
          matchHands={matchHands}
          onMatchHandsChange={handleMatchHandsChange}
          dealer={dealer}
          firstDealer={firstDealer}
          dealerDraw={dealerDraw}
          contract={contract}
        />

        {showHands && (
          <>
            <OppHand seat="N" count={hands.N.length} pattern={tweaks.cardBack} />
            <OppHand seat="W" count={hands.W.length} pattern={tweaks.cardBack} />
            <OppHand seat="E" count={hands.E.length} pattern={tweaks.cardBack} />
          </>
        )}

        <Seat pos="south" name={SEAT_NAMES.S} initial="Y" you
              active={activeSeat === 'S'}
              dealer={dealer === 'S'}
              tricks={tricksWon.S} turnTime={turnStart}
              lastBid={lastBidFor(bids, 'S')}
              showBid={phase === 'bidding'} />
        <Seat pos="west" name={SEAT_NAMES.W} initial="M"
              active={activeSeat === 'W'}
              dealer={dealer === 'W'}
              tricks={tricksWon.W} turnTime={turnStart}
              lastBid={lastBidFor(bids, 'W')}
              showBid={phase === 'bidding'} />
        <Seat pos="north" name={SEAT_NAMES.N} initial="T"
              active={activeSeat === 'N'}
              dealer={dealer === 'N'}
              tricks={tricksWon.N} turnTime={turnStart}
              lastBid={lastBidFor(bids, 'N')}
              showBid={phase === 'bidding'} />
        <Seat pos="east" name={SEAT_NAMES.E} initial="A"
              active={activeSeat === 'E'}
              dealer={dealer === 'E'}
              tricks={tricksWon.E} turnTime={turnStart}
              lastBid={lastBidFor(bids, 'E')}
              showBid={phase === 'bidding'} />

        <div className="table-center">
          <CenterBadge phase={phase} trump={trump} contract={contract} currentHigh={currentHigh} />
        </div>

        {phase === 'dealing' && <DealingAnimation dealer={dealer} pattern={tweaks.cardBack} />}

        <div className="trick-zone">
          {trickPlays.map(p => (
            <div
              key={p.card.id}
              className={`trick-card ${pos(p.seat)} ${collecting ? `collecting to-${pos(collectingSeat)}` : ''}`}
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
              kittyMode={phase === 'kitty' && contract?.declarer === 'S'}
              kittyDiscards={kittyDiscards}
              onToggleDiscard={toggleDiscard}
              kittyIds={kitty.map(c => c.id)}
            />
          </div>
        )}

        {/* Kitty display: face-down stack only. Face-up contents are private
            to the winning bidder and are shown via KittyPanel when declarer is South. */}
        {phase !== 'roundEnd' && phase !== 'dealing' && kitty.length > 0 && (phase === 'bidding' || phase === 'reveal' || (phase === 'kitty' && contract?.declarer !== 'S')) && (
          <KittyStack
            cards={kitty}
            faceUp={false}
            pattern={tweaks.cardBack}
            label={
              phase === 'bidding' ? 'Kitty' :
              phase === 'kitty' ? `${SEAT_NAMES[contract.declarer]}'s kitty` :
              'Kitty'
            }
          />
        )}

        {/* Kitty exchange panel for human declarer */}
        {phase === 'kitty' && contract?.declarer === 'S' && (
          <KittyPanel
            kitty={kitty}
            picked={kittyDiscards.length}
            onConfirm={confirmKittyDiscard}
          />
        )}

        {/* Bidding panel for human */}
        {phase === 'bidding' && (
          <BiddingPanel
            myTurn={bidTurn === 'S'}
            currentHigh={currentHigh}
            onBid={onMyBid}
            bids={bids}
          />
        )}

        {phase === 'chooseTrump' && contract?.declarer === 'S' && (
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
            isMyTurn={isMyTurn}
            collecting={collecting}
            contract={contract}
            onNewMatch={() => startMatch(matchHands)}
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
                {SEAT_NAMES[contract.declarer]} {contract.declarer === 'S' ? 'declare' : 'declares'} •
                {' '}{contract.mode === 'low' ? 'Low' : 'High'} {SUIT_NAMES[contract.suit]} are trumps
              </div>
              <div className="reveal-sub">Need {contract.level + 5} tricks to make</div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
        {emote && <Emote seat={emote.seat} text={emote.text} k={emote.key} />}
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

function lastBidFor(bids, seat) {
  for (let i = bids.length - 1; i >= 0; i--) if (bids[i].seat === seat) return bids[i];
  return null;
}

function pos(seat) {
  return { S: 'south', W: 'west', N: 'north', E: 'east' }[seat];
}

function chooseTrumpSuit(hand) {
  return ALL_BID_SUITS
    .map(suit => ({ suit, score: evaluateHand(hand, suit) }))
    .sort((a, b) => b.score - a.score)[0].suit;
}

function DealingAnimation({ dealer, pattern }) {
  const seatOffset = {
    S: { x: '0px', y: '34vh' },
    W: { x: '-34vw', y: '0px' },
    N: { x: '0px', y: '-34vh' },
    E: { x: '34vw', y: '0px' },
  };
  const order = [];
  let seat = NEXT[dealer];
  for (let i = 0; i < 48; i++) {
    order.push(seat);
    seat = NEXT[seat];
  }
  const source = seatOffset[dealer];
  return (
    <div className="dealing-animation" aria-hidden="true">
      <div className="deal-stack" style={{ '--sx': source.x, '--sy': source.y }}>
        <CardBack pattern={pattern} />
      </div>
      {order.map((seat, i) => (
        <div
          key={i}
          className={`deal-card to-${pos(seat)}`}
          style={{ '--sx': source.x, '--sy': source.y, animationDelay: `${i * 0.025}s` }}
        >
          <CardBack pattern={pattern} />
        </div>
      ))}
    </div>
  );
}

function TopBar({ round, phase, matchHands, handsWon }) {
  const phaseLabel = phase === 'dealing' ? 'Dealing' : phase === 'bidding' ? 'Bidding' : phase === 'chooseTrump' ? 'Trump' : phase === 'reveal' ? 'Contract' : phase === 'play' ? 'In play' : phase === 'matchEnd' ? 'Match end' : 'Round end';
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">♠</div>
        <span>Trumps</span>
        <small>4 players</small>
      </div>
      <div className="topbar-meta">
        <span><span className="pip" />Connected</span>
        <span>Room <b style={{color:'var(--ink)'}}>NIGHTHAWK</b></span>
        <span>Hand {round} • {phaseLabel}</span>
        <span>Best of {matchHands}: {handsWon.A}-{handsWon.B}</span>
      </div>
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

function Hud({ trump, round, turn, contract, phase }) {
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
              {contract.level}{contract.suit && <span className={`contract-mini-suit ${contract.suit === '♥' || contract.suit === '♦' ? 'red' : ''}`}>{contract.suit}</span>}{contract.mode === 'low' ? ' Low' : ' High'} by {SEAT_NAMES[contract.declarer]}
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

function ScoreCard({ teamA_tricks, teamB_tricks, teamScore, handsWon, matchHands, onMatchHandsChange, dealer, firstDealer, dealerDraw, contract }) {
  const need = contract ? contract.level + 5 : null;
  const matchToWin = Math.ceil(matchHands / 2);
  const firstDealerCard = firstDealer ? dealerDraw?.[firstDealer] : null;
  return (
    <div className="score-card">
      <div className="match-row">
        <div>
          <div className="match-label">Match</div>
          <div className="match-score">Hands {handsWon.A}-{handsWon.B} <span>first to {matchToWin}</span></div>
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
        <b>{SEAT_NAMES[dealer]}</b>
        {firstDealerCard && <em>first: {SEAT_NAMES[firstDealer]} {firstDealerCard.rank}{firstDealerCard.suit}</em>}
      </div>
      <div className="team-row you-team">
        <div className="team-name">
          <span className="team-dot" />
          Us (You & Tess)
          {contract && contract.team === 'A' && <span className="declarer-badge">Declarer</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="team-tricks">
            {Array.from({length: 13}).map((_,i) => {
              const filled = i < teamA_tricks;
              const targetMark = need && contract.team === 'A' && i === need - 1;
              return <div key={i} className={`trick-pip you ${filled ? 'filled' : ''} ${targetMark ? 'target' : ''}`} />;
            })}
          </div>
          <span className="team-score">{teamScore.A}</span>
        </div>
      </div>
      <div className="team-row opp-team">
        <div className="team-name">
          <span className="team-dot" />
          Them (Marlowe & Aldo)
          {contract && contract.team === 'B' && <span className="declarer-badge">Declarer</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="team-tricks">
            {Array.from({length: 13}).map((_,i) => {
              const filled = i < teamB_tricks;
              const targetMark = need && contract.team === 'B' && i === need - 1;
              return <div key={i} className={`trick-pip opp ${filled ? 'filled' : ''} ${targetMark ? 'target' : ''}`} />;
            })}
          </div>
          <span className="team-score">{teamScore.B}</span>
        </div>
      </div>
    </div>
  );
}

function ActionBar({ phase, turn, bidTurn, isMyTurn, collecting, contract, onNewMatch }) {
  let text;
  if (phase === 'dealing') {
    text = 'Dealing cards';
  } else if (phase === 'bidding') {
    text = bidTurn === 'S' ? 'Your bid — call or pass' : `Waiting on ${SEAT_NAMES[bidTurn]} to bid…`;
  } else if (phase === 'chooseTrump') {
    text = 'Choose trump suit';
  } else if (phase === 'reveal') {
    return null;
  } else if (phase === 'kitty') {
    if (contract?.declarer === 'S') {
      text = 'Pick 4 cards to discard';
    } else {
      text = `${SEAT_NAMES[contract?.declarer]} is taking the kitty…`;
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
    text = `Waiting for ${SEAT_NAMES[turn]}…`;
  }
  return (
    <div className="action-bar">
      <span className="status-pip" />
      <span style={{ marginRight: 8 }}>{text}</span>
      {phase === 'matchEnd' && <button className="btn btn-primary" type="button" onClick={onNewMatch}>New match</button>}
    </div>
  );
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

function OppHand({ seat, count, pattern }) {
  return (
    <div className={`opp-hand ${seat==='N'?'north':seat==='W'?'west':'east'}`}>
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

function BiddingPanel({ myTurn, currentHigh, onBid, bids }) {
  // Build a 7×5 grid of possible bids; disable any not greater than currentHigh.
  // Bidding is one round: each player gets one call.
  // (Hand size is 12 after the kitty exchange. Tricks needed = level + 5, so a 7-bid means 12 of 12.)
  const levels = [1,2,3,4,5,6,7];

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
            <span className="bc-seat">{SEAT_NAMES[b.seat].slice(0,1)}</span>
            <span className="bc-bid">{b.pass ? 'Pass' : `${b.level}${b.mode === 'low' ? 'L' : 'H'}`}</span>
          </div>
        ))}
      </div>

      <div className="bid-grid">
        <div className="bid-row bid-row-head">
          <div />
          <span>High</span>
          <span>Low</span>
        </div>
        {levels.map(L => (
          <div key={L} className="bid-row">
            <div className="bid-row-label">{L}</div>
            {['high', 'low'].map(mode => {
              const candidate = { level: L, mode };
              const allowed = !currentHigh || bidGreaterThan(candidate, currentHigh);
              return (
                <button
                  key={mode}
                  className={`bid-cell ${!allowed?'blocked':''}`}
                  disabled={!myTurn || !allowed}
                  onClick={() => onBid(candidate)}
                >
                  <span className="bc-l">{L}</span>
                  <span className="bc-mode">{mode === 'low' ? 'L' : 'H'}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <button
        className="bid-pass"
        disabled={!myTurn}
        onClick={() => onBid({ pass: true })}
      >
        Pass
      </button>
    </div>
  );
}

function Emote({ seat, text, k }) {
  const positions = {
    N: { left: '50%', top: '170px' },
    W: { left: '160px', top: '50%' },
    E: { right: '160px', top: '50%' },
  };
  const style = positions[seat] || {};
  return (
    <div className="emote-bubble" key={k} style={{ ...style, transform: 'translate(-50%, -50%)' }}>
      {text}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
