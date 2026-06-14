const assert = require('assert');
const engine = require('../shared/game_engine');

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function runScheduled(state, now, rng) {
  const result = engine.applyScheduled(state, { now, rng });
  assert.ifError(result.error ? new Error(result.error) : null);
  return result.state;
}

function testDealAndProjectionPrivacy() {
  const state = engine.createMatch({
    humanSeats: ['S', 'W'],
    seatNames: { S: 'South Player', W: 'West Player' },
    rng: seededRandom(3),
    now: 1000,
  });
  const allCards = [...Object.values(state.hands).flat(), ...state.kitty];
  assert.strictEqual(allCards.length, 52);
  assert.strictEqual(new Set(allCards.map(card => card.id)).size, 52);

  const south = engine.projectState(state, 'S');
  const west = engine.projectState(state, 'W');
  assert.ok(south.hands.S.every(card => !card.hidden));
  assert.ok(south.hands.W.every(card => card.hidden));
  assert.ok(west.hands.W.every(card => !card.hidden));
  assert.ok(west.hands.S.every(card => card.hidden));
  assert.ok(south.kitty.every(card => card.hidden));
}

function testValidatedCommands() {
  let now = 2000;
  let state = engine.createMatch({
    humanSeats: engine.SEATS,
    rng: seededRandom(7),
    now,
  });
  now += engine.DELAYS.deal;
  state = runScheduled(state, now, seededRandom(8));

  const wrongSeat = engine.SEATS.find(seat => seat !== state.bidTurn);
  assert.match(
    engine.applyCommand(state, wrongSeat, { type: 'submit_bid', bid: { level: 4, mode: 'high' } }, { now }).error,
    /not your turn/i,
  );
  assert.match(
    engine.applyCommand(state, state.bidTurn, { type: 'submit_bid', bid: { level: 3, mode: 'high' } }, { now }).error,
    /does not beat/i,
  );

  const accepted = engine.applyCommand(
    state,
    state.bidTurn,
    { type: 'submit_bid', bid: { level: 4, mode: 'high' } },
    { now },
  );
  assert.ifError(accepted.error ? new Error(accepted.error) : null);
  assert.strictEqual(accepted.state.bids.length, 1);
}

function testBotOnlyMatchCompletes() {
  const rng = seededRandom(11);
  let now = 5000;
  let state = engine.createMatch({ humanSeats: [], matchHands: 3, rng, now });
  for (let steps = 0; steps < 3000 && state.phase !== 'matchEnd'; steps += 1) {
    assert.ok(state.pendingTimer, `bot match stalled in ${state.phase}`);
    now += Math.max(1, state.pendingTimer.delay);
    state = runScheduled(state, now, rng);
  }
  assert.strictEqual(state.phase, 'matchEnd');
  assert.ok(state.handsWon.A >= 2 || state.handsWon.B >= 2);
}

testDealAndProjectionPrivacy();
testValidatedCommands();
testBotOnlyMatchCompletes();
console.log('game engine tests ok');
