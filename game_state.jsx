{
// React adapter for the shared engine and server-authoritative multiplayer state.
const { useEffect, useCallback, useState } = React;
const GAME_ENGINE = window.TrumpsGameEngine;

const TURN_TIME_MS = 12000;
const POST_TRICK_MS = GAME_ENGINE.DELAYS.collectComplete - GAME_ENGINE.DELAYS.collectStart;
const PRE_COLLECT_MS = GAME_ENGINE.DELAYS.collectStart;
const REVEAL_MS = GAME_ENGINE.DELAYS.reveal;
const DEAL_MS = GAME_ENGINE.DELAYS.deal;
const BOT_DELAY = [GAME_ENGINE.DELAYS.botPlay, GAME_ENGINE.DELAYS.botPlay];
const BID_BOT_DELAY = [GAME_ENGINE.DELAYS.botBid, GAME_ENGINE.DELAYS.botBid];

const EMPTY_GAME_STATE = {
  phase: 'dealing',
  hands: null,
  kitty: [],
  kittyRevealed: false,
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

function normalizeGameState(state) {
  if (!state) return EMPTY_GAME_STATE;
  return {
    ...EMPTY_GAME_STATE,
    ...state,
    kitty: state.kitty || [],
    bids: state.bids || [],
    trickPlays: state.trickPlays || [],
    playedCards: state.playedCards || [],
    tricksWon: state.tricksWon || EMPTY_GAME_STATE.tricksWon,
    teamScore: state.teamScore || EMPTY_GAME_STATE.teamScore,
    handsWon: state.handsWon || EMPTY_GAME_STATE.handsWon,
    nextDealerByTeam: state.nextDealerByTeam || TEAM_FIRST_DEALER,
  };
}

function useGameState() {
  const multiplayer = useMultiplayerSession();
  const [playMode, setPlayMode] = useState(null);
  const [multiplayerRole, setMultiplayerRole] = useState(null);
  const [playerName, setPlayerName] = useState('South');
  const [localState, setLocalState] = useState(null);
  const [kittyDiscards, setKittyDiscards] = useState([]);

  const effectiveMultiplayerRole = playMode === 'host'
    ? (multiplayer.isHost ? 'host' : 'join')
    : multiplayerRole;
  const isRemoteClient = isRemoteClientForGame(playMode, effectiveMultiplayerRole);
  const isHostClient = isHostClientForGame(playMode, effectiveMultiplayerRole);
  const gameState = normalizeGameState(isRemoteClient ? multiplayer.gameState : localState);
  const {
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
  } = gameState;

  const mySeat = getMySeat(playMode, multiplayer);
  const currentHigh = bids.filter(bid => !bid.pass).slice(-1)[0] || null;
  const lowSortActive = contract?.mode === 'low' || currentHigh?.mode === 'low';
  const hand = sortHand(hands?.[mySeat] || [], lowSortActive);
  const isMyTurn = phase === 'play' && turn === mySeat && !collecting && trickPlays.length < 4;
  const legalIds = isMyTurn && hands ? GAME_ENGINE.legalCards(hand, trickPlays) : [];
  const getSeatName = useCallback(
    seat => seatNameForGame(seat, { mySeat, playerName, room: multiplayer.room }),
    [mySeat, playerName, multiplayer.room],
  );
  const seatNames = seatNamesForGame({ mySeat, playerName, room: multiplayer.room });

  const createLocalMatch = useCallback((handsToPlay, name) => {
    const names = {
      S: name,
      W: SEAT_NAMES.W,
      N: SEAT_NAMES.N,
      E: SEAT_NAMES.E,
    };
    return GAME_ENGINE.createMatch({
      matchHands: handsToPlay,
      humanSeats: ['S'],
      seatNames: names,
      now: Date.now(),
    });
  }, []);

  const startMatch = useCallback((handsToPlay = matchHands) => {
    if (playMode === 'host') {
      multiplayer.startMatch(handsToPlay);
      return;
    }
    setKittyDiscards([]);
    setLocalState(createLocalMatch(handsToPlay, playerName));
  }, [matchHands, playMode, multiplayer.startMatch, createLocalMatch, playerName]);

  const startLocalGame = useCallback((name) => {
    const cleanName = cleanPlayerName(name);
    setPlayerName(cleanName);
    setMultiplayerRole(null);
    setPlayMode('local');
    setKittyDiscards([]);
    setLocalState(createLocalMatch(3, cleanName));
  }, [createLocalMatch]);

  const startHostedGame = useCallback((name) => {
    const cleanName = cleanPlayerName(name);
    setPlayerName(cleanName);
    setMultiplayerRole('host');
    setPlayMode('host');
    multiplayer.createRoom(cleanName);
  }, [multiplayer.createRoom]);

  const joinHostedGame = useCallback((roomCode, name) => {
    const cleanName = cleanPlayerName(name);
    setPlayerName(cleanName);
    setMultiplayerRole('join');
    setPlayMode('host');
    multiplayer.joinRoom(roomCode, cleanName, '', true);
  }, [multiplayer.joinRoom]);

  const applyLocalCommand = useCallback((command) => {
    setLocalState(current => {
      const result = GAME_ENGINE.applyCommand(current, 'S', command, { now: Date.now() });
      if (result.error) return current;
      return GAME_ENGINE.scheduleAutomation(result.state, Date.now());
    });
  }, []);

  useEffect(() => {
    if (isRemoteClient || !localState?.pendingTimer) return;
    const timer = localState.pendingTimer;
    const timeout = setTimeout(() => {
      setLocalState(current => {
        if (!current?.pendingTimer ||
            current.pendingTimer.type !== timer.type ||
            current.pendingTimer.dueAt !== timer.dueAt) {
          return current;
        }
        const result = GAME_ENGINE.applyScheduled(current, { now: Date.now() });
        return result.error ? current : result.state;
      });
    }, timer.delay || 0);
    return () => clearTimeout(timeout);
  }, [isRemoteClient, localState?.pendingTimer]);

  useEffect(() => {
    if (phase !== 'kitty') setKittyDiscards([]);
  }, [phase, contract?.declarer]);

  const onPlayMine = (card) => {
    if (!isMyTurn || !legalIds.includes(card.id)) return;
    if (isRemoteClient) multiplayer.playCard(card.id);
    else applyLocalCommand({ type: 'play_card', cardId: card.id });
  };

  const onMyBid = (bid) => {
    if (phase !== 'bidding' || bidTurn !== mySeat) return;
    if (isRemoteClient) multiplayer.submitBid(bid);
    else applyLocalCommand({ type: 'submit_bid', bid });
  };

  const onChooseTrump = (suit) => {
    if (phase !== 'chooseTrump' || contract?.declarer !== mySeat) return;
    if (isRemoteClient) multiplayer.chooseTrump(suit);
    else applyLocalCommand({ type: 'choose_trump', suit });
  };

  const toggleDiscard = (cardId) => {
    if (phase !== 'kitty' || contract?.declarer !== mySeat) return;
    setKittyDiscards(current => {
      if (current.includes(cardId)) return current.filter(id => id !== cardId);
      if (current.length >= 4) return current;
      return [...current, cardId];
    });
  };

  const confirmKittyDiscard = () => {
    if (kittyDiscards.length !== 4) return;
    if (isRemoteClient) multiplayer.discardKitty(kittyDiscards);
    else applyLocalCommand({ type: 'discard_kitty', discards: kittyDiscards });
  };

  const teamA_tricks = tricksWon.S + tricksWon.N;
  const teamB_tricks = tricksWon.W + tricksWon.E;
  const showHands = Boolean(hands) && phase !== 'dealing';
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

  const getSeatInitial = seat => seatInitial(seat, seatNames);
  const viewSeats = seatsFromPerspective(mySeat);
  const viewPos = seat => pos(seat, mySeat);

  return {
    multiplayer, playMode, multiplayerRole: effectiveMultiplayerRole, playerName, mySeat, isRemoteClient, isHostClient,
    phase, hands, kitty, kittyRevealed, kittyDiscards, trump, contract, bids, bidMode, bidTurn,
    trickPlays, playedCards, collecting, collectingSeat, turn, tricksWon, teamScore, handsWon, matchHands, round,
    toast, turnStart, dealer, dealerDraw, firstDealer, nextDealerByTeam, nextRoundDealer,
    currentHigh, lowSortActive, hand, isMyTurn, legalIds, teamA_tricks, teamB_tricks, showHands,
    activeSeat, firstBidder, firstBidderPreview, seatName: getSeatName, seatInitial: getSeatInitial, viewSeats, viewPos,
    startLocalGame, startHostedGame, joinHostedGame, startMatch, handleMatchHandsChange,
    onPlayMine, onMyBid, onChooseTrump, toggleDiscard, confirmKittyDiscard,
  };
}

Object.assign(window, {
  TURN_TIME_MS,
  POST_TRICK_MS,
  PRE_COLLECT_MS,
  REVEAL_MS,
  DEAL_MS,
  BOT_DELAY,
  BID_BOT_DELAY,
  useGameState,
});

}
