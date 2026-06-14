{
// Shared game state and orchestration for the Trumps app.
const { useEffect, useRef, useCallback, useReducer } = React;

const TURN_TIME_MS = 12000;
const POST_TRICK_MS = 1700;
const PRE_COLLECT_MS = 1300;
const REVEAL_MS = 2200;
const DEAL_MS = 4300;
const BOT_DELAY = [550, 950];
const BID_BOT_DELAY = [800, 1400];

const INITIAL_GAME_STATE = {
  playMode: null,
  multiplayerRole: null,
  playerName: 'South',
  phase: 'dealing',
  hands: null,
  kitty: [],
  kittyRevealed: false,
  kittyDiscards: [],
  trump: null,
  contract: null,
  bids: [],
  bidMode: 'high',
  bidTurn: 'S',
  trickPlays: [],
  playedCards: [],
  collecting: false,
  collectingSeat: null,
  turn: 'S',
  tricksWon: { S: 0, W: 0, N: 0, E: 0 },
  teamScore: { A: 0, B: 0 },
  handsWon: { A: 0, B: 0 },
  matchHands: 3,
  round: 1,
  toast: null,
  turnStart: Date.now(),
  dealer: 'E',
  dealerDraw: null,
  firstDealer: null,
  nextDealerByTeam: TEAM_FIRST_DEALER,
  nextRoundDealer: null,
  pendingTimer: null,
};

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

function chooseTrumpSuit(hand) {
  return ALL_BID_SUITS
    .map(suit => ({ suit, score: evaluateHand(hand, suit) }))
    .sort((a, b) => b.score - a.score)[0].suit;
}

function roundStartState(roundDealer, dealt) {
  return {
    hands: dealt.hands,
    kitty: dealt.kitty,
    kittyRevealed: false,
    kittyDiscards: [],
    trump: null,
    contract: null,
    bids: [],
    bidMode: 'high',
    bidTurn: NEXT[roundDealer],
    trickPlays: [],
    playedCards: [],
    collecting: false,
    collectingSeat: null,
    turn: NEXT[roundDealer],
    tricksWon: { S: 0, W: 0, N: 0, E: 0 },
    nextRoundDealer: null,
    phase: 'dealing',
    toast: null,
    turnStart: Date.now(),
  };
}

function hydrateRemoteState(remoteState) {
  return {
    ...INITIAL_GAME_STATE,
    ...remoteState,
    kitty: remoteState.kitty || [],
    kittyRevealed: Boolean(remoteState.kittyRevealed),
    bids: remoteState.bids || [],
    bidMode: remoteState.bidMode || 'high',
    bidTurn: remoteState.bidTurn || 'S',
    trickPlays: remoteState.trickPlays || [],
    playedCards: remoteState.playedCards || [],
    collecting: Boolean(remoteState.collecting),
    turn: remoteState.turn || 'S',
    tricksWon: remoteState.tricksWon || { S: 0, W: 0, N: 0, E: 0 },
    teamScore: remoteState.teamScore || { A: 0, B: 0 },
    handsWon: remoteState.handsWon || { A: 0, B: 0 },
    matchHands: remoteState.matchHands || 3,
    round: remoteState.round || 1,
    turnStart: remoteState.turnStart || Date.now(),
    dealer: remoteState.dealer || 'E',
    dealerDraw: remoteState.dealerDraw || null,
    firstDealer: remoteState.firstDealer || null,
    nextDealerByTeam: remoteState.nextDealerByTeam || TEAM_FIRST_DEALER,
    nextRoundDealer: remoteState.nextRoundDealer || null,
    pendingTimer: null,
    toast: remoteState.toast || null,
  };
}

function bidContext(state, bids = state.bids) {
  const currentHigh = bids.filter(b => !b.pass).slice(-1)[0] || null;
  return { currentHigh };
}

function resolveBiddingTransition(state, humanSeats) {
  if (state.phase !== 'bidding' || state.bids.length < 4) return state;

  if (state.bids.length === 4 && state.bids.every(b => b.pass)) {
    return {
      ...state,
      toast: 'All passed - redealing',
      pendingTimer: { type: 'redeal', delay: 1600, roundDealer: state.dealer },
    };
  }

  const calls = state.bids.filter(b => !b.pass);
  if (calls.length === 0) return state;
  const winner = calls[calls.length - 1];
  const winnerIsFirstBidder = winner.seat === NEXT[state.dealer];
  const humanWinner = humanSeats.includes(winner.seat);
  const baseContract = {
    level: winner.level,
    suit: null,
    mode: winner.mode || 'high',
    declarer: winner.seat,
    team: TEAM[winner.seat],
  };

  if (humanWinner) {
    return {
      ...state,
      contract: baseContract,
      trump: null,
      turn: winner.seat,
      kittyRevealed: winnerIsFirstBidder,
      phase: 'chooseTrump',
      pendingTimer: null,
      turnStart: Date.now(),
    };
  }

  const suit = chooseTrumpSuit(winnerIsFirstBidder ? [...state.hands[winner.seat], ...state.kitty] : state.hands[winner.seat]);
  return {
    ...state,
    contract: { ...baseContract, suit },
    trump: suit,
    turn: winner.seat,
    kittyRevealed: winnerIsFirstBidder,
    phase: 'reveal',
    pendingTimer: { type: 'reveal', delay: REVEAL_MS },
    turnStart: Date.now(),
  };
}

function addKittyToDeclarer(state) {
  const seat = state.contract.declarer;
  const seatHand = state.hands[seat] || [];
  if (state.kitty.every(card => seatHand.some(existing => existing.id === card.id))) return state;
  return {
    ...state,
    hands: {
      ...state.hands,
      [seat]: sortHand([...seatHand, ...state.kitty], state.contract.mode === 'low'),
    },
  };
}

function completeBotKitty(state, seatNames = {}) {
  const seat = state.contract.declarer;
  const combined = [...state.hands[seat], ...state.kitty];
  const sorted = [...combined].sort((a, b) => {
    const at = a.suit === state.contract.suit ? 1 : 0;
    const bt = b.suit === state.contract.suit ? 1 : 0;
    if (at !== bt) return at - bt;
    return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  });
  const discards = sorted.slice(0, 4).map(c => c.id);
  const remaining = combined.filter(c => !discards.includes(c.id));
  return {
    ...state,
    hands: {
      ...state.hands,
      [seat]: sortHand(remaining, state.contract.mode === 'low'),
    },
    toast: `${actionSeatName(state, seat, seatNames)} took the kitty`,
    turn: seat,
    phase: 'play',
    pendingTimer: { type: 'clear_toast', delay: 1400 },
    turnStart: Date.now(),
  };
}

function actionSeatName(state, seat, seatNames = {}) {
  return seatNames[seat] || SEAT_NAMES[seat] || seat;
}

function applyCardPlayTransition(state, seat, card, seatNames = {}) {
  const nextTrickPlays = [...state.trickPlays, { seat, card }];
  let nextState = {
    ...state,
    hands: {
      ...state.hands,
      [seat]: state.hands[seat].filter(c => c.id !== card.id),
    },
    trickPlays: nextTrickPlays,
    turn: NEXT[seat],
    turnStart: Date.now(),
  };

  if (nextTrickPlays.length === 4) {
    const winner = trickWinner(nextTrickPlays, state.trump, state.contract?.mode === 'low');
    nextState = {
      ...nextState,
      toast: `${actionSeatName(state, winner, seatNames)} wins the trick`,
      pendingTimer: { type: 'collect_trick', winner },
    };
  }
  return nextState;
}

function completeTrickTransition(state, winner) {
  const nextState = {
    ...state,
    tricksWon: { ...state.tricksWon, [winner]: state.tricksWon[winner] + 1 },
    playedCards: [...state.playedCards, ...state.trickPlays.map(play => play.card)],
    trickPlays: [],
    collecting: false,
    collectingSeat: null,
    turn: winner,
    turnStart: Date.now(),
    toast: null,
    pendingTimer: null,
  };
  return resolveRoundEndTransition(nextState);
}

function resolveRoundEndTransition(state) {
  if (state.phase !== 'play' || !state.hands || !state.contract || state.trickPlays.length !== 0) return state;
  const total = Object.values(state.hands).reduce((a, b) => a + b.length, 0);
  const tricksLeft = total / 4;
  const teamA = state.tricksWon.S + state.tricksWon.N;
  const teamB = state.tricksWon.W + state.tricksWon.E;
  const need = state.contract.level + 5;
  const declTeam = state.contract.team;
  const declTricks = declTeam === 'A' ? teamA : teamB;
  const setLocked = declTricks + tricksLeft < need;
  if (total !== 0 && !setLocked) return state;

  let aPts = 0;
  let bPts = 0;
  if (declTricks >= need) {
    const pts = state.contract.level + (declTricks - need);
    if (declTeam === 'A') aPts = pts; else bPts = pts;
  } else {
    const set = need - (declTricks + tricksLeft);
    if (declTeam === 'A') bPts = set; else aPts = set;
  }

  const made = declTricks >= need;
  const handWinner = aPts > bPts ? 'A' : bPts > aPts ? 'B' : null;
  let nextHandsWon = state.handsWon;
  let nextDealer = state.dealer;
  let nextDealerByTeamState = state.nextDealerByTeam;
  let nextRoundDealerState = state.nextRoundDealer;
  if (handWinner) {
    nextHandsWon = { ...state.handsWon, [handWinner]: state.handsWon[handWinner] + 1 };
    const losingTeam = OTHER_TEAM[handWinner];
    const nextDealerInfo = nextLosingTeamDealer(losingTeam, state.dealer, state.nextDealerByTeam);
    nextDealer = nextDealerInfo.dealer;
    nextDealerByTeamState = nextDealerInfo.nextByTeam;
    nextRoundDealerState = nextDealerInfo.dealer;
  }

  const matchToWin = Math.ceil(state.matchHands / 2);
  const matchWinner = handWinner && nextHandsWon[handWinner] >= matchToWin ? handWinner : null;
  return {
    ...state,
    teamScore: {
      A: state.teamScore.A + aPts,
      B: state.teamScore.B + bPts,
    },
    handsWon: nextHandsWon,
    dealer: nextDealer,
    nextDealerByTeam: nextDealerByTeamState,
    nextRoundDealer: nextRoundDealerState,
    toast: matchWinner
      ? `${matchWinner === 'A' ? 'Us' : 'Them'} win the best of ${state.matchHands}`
      : `${made ? 'Contract made' : 'Set'} - Us ${teamA} - ${teamB} Them`,
    phase: matchWinner ? 'matchEnd' : 'roundEnd',
    pendingTimer: matchWinner ? null : { type: 'advance_round', delay: 2800, roundDealer: nextRoundDealerState || nextDealer },
  };
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_LOCAL_GAME':
      return {
        ...state,
        playerName: action.playerName,
        multiplayerRole: null,
        playMode: 'local',
      };

    case 'HOST_GAME':
      return {
        ...state,
        playerName: action.playerName,
        multiplayerRole: 'host',
        playMode: 'host',
      };

    case 'JOIN_GAME':
      return {
        ...state,
        playerName: action.playerName,
        multiplayerRole: 'join',
        playMode: 'host',
      };

    case 'START_MATCH': {
      const opening = action.opening;
      const initialNextDealerByTeam = {
        ...TEAM_FIRST_DEALER,
        [TEAM[opening.dealer]]: TEAM_PARTNERS[opening.dealer],
      };
      return {
        ...state,
        ...roundStartState(opening.dealer, action.dealt),
        matchHands: action.matchHands,
        teamScore: { A: 0, B: 0 },
        handsWon: { A: 0, B: 0 },
        round: 1,
        dealer: opening.dealer,
        dealerDraw: opening.draw,
        firstDealer: opening.dealer,
        nextDealerByTeam: initialNextDealerByTeam,
        pendingTimer: { type: 'deal_complete', delay: DEAL_MS },
        toast: action.toast,
      };
    }

    case 'START_ROUND':
      return {
        ...state,
        ...roundStartState(action.roundDealer, action.dealt),
        pendingTimer: { type: 'deal_complete', delay: DEAL_MS },
      };

    case 'DEALING_COMPLETE':
      if (state.phase !== 'dealing') return state;
      return {
        ...state,
        phase: 'bidding',
        toast: null,
        pendingTimer: null,
        turnStart: Date.now(),
      };

    case 'SUBMIT_BID': {
      if (state.phase !== 'bidding' || state.bidTurn !== action.seat) return state;
      const nextState = {
        ...state,
        bids: [...state.bids, { seat: action.seat, ...action.bid }],
        bidTurn: NEXT[action.seat],
        turnStart: Date.now(),
      };
      return resolveBiddingTransition(nextState, action.humanSeats || []);
    }

    case 'BOT_BID': {
      if (state.phase !== 'bidding' || !state.hands) return state;
      const partnerLastBid = [...state.bids].reverse().find(b => TEAM[b.seat] === TEAM[state.bidTurn]);
      const bid = botBid(state.hands[state.bidTurn], bidContext(state).currentHigh, partnerLastBid);
      const nextState = {
        ...state,
        bids: [...state.bids, { seat: state.bidTurn, ...bid }],
        bidTurn: NEXT[state.bidTurn],
        pendingTimer: null,
        turnStart: Date.now(),
      };
      return resolveBiddingTransition(nextState, action.humanSeats || []);
    }

    case 'CHOOSE_TRUMP':
      if (!state.contract) return state;
      return {
        ...state,
        contract: { ...state.contract, suit: action.suit },
        trump: action.suit,
        phase: 'reveal',
        pendingTimer: { type: 'reveal', delay: REVEAL_MS },
        turnStart: Date.now(),
      };

    case 'REVEAL_COMPLETE':
      if (state.phase !== 'reveal') return state;
      const kittyState = {
        ...state,
        phase: 'kitty',
        kittyRevealed: true,
        pendingTimer: null,
        turnStart: Date.now(),
      };
      if (action.humanSeats?.includes(state.contract?.declarer)) return addKittyToDeclarer(kittyState);
      return { ...kittyState, pendingTimer: { type: 'bot_kitty', delay: 2000 } };

    case 'PLAY_CARD':
      return applyCardPlayTransition(state, action.seat, action.card, action.seatNames);

    case 'START_COLLECTING_TRICK':
      return {
        ...state,
        collecting: true,
        collectingSeat: action.winner,
      };

    case 'COMPLETE_TRICK':
      return completeTrickTransition(state, action.winner);

    case 'ADVANCE_ROUND':
      return {
        ...state,
        round: state.round + 1,
        ...roundStartState(action.roundDealer, action.dealt),
        pendingTimer: { type: 'deal_complete', delay: DEAL_MS },
      };

    case 'BOT_KITTY_COMPLETE':
      return completeBotKitty(state, action.seatNames);

    case 'BOT_PLAY': {
      if (state.phase !== 'play' || !state.hands || state.collecting || state.trickPlays.length >= 4) return state;
      const seat = state.turn;
      const card = botPlay(seat, state.hands[seat], state.trickPlays, state.trump, state.contract?.mode === 'low', {
        playedCards: state.playedCards,
        contract: state.contract,
        tricksWon: state.tricksWon,
      });
      if (!card) return state;
      return applyCardPlayTransition(state, seat, card, action.seatNames);
    }

    case 'TOGGLE_KITTY_DISCARD': {
      const discards = state.kittyDiscards;
      if (discards.includes(action.cardId)) {
        return { ...state, kittyDiscards: discards.filter(id => id !== action.cardId) };
      }
      if (discards.length >= 4) return state;
      return { ...state, kittyDiscards: [...discards, action.cardId] };
    }

    case 'DISCARD_KITTY':
      return {
        ...state,
        hands: {
          ...state.hands,
          [action.seat]: state.hands[action.seat].filter(c => !action.discards.includes(c.id)),
        },
        kittyDiscards: [],
        kittyRevealed: false,
        turn: state.contract.declarer,
        phase: 'play',
        pendingTimer: null,
        turnStart: Date.now(),
      };

    case 'CLEAR_TOAST':
      return { ...state, toast: null };

    case 'HYDRATE_REMOTE_STATE':
      return {
        ...state,
        ...hydrateRemoteState(action.state || {}),
        playMode: state.playMode,
        multiplayerRole: state.multiplayerRole,
        playerName: state.playerName,
      };

    default:
      return state;
  }
}

function useGameState() {
  const multiplayer = useMultiplayerSession();
  const [state, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const {
    playMode,
    multiplayerRole,
    playerName,
    phase,
    hands,
    kitty,
    kittyRevealed,
    kittyDiscards,
    trump,
    contract,
    bids,
    bidMode,
    bidTurn,
    trickPlays,
    playedCards,
    collecting,
    collectingSeat,
    turn,
    tricksWon,
    teamScore,
    handsWon,
    matchHands,
    round,
    toast,
    turnStart,
    dealer,
    dealerDraw,
    firstDealer,
    nextDealerByTeam,
    nextRoundDealer,
    pendingTimer,
  } = state;
  const turnRef = useRef(turn);
  turnRef.current = turn;

  const mySeat = getMySeat(playMode, multiplayer);
  const isRemoteClient = isRemoteClientForGame(playMode, multiplayerRole);
  const isHostClient = isHostClientForGame(playMode, multiplayerRole);
  const seatContext = { playMode, room: multiplayer.room };
  const isHumanSeat = useCallback((seat) => isHumanSeatForGame(seat, seatContext), [playMode, multiplayer.room]);
  const humanSeats = humanSeatsForGame(seatContext);

  const currentHigh = bids.filter(b => !b.pass).slice(-1)[0] || null;
  const lowSortActive = contract?.mode === 'low' || currentHigh?.mode === 'low';
  const hand = sortHand(hands?.[mySeat] || [], lowSortActive);
  const isMyTurn = phase === 'play' && turn === mySeat && !collecting && trickPlays.length < 4;
  const legalIds = isMyTurn && hands ? legalCards(hand, trickPlays) : [];
  const getSeatName = (seat) => seatNameForGame(seat, { mySeat, playerName, room: multiplayer.room });
  const seatNames = seatNamesForGame({ mySeat, playerName, room: multiplayer.room });

  const startMatch = useCallback((handsToPlay = matchHands) => {
    if (playMode === 'host') {
      multiplayer.startMatch(handsToPlay);
      return;
    }
    const opening = drawFirstDealer();
    dispatch({
      type: 'START_MATCH',
      matchHands: handsToPlay,
      opening,
      dealt: deal(NEXT[opening.dealer]),
      toast: `High-card draw: ${getSeatName(opening.dealer)} ${opening.dealer === mySeat ? 'deal' : 'deals'} first`,
    });
  }, [matchHands, mySeat, getSeatName, playMode, multiplayer.startMatch]);

  const startLocalGame = useCallback((name) => {
    const playerName = cleanPlayerName(name);
    dispatch({ type: 'START_LOCAL_GAME', playerName });
    startMatch(matchHands);
  }, [matchHands, startMatch]);

  const startHostedGame = useCallback((name) => {
    const playerName = cleanPlayerName(name);
    dispatch({ type: 'HOST_GAME', playerName });
    multiplayer.createRoom(playerName);
  }, [multiplayer]);

  const joinHostedGame = useCallback((roomCode, name) => {
    const playerName = cleanPlayerName(name);
    multiplayer.joinRoom(roomCode, playerName, '', true);
    dispatch({ type: 'JOIN_GAME', playerName });
  }, [multiplayer]);

  const applyBid = useCallback((seat, bid) => {
    if (phase !== 'bidding' || bidTurn !== seat) return;
    if (!bid.pass) {
      const allowed = !currentHigh || bidGreaterThan(bid, currentHigh);
      if (!allowed) return;
    }
    dispatch({ type: 'SUBMIT_BID', seat, bid, humanSeats });
  }, [phase, bidTurn, currentHigh, humanSeats]);

  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'bidding' || !hands) return;
    if (isHumanSeat(bidTurn)) return;

    const t = setTimeout(() => {
      dispatch({ type: 'BOT_BID', humanSeats });
    }, BID_BOT_DELAY[0] + Math.random() * (BID_BOT_DELAY[1] - BID_BOT_DELAY[0]));
    return () => clearTimeout(t);
  }, [phase, bidTurn, hands, isRemoteClient, isHumanSeat]);

  const applyPlay = useCallback((seat, cardId) => {
    if (phase !== 'play' || collecting || turn !== seat || !hands || trickPlays.length >= 4) return;
    const seatHand = hands[seat] || [];
    const card = seatHand.find(c => c.id === cardId);
    if (!card) return;
    const legal = legalCards(sortHand(seatHand, contract?.mode === 'low'), trickPlays);
    if (!legal.includes(card.id)) return;
    dispatch({ type: 'PLAY_CARD', seat, card, humanSeats, seatNames });
  }, [phase, collecting, turn, hands, contract, trickPlays, humanSeats, seatNames]);

  useEffect(() => {
    if (isRemoteClient) return;
    if (phase !== 'play' || !hands || collecting) return;
    if (isHumanSeat(turn)) return;
    if (trickPlays.length >= 4) return;

    const t = setTimeout(() => {
      if (turnRef.current !== turn) return;
      dispatch({ type: 'BOT_PLAY', humanSeats, seatNames });
    }, BOT_DELAY[0] + Math.random() * (BOT_DELAY[1] - BOT_DELAY[0]));
    return () => clearTimeout(t);
  }, [turn, hands, trickPlays, phase, collecting, isRemoteClient, isHumanSeat]);

  const applyTrump = useCallback((seat, suit) => {
    if (phase !== 'chooseTrump' || !contract || contract.declarer !== seat) return;
    dispatch({ type: 'CHOOSE_TRUMP', suit });
  }, [phase, contract]);

  const onPlayMine = (card) => {
    if (!isMyTurn || !legalIds.includes(card.id)) return;
    if (isRemoteClient) {
      multiplayer.playCard(card.id);
      return;
    }
    applyPlay(mySeat, card.id);
  };

  const onMyBid = (bid) => {
    if (phase !== 'bidding' || bidTurn !== mySeat) return;
    if (isRemoteClient) {
      multiplayer.submitBid(bid);
      return;
    }
    applyBid(mySeat, bid);
  };

  const onChooseTrump = (suit) => {
    if (phase !== 'chooseTrump' || !contract || contract.declarer !== mySeat) return;
    if (isRemoteClient) {
      multiplayer.chooseTrump(suit);
      return;
    }
    applyTrump(mySeat, suit);
  };

  useEffect(() => {
    if (isRemoteClient || !pendingTimer) return;

    if (pendingTimer.type === 'collect_trick') {
      const t1 = setTimeout(() => dispatch({ type: 'START_COLLECTING_TRICK', winner: pendingTimer.winner }), PRE_COLLECT_MS);
      const t2 = setTimeout(() => dispatch({ type: 'COMPLETE_TRICK', winner: pendingTimer.winner }), PRE_COLLECT_MS + POST_TRICK_MS);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    const t = setTimeout(() => {
      if (pendingTimer.type === 'deal_complete') {
        dispatch({ type: 'DEALING_COMPLETE', humanSeats });
      } else if (pendingTimer.type === 'redeal') {
        const roundDealer = pendingTimer.roundDealer || dealer;
        dispatch({ type: 'START_ROUND', roundDealer, dealt: deal(NEXT[roundDealer]) });
      } else if (pendingTimer.type === 'reveal') {
        dispatch({ type: 'REVEAL_COMPLETE', humanSeats });
      } else if (pendingTimer.type === 'bot_kitty') {
        dispatch({ type: 'BOT_KITTY_COMPLETE', seatNames });
      } else if (pendingTimer.type === 'clear_toast') {
        dispatch({ type: 'CLEAR_TOAST' });
      } else if (pendingTimer.type === 'advance_round') {
        const roundDealer = pendingTimer.roundDealer || nextRoundDealer || dealer;
        dispatch({ type: 'ADVANCE_ROUND', roundDealer, dealt: deal(NEXT[roundDealer]) });
      }
    }, pendingTimer.delay || 0);
    return () => clearTimeout(t);
  }, [pendingTimer, dealer, nextRoundDealer, isRemoteClient]);

  const toggleDiscard = (cardId) => {
    if (phase !== 'kitty' || !contract || contract.declarer !== mySeat) return;
    dispatch({ type: 'TOGGLE_KITTY_DISCARD', cardId });
  };

  const applyKittyDiscard = useCallback((seat, discards) => {
    if (phase !== 'kitty' || !contract || contract.declarer !== seat || discards.length !== 4) return;
    dispatch({ type: 'DISCARD_KITTY', seat, discards });
  }, [phase, contract]);

  const confirmKittyDiscard = () => {
    if (kittyDiscards.length !== 4) return;
    if (isRemoteClient) {
      multiplayer.discardKitty(kittyDiscards);
      return;
    }
    applyKittyDiscard(mySeat, kittyDiscards);
  };

  const teamA_tricks = tricksWon.S + tricksWon.N;
  const teamB_tricks = tricksWon.W + tricksWon.E;
  const showHands = hands && phase !== 'dealing';
  const activeSeat =
    phase === 'bidding' ? bidTurn :
    phase === 'play' && !collecting ? turn :
    null;
  const firstBidder = NEXT[dealer];
  const firstBidderPreview = phase === 'chooseTrump' && contract?.declarer === firstBidder;

  const handleMatchHandsChange = (handsToPlay) => {
    if (isRemoteClient) return;
    startMatch(handsToPlay);
  };

  useEffect(() => {
    if (!isRemoteClient || !multiplayer.gameState) return;
    dispatch({ type: 'HYDRATE_REMOTE_STATE', state: multiplayer.gameState });
  }, [isRemoteClient, multiplayer.gameState]);

  const seatName = getSeatName;
  const getSeatInitial = (seat) => seatInitial(seat, seatNames);
  const viewSeats = seatsFromPerspective(mySeat);
  const viewPos = (seat) => pos(seat, mySeat);

  return {
    multiplayer, playMode, multiplayerRole, playerName, mySeat, isRemoteClient, isHostClient,
    phase, hands, kitty, kittyRevealed, kittyDiscards, trump, contract, bids, bidMode, bidTurn,
    trickPlays, playedCards, collecting, collectingSeat, turn, tricksWon, teamScore, handsWon, matchHands, round,
    toast, turnStart, dealer, dealerDraw, firstDealer, nextDealerByTeam, nextRoundDealer,
    currentHigh, lowSortActive, hand, isMyTurn, legalIds, teamA_tricks, teamB_tricks, showHands,
    activeSeat, firstBidder, firstBidderPreview, seatName, seatInitial: getSeatInitial, viewSeats, viewPos,
    startLocalGame, startHostedGame, joinHostedGame, startMatch, handleMatchHandsChange,
    onPlayMine, onMyBid, onChooseTrump, toggleDiscard, confirmKittyDiscard,
  };
}

Object.assign(window, {
  TURN_TIME_MS, POST_TRICK_MS, PRE_COLLECT_MS, REVEAL_MS, DEAL_MS,
  BOT_DELAY, BID_BOT_DELAY,
  drawFirstDealer, nextLosingTeamDealer, chooseTrumpSuit, useGameState,
});

}
