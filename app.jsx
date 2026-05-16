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
const DEAL_MS = 4300;
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
  const multiplayer = useMultiplayerSession();
  const [playMode, setPlayMode] = useState(null); // null | 'local' | 'host'
  const [multiplayerRole, setMultiplayerRole] = useState(null); // null | 'host' | 'join'
  const [playerName, setPlayerName] = useState('South');

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

  const mySeat = playMode === 'host' ? (multiplayer.seat || 'S') : 'S';
  const isRemoteClient = playMode === 'host' && multiplayerRole === 'join';
  const isHostClient = playMode !== 'host' || multiplayerRole !== 'join';
  const isHumanSeat = useCallback((seat) => {
    if (playMode !== 'host') return seat === 'S';
    if (!multiplayer.room) return seat === 'S';
    return Boolean(multiplayer.room?.seats?.[seat]?.occupied);
  }, [playMode, multiplayer.room]);

  const currentHigh = bids.filter(b => !b.pass).slice(-1)[0] || null;
  const lowSortActive = contract?.mode === 'low' || currentHigh?.mode === 'low';
  const hand = sortHand(hands?.[mySeat] || [], lowSortActive);
  const isMyTurn = phase === 'play' && turn === mySeat && !collecting;
  const legalIds = isMyTurn && hands ? legalCards(hand, trickPlays) : [];
  const getSeatName = (seat) => {
    if (seat === mySeat && (!multiplayer.room?.seats?.[seat]?.name)) return playerName;
    return multiplayer.room?.seats?.[seat]?.name || SEAT_NAMES[seat];
  };

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
    setToast(`High-card draw: ${getSeatName(opening.dealer)} ${opening.dealer === mySeat ? 'deal' : 'deals'} first`);
    startRound(opening.dealer);
  }, [matchHands, startRound]);

  const startLocalGame = useCallback((name) => {
    setPlayerName(cleanPlayerName(name));
    setMultiplayerRole(null);
    setPlayMode('local');
    startMatch(matchHands);
  }, [matchHands, startMatch]);

  const startHostedGame = useCallback((name) => {
    const cleanName = cleanPlayerName(name);
    setPlayerName(cleanName);
    setMultiplayerRole('host');
    setPlayMode('host');
    multiplayer.createRoom(cleanName);
  }, [multiplayer]);

  const joinHostedGame = useCallback((roomCode, name) => {
    const cleanName = cleanPlayerName(name);
    setPlayerName(cleanName);
    multiplayer.joinRoom(roomCode, cleanName, '', true);
    setMultiplayerRole('join');
    setPlayMode('host');
  }, [multiplayer]);

  useEffect(() => {
    if (!playMode || isRemoteClient || phase !== 'dealing') return;
    const t = setTimeout(() => {
      setToast(null);
      setPhase('bidding');
      setTurnStart(Date.now());
    }, DEAL_MS);
    return () => clearTimeout(t);
  }, [phase, playMode, isRemoteClient]);

  // ----- BIDDING -----
  const submitBid = useCallback((seat, bid) => {
    setBids(prev => [...prev, { seat, ...bid }]);
  }, []);

  const applyBid = useCallback((seat, bid) => {
    if (phase !== 'bidding' || bidTurn !== seat) return;
    if (!bid.pass && currentHigh && !bidGreaterThan(bid, currentHigh)) return;
    submitBid(seat, bid);
    setBidTurn(NEXT[seat]);
    setTurnStart(Date.now());
  }, [phase, bidTurn, currentHigh, submitBid]);

  // Bot bidding
  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'bidding' || !hands) return;
    if (isHumanSeat(bidTurn)) return; // wait for human

    const t = setTimeout(() => {
      const partnerLastBid = [...bids].reverse().find(b => TEAM[b.seat] === TEAM[bidTurn]);
      const bid = botBid(hands[bidTurn], currentHigh, partnerLastBid);
      applyBid(bidTurn, bid);
    }, BID_BOT_DELAY[0] + Math.random() * (BID_BOT_DELAY[1] - BID_BOT_DELAY[0]));
    return () => clearTimeout(t);
  }, [phase, bidTurn, hands, bids, currentHigh, applyBid, isRemoteClient, isHumanSeat]);

  // Auction termination
  useEffect(() => {
    if (isRemoteClient) return;
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
      const winnerIsFirstBidder = winner.seat === NEXT[dealer];
      setKittyRevealed(winnerIsFirstBidder);
      if (isHumanSeat(winner.seat)) {
        setPhase('chooseTrump');
      } else {
        const suit = chooseTrumpSuit(winnerIsFirstBidder ? [...hands[winner.seat], ...kitty] : hands[winner.seat]);
        setContract({ ...newContract, suit });
        setTrump(suit);
        setPhase('reveal');
      }
    }
  }, [bids, phase, startRound, hands, kitty, dealer, isRemoteClient, isHumanSeat]);

  // Reveal → kitty transition (own effect so it isn't canceled by re-renders)
  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'reveal') return;
    const t = setTimeout(() => {
      setPhase('kitty');
      setKittyRevealed(true);
      setTurnStart(Date.now());
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [phase, isRemoteClient]);

  // Play a card
  const playCard = useCallback((seat, card) => {
    setHands(h => ({ ...h, [seat]: h[seat].filter(c => c.id !== card.id) }));
    setTrickPlays(plays => [...plays, { seat, card }]);
  }, []);

  // Bot play
  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'play' || !hands || collecting) return;
    if (isHumanSeat(turn)) return;
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
  }, [turn, hands, trickPlays, phase, collecting, trump, contract, playCard, isRemoteClient, isHumanSeat]);

  // Resolve trick
  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'play' || trickPlays.length !== 4) return;
    const winner = trickWinner(trickPlays, trump, contract?.mode === 'low');
    setToast(`${getSeatName(winner)} ${winner === mySeat ? 'win' : 'wins'} the trick`);

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
  }, [trickPlays, trump, phase, contract, isRemoteClient, mySeat]);

  // Round end detection: score and flip to roundEnd
  useEffect(() => {
    if (isRemoteClient) return;
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
  }, [hands, tricksWon, phase, contract, trickPlays, handsWon, matchHands, dealer, nextDealerByTeam, isRemoteClient]);

  // roundEnd → next round (own effect so the timeout isn't canceled when
  // setPhase('roundEnd') above causes the detection effect to re-run)
  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'roundEnd') return;
    const t = setTimeout(() => {
      setRound(r => r + 1);
      startRound(nextRoundDealer || dealer);
    }, 2800);
    return () => clearTimeout(t);
  }, [phase, startRound, dealer, nextRoundDealer, isRemoteClient]);

  // Bot emotes
  useEffect(() => {
    if (isRemoteClient) return;
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
  }, [hands, phase, isRemoteClient]);

  const applyPlay = useCallback((seat, cardId) => {
    if (phase !== 'play' || collecting || turn !== seat || !hands) return;
    const seatHand = hands[seat] || [];
    const card = seatHand.find(c => c.id === cardId);
    if (!card) return;
    const legal = legalCards(sortHand(seatHand, contract?.mode === 'low'), trickPlays);
    if (!legal.includes(card.id)) return;
    playCard(seat, card);
    setTurn(NEXT[seat]);
    setTurnStart(Date.now());
  }, [phase, collecting, turn, hands, contract, trickPlays, playCard]);

  const applyTrump = useCallback((seat, suit) => {
    if (phase !== 'chooseTrump' || !contract || contract.declarer !== seat) return;
    setContract(c => ({ ...c, suit }));
    setTrump(suit);
    setPhase('reveal');
    setTurnStart(Date.now());
  }, [phase, contract]);

  const onPlayMine = (card) => {
    if (!isMyTurn) return;
    if (!legalIds.includes(card.id)) return;
    if (isRemoteClient) {
      multiplayer.sendPlayerAction({ type: 'play_card', cardId: card.id });
      return;
    }
    applyPlay(mySeat, card.id);
  };

  const onMyBid = (bid) => {
    if (phase !== 'bidding' || bidTurn !== mySeat) return;
    if (isRemoteClient) {
      multiplayer.sendPlayerAction({ type: 'submit_bid', bid });
      return;
    }
    applyBid(mySeat, bid);
  };

  const onChooseTrump = (suit) => {
    if (phase !== 'chooseTrump' || !contract || contract.declarer !== mySeat) return;
    if (isRemoteClient) {
      multiplayer.sendPlayerAction({ type: 'choose_trump', suit });
      return;
    }
    applyTrump(mySeat, suit);
  };

  // ----- KITTY EXCHANGE -----
  // When the kitty phase starts: declarer takes the 4 kitty cards into hand,
  // then must discard 4 (any suit). Bots auto-pick. Human picks 4 to discard.
  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'kitty' || !contract) return;

    if (isHumanSeat(contract.declarer)) {
      // Add kitty to the declarer's hand for visual selection.
      setHands(h => {
        const seatHand = h[contract.declarer] || [];
        if (kitty.every(card => seatHand.some(existing => existing.id === card.id))) return h;
        return { ...h, [contract.declarer]: sortHand([...seatHand, ...kitty], contract.mode === 'low') };
      });
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
      setToast(`${getSeatName(contract.declarer)} took the kitty`);
      setTimeout(() => setToast(null), 1400);
      setTurn(contract.declarer);
      setPhase('play');
      setTurnStart(Date.now());
    }, 2000);
    return () => clearTimeout(t);
  }, [phase, contract, kitty, hands, isRemoteClient, isHumanSeat]);

  const toggleDiscard = (cardId) => {
    if (phase !== 'kitty' || !contract || contract.declarer !== mySeat) return;
    setKittyDiscards(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 4) return prev;
      return [...prev, cardId];
    });
  };

  const applyKittyDiscard = useCallback((seat, discards) => {
    if (phase !== 'kitty' || !contract || contract.declarer !== seat || discards.length !== 4) return;
    setHands(h => ({ ...h, [seat]: h[seat].filter(c => !discards.includes(c.id)) }));
    setKittyDiscards([]);
    setKittyRevealed(false);
    setTurn(contract.declarer);
    setPhase('play');
    setTurnStart(Date.now());
  }, [phase, contract]);

  const confirmKittyDiscard = () => {
    if (kittyDiscards.length !== 4) return;
    if (isRemoteClient) {
      multiplayer.sendPlayerAction({ type: 'discard_kitty', discards: kittyDiscards });
      return;
    }
    applyKittyDiscard(mySeat, kittyDiscards);
  };

  useEffect(() => {
    if (!isHostClient || multiplayer.playerActions.length === 0) return;
    for (const message of multiplayer.playerActions) {
      const action = message.action || {};
      if (action.type === 'submit_bid') applyBid(message.seat, action.bid);
      else if (action.type === 'choose_trump') applyTrump(message.seat, action.suit);
      else if (action.type === 'play_card') applyPlay(message.seat, action.cardId);
      else if (action.type === 'discard_kitty') applyKittyDiscard(message.seat, action.discards || []);
    }
    multiplayer.clearPlayerActions();
  }, [isHostClient, multiplayer.playerActions, multiplayer.clearPlayerActions, applyBid, applyTrump, applyPlay, applyKittyDiscard]);

  const teamA_tricks = tricksWon.S + tricksWon.N;
  const teamB_tricks = tricksWon.W + tricksWon.E;

  const showHands = hands && phase !== 'dealing';
  const activeSeat =
    phase === 'bidding' ? bidTurn :
    phase === 'play' && !collecting ? turn :
    null;
  const firstBidder = NEXT[dealer];
  const firstBidderPreview = phase === 'chooseTrump' && contract?.declarer === firstBidder;

  const handleMatchHandsChange = (hands) => {
    if (isRemoteClient) return;
    startMatch(hands);
  };

  const gameSnapshot = {
    phase,
    hands,
    kitty,
    kittyRevealed,
    trump,
    contract,
    bids,
    bidMode,
    bidTurn,
    trickPlays,
    collecting,
    collectingSeat,
    turn,
    tricksWon,
    teamScore,
    handsWon,
    matchHands,
    round,
    turnStart,
    dealer,
    dealerDraw,
    firstDealer,
    nextDealerByTeam,
    nextRoundDealer,
    toast,
  };

  useEffect(() => {
    if (playMode !== 'host' || !isHostClient || !multiplayer.room || !hands) return;
    multiplayer.syncState(gameSnapshot);
  }, [
    playMode, isHostClient, multiplayer.room, multiplayer.syncState, hands, phase, kitty, kittyRevealed, trump,
    contract, bids, bidMode, bidTurn, trickPlays, collecting, collectingSeat,
    turn, tricksWon, teamScore, handsWon, matchHands, round, turnStart, dealer,
    dealerDraw, firstDealer, nextDealerByTeam, nextRoundDealer, toast,
  ]);

  useEffect(() => {
    if (!isRemoteClient || !multiplayer.gameState) return;
    const state = multiplayer.gameState;
    setPhase(state.phase);
    setHands(state.hands);
    setKitty(state.kitty || []);
    setKittyRevealed(Boolean(state.kittyRevealed));
    setTrump(state.trump);
    setContract(state.contract);
    setBids(state.bids || []);
    setBidMode(state.bidMode || 'high');
    setBidTurn(state.bidTurn || 'S');
    setTrickPlays(state.trickPlays || []);
    setCollecting(Boolean(state.collecting));
    setCollectingSeat(state.collectingSeat);
    setTurn(state.turn || 'S');
    setTricksWon(state.tricksWon || { S: 0, W: 0, N: 0, E: 0 });
    setTeamScore(state.teamScore || { A: 0, B: 0 });
    setHandsWon(state.handsWon || { A: 0, B: 0 });
    setMatchHands(state.matchHands || 3);
    setRound(state.round || 1);
    setTurnStart(state.turnStart || Date.now());
    setDealer(state.dealer || 'E');
    setDealerDraw(state.dealerDraw || null);
    setFirstDealer(state.firstDealer || null);
    setNextDealerByTeam(state.nextDealerByTeam || TEAM_FIRST_DEALER);
    setNextRoundDealer(state.nextRoundDealer || null);
    setToast(state.toast || null);
  }, [isRemoteClient, multiplayer.gameState]);

  const seatName = getSeatName;
  const seatInitial = (seat) => (seatName(seat).slice(0, 1).toUpperCase() || seat);
  const viewSeats = seatsFromPerspective(mySeat);
  const viewPos = (seat) => pos(seat, mySeat);

  if (!playMode) {
    return (
      <div className="app start-app">
        <StartScreen
          onStartLocal={startLocalGame}
          onHostGame={startHostedGame}
          onJoinGame={joinHostedGame}
          multiplayerError={multiplayer.error}
          multiplayerStatus={multiplayer.status}
        />
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

  if (playMode === 'host' && (!hands || !multiplayer.seat)) {
    return (
      <div className="app start-app">
        <LobbyScreen
          room={multiplayer.room}
          seat={multiplayer.seat}
          isHost={multiplayerRole === 'host'}
          error={multiplayer.error}
          onChooseSeat={multiplayer.chooseSeat}
          onStart={() => startMatch(matchHands)}
        />
      </div>
    );
  }

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

function seatsFromPerspective(seat) {
  const west = NEXT[seat];
  const north = NEXT[west];
  const east = NEXT[north];
  return { south: seat, west, north, east };
}

function pos(seat, perspectiveSeat = 'S') {
  const seats = seatsFromPerspective(perspectiveSeat);
  if (seat === seats.south) return 'south';
  if (seat === seats.west) return 'west';
  if (seat === seats.north) return 'north';
  if (seat === seats.east) return 'east';
  return 'south';
}

function chooseTrumpSuit(hand) {
  return ALL_BID_SUITS
    .map(suit => ({ suit, score: evaluateHand(hand, suit) }))
    .sort((a, b) => b.score - a.score)[0].suit;
}

function DealingAnimation({ dealer, pattern, perspectiveSeat = 'S' }) {
  const seatOffset = {
    south: { x: '0px', y: '34vh' },
    west: { x: '-34vw', y: '0px' },
    north: { x: '0px', y: '-34vh' },
    east: { x: '34vw', y: '0px' },
  };
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
    </div>
  );
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

function TopBar({ round, phase, matchHands, handsWon, multiplayer, playMode, mySeat }) {
  const phaseLabel = phase === 'dealing' ? 'Dealing' : phase === 'bidding' ? 'Bidding' : phase === 'chooseTrump' ? 'Trump' : phase === 'reveal' ? 'Contract' : phase === 'play' ? 'In play' : phase === 'matchEnd' ? 'Match end' : 'Round end';
  const myTeam = TEAM[mySeat || 'S'];
  const oppTeam = OTHER_TEAM[myTeam];
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
  const oppTeam = OTHER_TEAM[myTeam];
  const tricksByTeam = { A: teamA_tricks, B: teamB_tricks };
  const teamSeats = {
    A: ['S', 'N'],
    B: ['W', 'E'],
  };
  const teamLabel = (team) => teamSeats[team].map(seat => seatName(seat)).join(' & ');
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
            {row.label} ({teamLabel(row.team)})
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
            <span className="bc-seat">{seatName(b.seat).slice(0,1)}</span>
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
