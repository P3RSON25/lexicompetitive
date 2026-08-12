export const FRAGMENTS = [
  'th', 'he', 'in', 'en', 'nt', 're', 'er', 'an', 'ti', 'es',
  'on', 'at', 'se', 'nd', 'or', 'ar', 'al', 'te', 'co', 'de',
  'to', 'ra', 'et', 'ed', 'it', 'sa', 'em', 'ro',
];

export const TARGET_MODES = ['ko', 'equal', 'random'];

export const MAX_COMBO = 4;
export const MAX_LOCKED_GARBAGE = 20;
export const PENDING_GARBAGE_DELAY_MS = 4_000;
export const PENDING_GARBAGE_EXTENSION_MS = 500;

const TARGET_MODE_SET = new Set(TARGET_MODES);
const LINE_VALUES = { 1: 1, 2: 3, 3: 6 };

export function rollFragments(random = Math.random) {
  const pool = [...FRAGMENTS];
  const result = [];
  while (result.length < 3) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

export function createPlayer(id, name, random = Math.random) {
  return {
    id,
    name: name || 'Player',
    fragments: rollFragments(random),
    combo: 0,
    lockedGarbage: 0,
    pendingGarbage: 0,
    pendingGarbageLockAt: null,
    pendingAttackerId: null,
    pendingAttackerName: null,
    targetMode: 'ko',
    score: 0,
    wordsPlayed: 0,
    linesSent: 0,
    kills: 0,
    status: 'playing',
  };
}

export function createRoom(code, hostId, _mode = 'battle') {
  return {
    code,
    hostId,
    mode: 'battle',
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
  room.endAt = null;
  room.winnerId = null;
  room.finishedAt = null;
  for (const player of room.players.values()) {
    player.fragments = rollFragments(random);
    player.combo = 0;
    player.lockedGarbage = 0;
    player.pendingGarbage = 0;
    player.pendingGarbageLockAt = null;
    player.pendingAttackerId = null;
    player.pendingAttackerName = null;
    player.targetMode = 'ko';
    player.score = 0;
    player.wordsPlayed = 0;
    player.linesSent = 0;
    player.kills = 0;
    player.status = 'playing';
  }
}

function finishRoom(room, winnerId, now) {
  room.status = 'finished';
  room.winnerId = winnerId || null;
  room.finishedAt = now;
}

export function activePlayers(room) {
  return [...room.players.values()].filter((player) => player.status === 'playing');
}

function normalizeSubmittedWord(word) {
  return typeof word === 'string' ? word.trim().toLowerCase() : '';
}

function chooseTarget(room, playerId, targetMode, random) {
  const candidates = activePlayers(room).filter((candidate) => candidate.id !== playerId);
  if (candidates.length === 0) return null;
  if (targetMode === 'random') {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    return candidates[index];
  }

  const direction = targetMode === 'equal' ? -1 : 1;
  return candidates.reduce((best, candidate) => {
    const bestGarbage = best.lockedGarbage;
    const candidateGarbage = candidate.lockedGarbage;
    return (candidateGarbage - bestGarbage) * direction > 0 ? candidate : best;
  });
}

function queueGarbage(player, lines, now, attacker) {
  if (lines <= 0 || player.status !== 'playing') return;
  if (player.pendingGarbage === 0) {
    player.pendingGarbageLockAt = now + PENDING_GARBAGE_DELAY_MS;
  } else {
    player.pendingGarbageLockAt += lines * PENDING_GARBAGE_EXTENSION_MS;
  }
  player.pendingGarbage += lines;
  player.pendingAttackerId = attacker.id;
  player.pendingAttackerName = attacker.name;
}

function lockPendingGarbage(player) {
  const lines = player.pendingGarbage;
  if (lines <= 0) return { lines: 0, attackerId: null, attackerName: null };
  const attackerId = player.pendingAttackerId;
  const attackerName = player.pendingAttackerName;

  player.pendingGarbage = 0;
  player.pendingGarbageLockAt = null;
  player.pendingAttackerId = null;
  player.pendingAttackerName = null;
  player.lockedGarbage = Math.min(MAX_LOCKED_GARBAGE, player.lockedGarbage + lines);
  if (player.lockedGarbage >= MAX_LOCKED_GARBAGE) {
    player.status = 'eliminated';
    player.combo = 0;
  }
  return { lines, attackerId, attackerName };
}

export function setTargetMode(room, playerId, targetMode) {
  if (room.status === 'finished') return { accepted: false, reason: 'room_finished' };
  const player = room.players.get(playerId);
  if (!player || player.status !== 'playing') return { accepted: false, reason: 'player_not_playing' };
  if (!TARGET_MODE_SET.has(targetMode)) return { accepted: false, reason: 'invalid_target_mode' };
  player.targetMode = targetMode;
  return { accepted: true, targetMode };
}

export function applyWord(room, playerId, word, now = Date.now(), random = Math.random) {
  if (room.status !== 'playing') {
    return { accepted: false, reason: room.status === 'finished' ? 'room_finished' : 'room_not_playing' };
  }
  const tickEvents = tickRoom(room, now);
  if (room.status !== 'playing') {
    return { accepted: false, reason: room.status === 'finished' ? 'room_finished' : 'room_not_playing', tickEvents };
  }
  const player = room.players.get(playerId);
  if (!player || player.status !== 'playing') return { accepted: false, reason: 'player_not_playing', tickEvents };

  const normalizedWord = normalizeSubmittedWord(word);
  const matched = player.fragments.filter((fragment) => normalizedWord.includes(fragment)).length;
  if (matched === 0) return { accepted: false, reason: 'no_fragment', tickEvents };

  const comboBefore = player.combo;
  let comboBonus = 0;
  if (matched === 2) {
    player.combo = Math.min(MAX_COMBO, player.combo + 1);
    comboBonus = player.combo;
  } else if (matched === 3) {
    comboBonus = player.combo;
    player.combo = 0;
  } else {
    player.combo = 0;
  }

  const baseLines = LINE_VALUES[matched];
  const totalLines = baseLines + comboBonus;
  const pendingBefore = player.pendingGarbage;
  const lockedBefore = player.lockedGarbage;
  let cancelledPending = 0;
  let defendedLocked = 0;

  if (pendingBefore > 0) {
    cancelledPending = Math.min(pendingBefore, totalLines);
    player.pendingGarbage -= cancelledPending;
    if (player.pendingGarbage === 0) {
      player.pendingGarbageLockAt = null;
      player.pendingAttackerId = null;
      player.pendingAttackerName = null;
    }
  } else {
    defendedLocked = Math.min(lockedBefore, totalLines);
    player.lockedGarbage -= defendedLocked;
  }

  const outgoingLines = totalLines - cancelledPending;
  player.fragments = rollFragments(random);
  player.score += totalLines;
  player.wordsPlayed += 1;
  player.linesSent += outgoingLines;

  let targets = [];
  if (matched === 3) {
    targets = activePlayers(room).filter((candidate) => candidate.id !== playerId);
  } else {
    const target = chooseTarget(room, playerId, player.targetMode, random);
    if (target) targets = [target];
  }
  for (const target of targets) queueGarbage(target, outgoingLines, now, player);

  const event = {
    type: 'wordAccepted',
    playerId,
    playerName: player.name,
    word: normalizedWord,
    matched,
    baseLines,
    comboBefore,
    comboBonus,
    comboAfter: player.combo,
    lines: totalLines,
    totalLines,
    cancelledPending,
    defendedLocked,
    outgoingLines,
    targetMode: player.targetMode,
    targetIds: targets.map((target) => target.id),
    aoe: matched === 3,
  };

  if (room.status === 'playing' && activePlayers(room).length <= 1) {
    finishRoom(room, activePlayers(room)[0]?.id, now);
    event.finished = true;
  }

  return { accepted: true, event, roomFinished: room.status === 'finished', tickEvents };
}

export function tickRoom(room, now = Date.now()) {
  if (room.status !== 'playing') return [];
  const events = [];

  for (const player of room.players.values()) {
    if (
      player.status !== 'playing'
      || player.pendingGarbage <= 0
      || player.pendingGarbageLockAt === null
      || now < player.pendingGarbageLockAt
    ) continue;

    const garbage = lockPendingGarbage(player);
    if (player.status === 'eliminated' && garbage.attackerId) {
      const attacker = room.players.get(garbage.attackerId);
      if (attacker && attacker.id !== player.id) attacker.kills += 1;
    }
    events.push({
      type: 'garbageLocked',
      playerId: player.id,
      playerName: player.name,
      lines: garbage.lines,
      lockedGarbage: player.lockedGarbage,
      eliminated: player.status === 'eliminated',
      attackerId: garbage.attackerId,
      attackerName: garbage.attackerName,
    });
  }

  if (events.length > 0 && activePlayers(room).length <= 1) {
    finishRoom(room, activePlayers(room)[0]?.id, now);
    events.push({
      type: 'gameFinished',
      winnerId: room.winnerId,
    });
  }

  return events;
}

function publicPlayer(room, player, now = Date.now()) {
  const roundEnd = room.status === 'finished' && room.finishedAt !== null ? room.finishedAt : now;
  const elapsedMinutes = room.startedAt !== null
    ? Math.max(1_000, roundEnd - room.startedAt) / 60_000
    : 0;
  return {
    id: player.id,
    name: player.name,
    combo: player.combo,
    lockedGarbage: player.lockedGarbage,
    pendingGarbage: player.pendingGarbage,
    pendingGarbageLockAt: player.pendingGarbageLockAt,
    score: player.score,
    wordsPlayed: player.wordsPlayed,
    linesSent: player.linesSent,
    kills: player.kills,
    wpm: elapsedMinutes ? Math.round(player.wordsPlayed / elapsedMinutes) : 0,
    status: player.status,
  };
}

export function publicState(room, selfId = null) {
  const players = [...room.players.values()].map((player) => publicPlayer(room, player));
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
    self: self ? { ...publicPlayer(room, self), fragments: [...self.fragments], targetMode: self.targetMode } : null,
  };
}
