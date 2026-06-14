(function attachGameEngine(root) {
  const SEATS = ['S', 'W', 'N', 'E'];
  const NEXT = { S: 'W', W: 'N', N: 'E', E: 'S' };
  const TEAM = { S: 'A', N: 'A', W: 'B', E: 'B' };
  const PARTNER = { S: 'N', N: 'S', W: 'E', E: 'W' };
  const OTHER_TEAM = { A: 'B', B: 'A' };
  const FIRST_DEALER = { A: 'S', B: 'W' };
  const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const BID_SUITS = ['\u2663', '\u2666', '\u2665', '\u2660'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 2]));
  const LOW_RANK_VALUE = { ...RANK_VALUE, A: 1 };

  const DELAYS = {
    deal: 4300,
    botBid: 900,
    reveal: 2200,
    botKitty: 1200,
    botPlay: 700,
    collectStart: 1300,
    collectComplete: 3000,
    redeal: 1600,
    advanceRound: 2800,
    clearToast: 1400,
  };

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) deck.push({ suit, rank, id: `${rank}${suit}` });
    }
    return deck;
  }

  function shuffle(cards, rng = Math.random) {
    const result = [...cards];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function sortHand(hand, low = false) {
    const suitOrder = ['\u2660', '\u2665', '\u2663', '\u2666'];
    const values = low ? LOW_RANK_VALUE : RANK_VALUE;
    return [...hand].sort((left, right) => {
      const suitDifference = suitOrder.indexOf(left.suit) - suitOrder.indexOf(right.suit);
      return suitDifference || values[left.rank] - values[right.rank];
    });
  }

  function deal(firstSeat, rng = Math.random) {
    const deck = shuffle(buildDeck(), rng);
    const hands = { S: [], W: [], N: [], E: [] };
    const start = SEATS.indexOf(firstSeat);
    for (let index = 0; index < 48; index += 1) {
      hands[SEATS[(start + index) % 4]].push(deck[index]);
    }
    for (const seat of SEATS) hands[seat] = sortHand(hands[seat]);
    return { hands, kitty: deck.slice(48) };
  }

  function legalCards(hand, trick) {
    if (!trick.length) return hand.map(card => card.id);
    const leadSuit = trick[0].card.suit;
    const followers = hand.filter(card => card.suit === leadSuit);
    return (followers.length ? followers : hand).map(card => card.id);
  }

  function cardValue(card, low = false) {
    return (low ? LOW_RANK_VALUE : RANK_VALUE)[card.rank];
  }

  function cardBeats(left, right, leadSuit, trump, low = false) {
    if (!right) return true;
    if (left.suit === trump && right.suit !== trump) return true;
    if (left.suit !== trump && right.suit === trump) return false;
    if (left.suit !== right.suit) return left.suit === leadSuit && right.suit !== leadSuit;
    return low ? cardValue(left, true) < cardValue(right, true) : cardValue(left) > cardValue(right);
  }

  function winningPlay(trick, trump, low = false) {
    if (!trick.length) return null;
    const leadSuit = trick[0].card.suit;
    return trick.reduce(
      (best, play) => cardBeats(play.card, best.card, leadSuit, trump, low) ? play : best,
      trick[0],
    );
  }

  function trickWinner(trick, trump, low = false) {
    return winningPlay(trick, trump, low).seat;
  }

  function sortWeakestFirst(cards, low = false) {
    return [...cards].sort((left, right) =>
      low ? cardValue(right, true) - cardValue(left, true) : cardValue(left) - cardValue(right));
  }

  function sortStrongestFirst(cards, low = false) {
    return [...cards].sort((left, right) =>
      low ? cardValue(left, true) - cardValue(right, true) : cardValue(right) - cardValue(left));
  }

  function remainingCardsBySuit(hand, trick, playedCards = []) {
    const known = new Set([...hand, ...trick.map(play => play.card), ...playedCards].map(card => card.id));
    const remaining = Object.fromEntries(SUITS.map(suit => [suit, []]));
    for (const card of buildDeck()) {
      if (!known.has(card.id)) remaining[card.suit].push(card);
    }
    return remaining;
  }

  function isLikelyBoss(card, remainingBySuit, low = false) {
    return !remainingBySuit[card.suit].some(other =>
      low ? cardValue(other, true) < cardValue(card, true) : cardValue(other) > cardValue(card));
  }

  function chooseCheapest(cards, low = false) {
    return sortWeakestFirst(cards, low)[0];
  }

  function chooseCheapestWinner(cards, currentBest, leadSuit, trump, low = false) {
    return sortWeakestFirst(
      cards.filter(card => cardBeats(card, currentBest.card, leadSuit, trump, low)),
      low,
    )[0] || null;
  }

  function shouldPullTrumpOnLead(hand, trump, remainingBySuit) {
    if (!trump) return false;
    const trumpCount = hand.filter(card => card.suit === trump).length;
    if (trumpCount < 2) return false;
    const unseenTrumpCount = remainingBySuit[trump]?.length || 0;
    return unseenTrumpCount > 0 && trumpCount > unseenTrumpCount / 3;
  }

  function bidGreaterThan(left, right) {
    if (!right) return true;
    if (left.level !== right.level) return left.level > right.level;
    return left.mode === 'low' && right.mode === 'high';
  }

  function canOpenBid(bid) {
    return bidGreaterThan(bid, { level: 3, mode: 'high' });
  }

  function evaluateHand(hand, suit, mode = 'high') {
    const low = mode === 'low';
    let score = 0;
    const suitCards = hand.filter(card => card.suit === suit);
    const offSuitCards = hand.filter(card => card.suit !== suit);
    for (const card of hand) {
      const highPoints = { A: 4.2, K: 3.1, Q: 2, J: 1, 10: 0.5 };
      const lowPoints = { A: 4.6, 2: 4.2, 3: 3.1, 4: 2, 5: 1, 6: 0.5 };
      score += (low ? lowPoints : highPoints)[card.rank] || 0;
    }
    score += suitCards.reduce((sum, card) => {
      const value = low ? 15 - cardValue(card, true) : cardValue(card);
      return sum + value / 5;
    }, 0);
    if (suitCards.length >= 5) score += (suitCards.length - 4) * 2;
    if (suitCards.length >= 7) score += 1.5;
    for (const nextSuit of SUITS) {
      if (nextSuit === suit) continue;
      const length = hand.filter(card => card.suit === nextSuit).length;
      if (length === 0) score += 2.4;
      else if (length === 1) score += 1.3;
      else if (length >= 5 && low) score += 0.7;
    }
    const sureSideWinners = offSuitCards.filter(card =>
      low ? ['2', '3'].includes(card.rank) : ['A', 'K'].includes(card.rank)).length;
    score += sureSideWinners * 0.8;
    return score;
  }

  function bidLevelFromScore(score) {
    if (score < 21) return 0;
    if (score < 24) return 1;
    if (score < 27) return 2;
    if (score < 30.5) return 3;
    if (score < 34.5) return 4;
    if (score < 39.5) return 5;
    if (score < 46) return 6;
    return 7;
  }

  function botBid(hand, currentBid, partnerBid) {
    const partnerBonus = partnerBid && !partnerBid.pass ? 1.2 + partnerBid.level * 0.2 : 0;
    const candidates = [];
    for (const suit of BID_SUITS) {
      for (const mode of ['high', 'low']) {
        const score = evaluateHand(hand, suit, mode) + partnerBonus;
        candidates.push({ level: bidLevelFromScore(score), mode, score });
      }
    }
    candidates.sort((left, right) =>
      right.level - left.level || right.score - left.score || (left.mode === 'low' ? -1 : 1));
    let choice = candidates.find(candidate => currentBid ? bidGreaterThan(candidate, currentBid) : canOpenBid(candidate));
    if (!choice && !currentBid && candidates.length) {
      choice = candidates[0].mode === 'low'
        ? { ...candidates[0], level: Math.max(3, candidates[0].level) }
        : { ...candidates[0], level: Math.max(4, candidates[0].level) };
    }
    if (!choice && currentBid) {
      const best = candidates[0];
      if (best && best.score >= 32 && currentBid.level < 5) {
        choice = { level: currentBid.level + 1, mode: best.mode };
        if (!bidGreaterThan(choice, currentBid)) choice = null;
      }
    }
    return choice ? { level: choice.level, mode: choice.mode } : { pass: true };
  }

  function botPlay(seat, hand, trick, trump, low = false, context = {}) {
    const legal = legalCards(hand, trick).map(id => hand.find(card => card.id === id)).filter(Boolean);
    if (!legal.length) return null;
    const playedCards = context.playedCards || [];
    const remainingBySuit = remainingCardsBySuit(hand, trick, playedCards);
    const declarerTeam = context.contract?.team || null;
    const botTeam = TEAM[seat];
    const isDeclarerSide = declarerTeam === botTeam;
    const nonTrump = legal.filter(card => card.suit !== trump);
    const weakestLegal = chooseCheapest(nonTrump.length ? nonTrump : legal, low);

    if (!trick.length) {
      const trumpCards = legal.filter(card => card.suit === trump);
      if (isDeclarerSide && trumpCards.length && shouldPullTrumpOnLead(hand, trump, remainingBySuit)) {
        return sortStrongestFirst(trumpCards, low)[0];
      }
      const bossCards = legal.filter(card => card.suit !== trump && isLikelyBoss(card, remainingBySuit, low));
      if (bossCards.length) return sortStrongestFirst(bossCards, low)[0];
      const leadGroup = SUITS.map(suit => {
        const cards = legal.filter(card => card.suit === suit);
        const handSuitLength = hand.filter(card => card.suit === suit).length;
        const strongest = sortStrongestFirst(cards, low)[0];
        const bossCount = cards.filter(card => isLikelyBoss(card, remainingBySuit, low)).length;
        const trumpPenalty = suit === trump ? 2.5 : 0;
        const shortSuitBonus = !isDeclarerSide && suit !== trump && handSuitLength <= 2 ? 1.2 : 0;
        const score = cards.length + bossCount * 2 + shortSuitBonus - trumpPenalty +
          (strongest ? cardValue(strongest, low) / 20 : 0);
        return { cards, score };
      }).filter(group => group.cards.length).sort((left, right) => right.score - left.score)[0];
      if (!leadGroup) return weakestLegal;
      const bosses = leadGroup.cards.filter(card => isLikelyBoss(card, remainingBySuit, low));
      if (bosses.length) return sortStrongestFirst(bosses, low)[0];
      return sortWeakestFirst(leadGroup.cards, low)[Math.min(1, leadGroup.cards.length - 1)];
    }

    const leadSuit = trick[0].card.suit;
    const currentWinner = winningPlay(trick, trump, low);
    const partnerWinning = currentWinner && TEAM[currentWinner.seat] === botTeam;
    const lastToAct = trick.length === 3;
    const followsSuit = legal.some(card => card.suit === leadSuit);

    if (partnerWinning) {
      const safeDiscards = nonTrump.length ? nonTrump : legal;
      const expendable = safeDiscards.filter(card => !isLikelyBoss(card, remainingBySuit, low));
      if (!lastToAct && expendable.length) return chooseCheapest(expendable, low);
      return chooseCheapest(safeDiscards, low);
    }
    if (followsSuit) {
      const sameSuit = legal.filter(card => card.suit === leadSuit);
      return chooseCheapestWinner(sameSuit, currentWinner, leadSuit, trump, low) ||
        chooseCheapest(sameSuit, low);
    }
    const trumpCards = legal.filter(card => card.suit === trump);
    if (trumpCards.length) {
      const trumpWinner = chooseCheapestWinner(trumpCards, currentWinner, leadSuit, trump, low);
      const needToFight = isDeclarerSide || lastToAct || trick.some(play => TEAM[play.seat] === botTeam);
      if (trumpWinner && needToFight) return trumpWinner;
    }
    const discardPool = nonTrump.length ? nonTrump : legal;
    const expendable = discardPool.filter(card => !isLikelyBoss(card, remainingBySuit, low));
    return chooseCheapest(expendable.length ? expendable : discardPool, low);
  }

  function drawFirstDealer(rng = Math.random) {
    while (true) {
      const cards = shuffle(buildDeck(), rng).slice(0, 4);
      const draw = Object.fromEntries(SEATS.map((seat, index) => [seat, cards[index]]));
      const high = Math.max(...cards.map(card => RANK_VALUE[card.rank]));
      const winners = SEATS.filter(seat => RANK_VALUE[draw[seat].rank] === high);
      if (winners.length === 1) return { dealer: winners[0], draw };
    }
  }

  function schedule(type, delay, now, extra = {}) {
    return { type, delay, dueAt: now + delay, ...extra };
  }

  function roundState(dealer, dealt, now) {
    return {
      phase: 'dealing',
      hands: dealt.hands,
      kitty: dealt.kitty,
      kittyRevealed: false,
      trump: null,
      contract: null,
      bids: [],
      bidMode: 'high',
      bidTurn: NEXT[dealer],
      trickPlays: [],
      playedCards: [],
      collecting: false,
      collectingSeat: null,
      turn: NEXT[dealer],
      tricksWon: { S: 0, W: 0, N: 0, E: 0 },
      nextRoundDealer: null,
      toast: null,
      turnStart: now,
      pendingTimer: schedule('deal_complete', DELAYS.deal, now),
    };
  }

  function createMatch(options = {}) {
    const now = options.now || Date.now();
    const rng = options.rng || Math.random;
    const opening = drawFirstDealer(rng);
    const initialNextDealer = {
      ...FIRST_DEALER,
      [TEAM[opening.dealer]]: PARTNER[opening.dealer],
    };
    const state = {
      ...roundState(opening.dealer, deal(NEXT[opening.dealer], rng), now),
      matchHands: [3, 5, 7].includes(options.matchHands) ? options.matchHands : 3,
      teamScore: { A: 0, B: 0 },
      handsWon: { A: 0, B: 0 },
      round: 1,
      dealer: opening.dealer,
      dealerDraw: opening.draw,
      firstDealer: opening.dealer,
      nextDealerByTeam: initialNextDealer,
      humanSeats: [...(options.humanSeats || [])],
      seatNames: { ...(options.seatNames || {}) },
      toast: `High-card draw: ${options.seatNames?.[opening.dealer] || opening.dealer} deals first`,
    };
    return state;
  }

  function currentHighBid(state) {
    return state.bids.filter(bid => !bid.pass).slice(-1)[0] || null;
  }

  function chooseTrumpSuit(hand, mode = 'high') {
    return BID_SUITS
      .map(suit => ({ suit, score: evaluateHand(hand, suit, mode) }))
      .sort((left, right) => right.score - left.score)[0].suit;
  }

  function resolveBidding(state, now) {
    if (state.bids.length < 4) return state;
    if (state.bids.every(bid => bid.pass)) {
      return {
        ...state,
        toast: 'All passed - redealing',
        pendingTimer: schedule('redeal', DELAYS.redeal, now, { roundDealer: state.dealer }),
      };
    }
    const winner = state.bids.filter(bid => !bid.pass).slice(-1)[0];
    const firstBidder = winner.seat === NEXT[state.dealer];
    const contract = {
      level: winner.level,
      mode: winner.mode,
      suit: null,
      declarer: winner.seat,
      team: TEAM[winner.seat],
    };
    if (state.humanSeats.includes(winner.seat)) {
      return {
        ...state,
        contract,
        turn: winner.seat,
        kittyRevealed: firstBidder,
        phase: 'chooseTrump',
        pendingTimer: null,
        turnStart: now,
      };
    }
    const evaluatedHand = firstBidder ? [...state.hands[winner.seat], ...state.kitty] : state.hands[winner.seat];
    const suit = chooseTrumpSuit(evaluatedHand, winner.mode);
    return {
      ...state,
      contract: { ...contract, suit },
      trump: suit,
      turn: winner.seat,
      kittyRevealed: firstBidder,
      phase: 'reveal',
      pendingTimer: schedule('reveal', DELAYS.reveal, now),
      turnStart: now,
    };
  }

  function validateBid(state, seat, bid) {
    if (state.phase !== 'bidding') return 'Bidding is not active.';
    if (state.bidTurn !== seat) return 'It is not your turn to bid.';
    if (!bid || typeof bid !== 'object') return 'Bid is required.';
    if (bid.pass) return null;
    if (!Number.isInteger(bid.level) || bid.level < 1 || bid.level > 7) return 'Bid level must be between 1 and 7.';
    if (!['high', 'low'].includes(bid.mode)) return 'Bid mode must be high or low.';
    const current = currentHighBid(state);
    if (current ? !bidGreaterThan(bid, current) : !canOpenBid(bid)) return 'Bid does not beat the current bid.';
    return null;
  }

  function submitBid(state, seat, bid, now) {
    const error = validateBid(state, seat, bid);
    if (error) return { error };
    const next = {
      ...state,
      bids: [...state.bids, { seat, ...(bid.pass ? { pass: true } : { level: bid.level, mode: bid.mode }) }],
      bidTurn: NEXT[seat],
      turnStart: now,
      pendingTimer: null,
    };
    return { state: resolveBidding(next, now) };
  }

  function chooseTrump(state, seat, suit, now) {
    if (state.phase !== 'chooseTrump') return { error: 'Trump selection is not active.' };
    if (state.contract?.declarer !== seat) return { error: 'Only the declarer can choose trump.' };
    if (!SUITS.includes(suit)) return { error: 'Choose a valid trump suit.' };
    return {
      state: {
        ...state,
        trump: suit,
        contract: { ...state.contract, suit },
        phase: 'reveal',
        pendingTimer: schedule('reveal', DELAYS.reveal, now),
        turnStart: now,
      },
    };
  }

  function discardKitty(state, seat, discards, now) {
    if (state.phase !== 'kitty') return { error: 'Kitty exchange is not active.' };
    if (state.contract?.declarer !== seat) return { error: 'Only the declarer can discard the kitty.' };
    if (!Array.isArray(discards) || discards.length !== 4 || new Set(discards).size !== 4) {
      return { error: 'Choose four distinct cards to discard.' };
    }
    const owned = new Set(state.hands[seat].map(card => card.id));
    if (discards.some(id => !owned.has(id))) return { error: 'You can only discard cards from your hand.' };
    return {
      state: {
        ...state,
        hands: {
          ...state.hands,
          [seat]: state.hands[seat].filter(card => !discards.includes(card.id)),
        },
        kittyRevealed: false,
        phase: 'play',
        turn: seat,
        pendingTimer: null,
        turnStart: now,
      },
    };
  }

  function resolveRoundEnd(state, now) {
    const totalCards = Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0);
    const tricksLeft = totalCards / 4;
    const teamATricks = state.tricksWon.S + state.tricksWon.N;
    const teamBTricks = state.tricksWon.W + state.tricksWon.E;
    const needed = state.contract.level + 5;
    const declarerTricks = state.contract.team === 'A' ? teamATricks : teamBTricks;
    if (totalCards !== 0 && declarerTricks + tricksLeft >= needed) return state;

    let aPoints = 0;
    let bPoints = 0;
    if (declarerTricks >= needed) {
      const points = state.contract.level + declarerTricks - needed;
      if (state.contract.team === 'A') aPoints = points; else bPoints = points;
    } else {
      const setPoints = needed - (declarerTricks + tricksLeft);
      if (state.contract.team === 'A') bPoints = setPoints; else aPoints = setPoints;
    }

    const winner = aPoints > bPoints ? 'A' : bPoints > aPoints ? 'B' : null;
    const handsWon = winner
      ? { ...state.handsWon, [winner]: state.handsWon[winner] + 1 }
      : state.handsWon;
    let dealer = state.dealer;
    let nextDealerByTeam = state.nextDealerByTeam;
    if (winner) {
      const losingTeam = OTHER_TEAM[winner];
      dealer = TEAM[state.dealer] === losingTeam ? PARTNER[state.dealer] : state.nextDealerByTeam[losingTeam];
      nextDealerByTeam = { ...state.nextDealerByTeam, [losingTeam]: PARTNER[dealer] };
    }
    const matchWinner = winner && handsWon[winner] >= Math.ceil(state.matchHands / 2) ? winner : null;
    return {
      ...state,
      teamScore: { A: state.teamScore.A + aPoints, B: state.teamScore.B + bPoints },
      handsWon,
      dealer,
      nextDealerByTeam,
      nextRoundDealer: dealer,
      phase: matchWinner ? 'matchEnd' : 'roundEnd',
      toast: matchWinner
        ? `${matchWinner === 'A' ? 'Us' : 'Them'} win the best of ${state.matchHands}`
        : `${declarerTricks >= needed ? 'Contract made' : 'Set'} - Us ${teamATricks} - ${teamBTricks} Them`,
      pendingTimer: matchWinner ? null : schedule('advance_round', DELAYS.advanceRound, now, { roundDealer: dealer }),
    };
  }

  function playCard(state, seat, cardId, now) {
    if (state.phase !== 'play') return { error: 'Card play is not active.' };
    if (state.collecting || state.trickPlays.length >= 4) return { error: 'Wait for the current trick to finish.' };
    if (state.turn !== seat) return { error: 'It is not your turn to play.' };
    const card = state.hands[seat].find(nextCard => nextCard.id === cardId);
    if (!card) return { error: 'That card is not in your hand.' };
    if (!legalCards(state.hands[seat], state.trickPlays).includes(cardId)) return { error: 'You must follow suit.' };
    const trickPlays = [...state.trickPlays, { seat, card }];
    let next = {
      ...state,
      hands: { ...state.hands, [seat]: state.hands[seat].filter(nextCard => nextCard.id !== cardId) },
      trickPlays,
      turn: NEXT[seat],
      turnStart: now,
      pendingTimer: null,
    };
    if (trickPlays.length === 4) {
      const winner = trickWinner(trickPlays, state.trump, state.contract?.mode === 'low');
      next = {
        ...next,
        toast: `${state.seatNames[winner] || winner} wins the trick`,
        pendingTimer: schedule('collect_start', DELAYS.collectStart, now, { winner }),
      };
    }
    return { state: next };
  }

  function applyCommand(state, seat, command, options = {}) {
    const now = options.now || Date.now();
    if (!state) return { error: 'No match is active.' };
    if (!state.humanSeats.includes(seat)) return { error: 'This seat is controlled by the server.' };
    if (!command || typeof command !== 'object') return { error: 'Command is required.' };
    if (command.type === 'submit_bid') return submitBid(state, seat, command.bid, now);
    if (command.type === 'choose_trump') return chooseTrump(state, seat, command.suit, now);
    if (command.type === 'discard_kitty') return discardKitty(state, seat, command.discards, now);
    if (command.type === 'play_card') return playCard(state, seat, command.cardId, now);
    return { error: 'Unknown game command.' };
  }

  function addKittyToDeclarer(state) {
    const seat = state.contract.declarer;
    const hand = state.hands[seat];
    if (state.kitty.every(card => hand.some(existing => existing.id === card.id))) return state;
    return {
      ...state,
      hands: { ...state.hands, [seat]: sortHand([...hand, ...state.kitty], state.contract.mode === 'low') },
    };
  }

  function completeBotKitty(state, now) {
    const seat = state.contract.declarer;
    const combined = [...state.hands[seat], ...state.kitty];
    const sorted = [...combined].sort((left, right) => {
      const leftTrump = left.suit === state.trump ? 1 : 0;
      const rightTrump = right.suit === state.trump ? 1 : 0;
      return leftTrump - rightTrump || RANK_VALUE[left.rank] - RANK_VALUE[right.rank];
    });
    const discarded = new Set(sorted.slice(0, 4).map(card => card.id));
    return {
      ...state,
      hands: { ...state.hands, [seat]: sortHand(combined.filter(card => !discarded.has(card.id))) },
      kittyRevealed: false,
      toast: `${state.seatNames[seat] || seat} took the kitty`,
      phase: 'play',
      turn: seat,
      turnStart: now,
      pendingTimer: schedule('clear_toast', DELAYS.clearToast, now),
    };
  }

  function applyScheduled(state, options = {}) {
    const now = options.now || Date.now();
    const rng = options.rng || Math.random;
    const timer = state?.pendingTimer;
    if (!timer) return { state };
    if (timer.type === 'deal_complete') {
      return {
        state: {
          ...state,
          phase: 'bidding',
          toast: null,
          pendingTimer: state.humanSeats.includes(state.bidTurn)
            ? null
            : schedule('bot_bid', DELAYS.botBid, now),
          turnStart: now,
        },
      };
    }
    if (timer.type === 'bot_bid') {
      const seat = state.bidTurn;
      const partnerBid = [...state.bids].reverse().find(bid => TEAM[bid.seat] === TEAM[seat]);
      const result = submitBid(state, seat, botBid(state.hands[seat], currentHighBid(state), partnerBid), now);
      if (result.error) return result;
      return { state: scheduleAutomation(result.state, now) };
    }
    if (timer.type === 'redeal') {
      return {
        state: {
          ...state,
          ...roundState(timer.roundDealer, deal(NEXT[timer.roundDealer], rng), now),
        },
      };
    }
    if (timer.type === 'reveal') {
      let next = {
        ...state,
        phase: 'kitty',
        kittyRevealed: true,
        pendingTimer: null,
        turnStart: now,
      };
      if (state.humanSeats.includes(state.contract.declarer)) next = addKittyToDeclarer(next);
      else next.pendingTimer = schedule('bot_kitty', DELAYS.botKitty, now);
      return { state: next };
    }
    if (timer.type === 'bot_kitty') return { state: scheduleAutomation(completeBotKitty(state, now), now) };
    if (timer.type === 'bot_play') {
      const seat = state.turn;
      const card = botPlay(seat, state.hands[seat], state.trickPlays, state.trump, state.contract?.mode === 'low', {
        playedCards: state.playedCards,
        contract: state.contract,
        tricksWon: state.tricksWon,
      });
      const result = playCard(state, seat, card?.id, now);
      if (result.error) return result;
      return { state: scheduleAutomation(result.state, now) };
    }
    if (timer.type === 'collect_start') {
      return {
        state: {
          ...state,
          collecting: true,
          collectingSeat: timer.winner,
          pendingTimer: schedule('collect_complete', DELAYS.collectComplete - DELAYS.collectStart, now, { winner: timer.winner }),
        },
      };
    }
    if (timer.type === 'collect_complete') {
      let next = {
        ...state,
        tricksWon: { ...state.tricksWon, [timer.winner]: state.tricksWon[timer.winner] + 1 },
        playedCards: [...state.playedCards, ...state.trickPlays.map(play => play.card)],
        trickPlays: [],
        collecting: false,
        collectingSeat: null,
        turn: timer.winner,
        turnStart: now,
        toast: null,
        pendingTimer: null,
      };
      next = resolveRoundEnd(next, now);
      return { state: scheduleAutomation(next, now) };
    }
    if (timer.type === 'advance_round') {
      return {
        state: {
          ...state,
          round: state.round + 1,
          ...roundState(timer.roundDealer, deal(NEXT[timer.roundDealer], rng), now),
        },
      };
    }
    if (timer.type === 'clear_toast') {
      return { state: scheduleAutomation({ ...state, toast: null, pendingTimer: null }, now) };
    }
    return { error: 'Unknown scheduled transition.' };
  }

  function scheduleAutomation(state, now = Date.now()) {
    if (!state || state.pendingTimer) return state;
    if (state.phase === 'bidding' && !state.humanSeats.includes(state.bidTurn)) {
      return { ...state, pendingTimer: schedule('bot_bid', DELAYS.botBid, now) };
    }
    if (state.phase === 'play' && !state.collecting && !state.humanSeats.includes(state.turn)) {
      return { ...state, pendingTimer: schedule('bot_play', DELAYS.botPlay, now) };
    }
    return state;
  }

  function hiddenCards(count, prefix) {
    return Array.from({ length: count }, (_, index) => ({ hidden: true, id: `${prefix}-${index}` }));
  }

  function projectState(state, seat) {
    if (!state) return null;
    const declarerCanSeeKitty =
      seat === state.contract?.declarer &&
      (state.phase === 'chooseTrump' ? state.kittyRevealed : state.phase === 'kitty');
    const hands = Object.fromEntries(SEATS.map(nextSeat => [
      nextSeat,
      nextSeat === seat ? state.hands[nextSeat] : hiddenCards(state.hands[nextSeat].length, `hand-${nextSeat}`),
    ]));
    const kittyVisible = declarerCanSeeKitty;
    return {
      phase: state.phase,
      hands,
      kitty: kittyVisible ? state.kitty : hiddenCards(state.kitty.length, 'kitty'),
      kittyRevealed: kittyVisible,
      trump: state.trump,
      contract: state.contract,
      bids: state.bids,
      bidMode: state.bidMode,
      bidTurn: state.bidTurn,
      trickPlays: state.trickPlays,
      playedCards: state.playedCards,
      collecting: state.collecting,
      collectingSeat: state.collectingSeat,
      turn: state.turn,
      tricksWon: state.tricksWon,
      teamScore: state.teamScore,
      handsWon: state.handsWon,
      matchHands: state.matchHands,
      round: state.round,
      turnStart: state.turnStart,
      dealer: state.dealer,
      dealerDraw: state.dealerDraw,
      firstDealer: state.firstDealer,
      nextDealerByTeam: state.nextDealerByTeam,
      nextRoundDealer: state.nextRoundDealer,
      toast: state.toast,
    };
  }

  const engine = {
    SEATS,
    NEXT,
    TEAM,
    SUITS,
    RANKS,
    RANK_VALUE,
    BID_SUITS,
    DELAYS,
    buildDeck,
    shuffle,
    sortHand,
    deal,
    legalCards,
    trickWinner,
    bidGreaterThan,
    canOpenBid,
    evaluateHand,
    botBid,
    botPlay,
    createMatch,
    applyCommand,
    applyScheduled,
    scheduleAutomation,
    projectState,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  root.TrumpsGameEngine = engine;
})(typeof window !== 'undefined' ? window : globalThis);
