export const FRAGMENTS = [
  'th', 'he', 'in', 'en', 'nt', 're', 'er', 'an', 'ti', 'es',
  'on', 'at', 'se', 'nd', 'or', 'ar', 'al', 'te', 'co', 'de',
  'to', 'ra', 'et', 'ed', 'it', 'sa', 'em', 'ro',
];

const LINE_VALUES = { 1: 1, 2: 3, 3: 6 };

export function rollFragments(random = Math.random) {
  const pool = [...FRAGMENTS];
  const result = [];
  while (result.length < 3) {
    result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return result;
}

export function createPlayer(id, name, random = Math.random) {
  return {
    id,
    name: name || 'Player',
    fragments: rollFragments(random),
    linesCleared: 0,
    score: 0,
    garbage: 0,
    status: 'playing',
  };
}

export function createRoom(code, hostId, mode) {
  return {
    code,
    hostId,
    mode,
    status: 'lobby',
    players: new Map(),
    startedAt: null,
    endAt: null,
    winnerId: null,
    finishedAt: null,
  };
}

export function startRoom(room, now = Date.now(), random = Math.random) {
  room.status = 'playing';
  room.startedAt = now;
  room.endAt = room.mode === 'timed2m' ? now + 2 * 60 * 1000 : null;
  room.winnerId = null;
  room.finishedAt = null;
  for (const player of room.players.values()) {
    player.fragments = rollFragments(random);
    player.linesCleared = 0;
    player.score = 0;
    player.garbage = 0;
    player.status = 'playing';
  }
}

function finishRoom(room, winnerId, now) {
  room.status = 'finished';
  room.winnerId = winnerId || null;
  room.finishedAt = now;
}

function activePlayers(room) {
  return [...room.players.values()].filter((player) => player.status === 'playing');
}

export function applyWord(room, playerId, word, now = Date.now(), random = Math.random) {
  if (room.status !== 'playing') return { accepted: false, reason: 'room_not_playing' };
  const player = room.players.get(playerId);
  if (!player || player.status !== 'playing') return { accepted: false, reason: 'player_not_playing' };

  const matched = player.fragments.filter((fragment) => word.includes(fragment)).length;
  if (matched === 0) return { accepted: false, reason: 'no_fragment' };

  const lines = LINE_VALUES[matched];
  player.linesCleared += lines;
  player.score += lines * 10;
  player.fragments = rollFragments(random);

  const event = {
    type: 'wordAccepted',
    playerId,
    playerName: player.name,
    word,
    matched,
    lines,
    linesCleared: player.linesCleared,
  };

  if (room.mode === 'battle') {
    const target = activePlayers(room).find((candidate) => candidate.id !== playerId);
    if (target) {
      target.garbage += lines;
      event.targetId = target.id;
      event.targetGarbage = target.garbage;
      if (target.garbage >= 20) {
        target.status = 'eliminated';
        event.eliminatedId = target.id;
      }
    }
  }

  if (room.mode === 'clear40' && player.linesCleared >= 40) {
    finishRoom(room, playerId, now);
    event.finished = true;
  } else if (room.mode === 'battle' && player.linesCleared >= 40) {
    finishRoom(room, playerId, now);
    event.finished = true;
  } else if (room.mode === 'battle' && activePlayers(room).length <= 1) {
    finishRoom(room, activePlayers(room)[0]?.id, now);
    event.finished = true;
  }

  return { accepted: true, event, roomFinished: room.status === 'finished' };
}

export function tickRoom(room, now = Date.now()) {
  if (room.status !== 'playing') return null;
  if (room.mode === 'timed2m' && room.endAt && now >= room.endAt) {
    finishRoom(room, null, now);
    return { type: 'timeExpired' };
  }
  return null;
}

export function publicState(room, selfId = null) {
  const players = [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    linesCleared: player.linesCleared,
    score: player.score,
    garbage: player.garbage,
    status: player.status,
  }));
  const self = room.players.get(selfId);
  return {
    code: room.code,
    mode: room.mode,
    status: room.status,
    hostId: room.hostId,
    startedAt: room.startedAt,
    endAt: room.endAt,
    winnerId: room.winnerId,
    players,
    self: self ? { ...self, fragments: [...self.fragments] } : null,
  };
}
