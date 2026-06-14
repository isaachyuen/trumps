// Seat topology, names, perspective, and human/bot helpers shared by UI and game state.
const SEATS = ['S', 'W', 'N', 'E'];
const NEXT = { S: 'W', W: 'N', N: 'E', E: 'S' };
const TEAM = { S: 'A', N: 'A', W: 'B', E: 'B' };
const TEAM_SEATS = {
  A: ['S', 'N'],
  B: ['W', 'E'],
};
const SEAT_NAMES = { S: 'South', W: 'West', N: 'North', E: 'East' };
const TEAM_PARTNERS = { S: 'N', N: 'S', W: 'E', E: 'W' };
const TEAM_FIRST_DEALER = { A: 'S', B: 'W' };
const OTHER_TEAM = { A: 'B', B: 'A' };

function seatName(seat, names = {}) {
  return names?.[seat] || SEAT_NAMES[seat] || seat;
}

function seatInitial(seat, names = {}) {
  return (seatName(seat, names).slice(0, 1).toUpperCase() || seat);
}

function teamLabel(team, nameForSeat = seatName) {
  return (TEAM_SEATS[team] || []).map(nextSeat => nameForSeat(nextSeat)).join(' & ');
}

function partnerSeat(seat) {
  return TEAM_PARTNERS[seat];
}

function opponentTeam(team) {
  return OTHER_TEAM[team];
}

function getMySeat(playMode, multiplayer = {}) {
  return playMode === 'host' ? (multiplayer?.seat || 'S') : 'S';
}

function isRemoteClientForGame(playMode, multiplayerRole) {
  return playMode === 'host';
}

function isHostClientForGame(playMode, multiplayerRole) {
  return playMode !== 'host';
}

function isHumanSeatForGame(nextSeat, { playMode, room } = {}) {
  if (playMode !== 'host') return nextSeat === 'S';
  if (!room) return nextSeat === 'S';
  return Boolean(room?.seats?.[nextSeat]?.occupied);
}

function isBotSeatForGame(nextSeat, context = {}) {
  return !isHumanSeatForGame(nextSeat, context);
}

function humanSeatsForGame(context = {}) {
  return SEATS.filter(nextSeat => isHumanSeatForGame(nextSeat, context));
}

function botSeatsForGame(context = {}) {
  return SEATS.filter(nextSeat => isBotSeatForGame(nextSeat, context));
}

function seatNameForGame(nextSeat, { mySeat = 'S', playerName = 'South', room } = {}) {
  if (nextSeat === mySeat && (!room?.seats?.[nextSeat]?.name)) return playerName;
  return room?.seats?.[nextSeat]?.name || seatName(nextSeat);
}

function seatNamesForGame(context = {}) {
  return Object.fromEntries(SEATS.map(nextSeat => [nextSeat, seatNameForGame(nextSeat, context)]));
}

function seatsFromPerspective(nextSeat = 'S') {
  const west = NEXT[nextSeat];
  const north = NEXT[west];
  const east = NEXT[north];
  return { south: nextSeat, west, north, east };
}

function pos(nextSeat, perspectiveSeat = 'S') {
  const seats = seatsFromPerspective(perspectiveSeat);
  if (nextSeat === seats.south) return 'south';
  if (nextSeat === seats.west) return 'west';
  if (nextSeat === seats.north) return 'north';
  if (nextSeat === seats.east) return 'east';
  return 'south';
}

function lastBidFor(bids, nextSeat) {
  for (let i = bids.length - 1; i >= 0; i--) if (bids[i].seat === nextSeat) return bids[i];
  return null;
}

Object.assign(window, {
  SEATS, NEXT, TEAM, TEAM_SEATS, SEAT_NAMES, TEAM_PARTNERS, TEAM_FIRST_DEALER, OTHER_TEAM,
  seatName, seatInitial, teamLabel, partnerSeat, opponentTeam,
  getMySeat, isRemoteClientForGame, isHostClientForGame,
  isHumanSeatForGame, isBotSeatForGame, humanSeatsForGame, botSeatsForGame,
  seatNameForGame, seatNamesForGame, seatsFromPerspective, pos, lastBidFor,
});
