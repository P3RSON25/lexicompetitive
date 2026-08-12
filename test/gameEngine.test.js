import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWord,
  createPlayer,
  createRoom,
  publicState,
  setTargetMode,
  startRoom,
  tickRoom,
} from '../server/gameEngine.js';

function createBattle() {
  const room = createRoom('ABCDE', 'p1', 'battle');
  room.players.set('p1', createPlayer('p1', 'One', () => 0));
  room.players.set('p2', createPlayer('p2', 'Two', () => 0));
  room.players.set('p3', createPlayer('p3', 'Three', () => 0));
  startRoom(room, 0, () => 0);
  return room;
}

test('one matching gram sends one pending line and rotates grams', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.fragments = ['th', 'zz', 'qq'];

  const result = applyWord(room, 'p1', 'THree', 1000, () => 0);

  assert.equal(result.accepted, true);
  assert.equal(result.event.matched, 1);
  assert.equal(result.event.totalLines, 1);
  assert.equal(result.event.outgoingLines, 1);
  assert.equal(player.combo, 0);
  assert.equal(player.linesSent, 1);
  assert.equal(room.players.get('p2').pendingGarbage, 1);
  assert.equal(room.players.get('p2').pendingAttackerId, 'p1');
  assert.equal(room.players.get('p2').pendingGarbageLockAt, 5000);
  assert.notDeepEqual(player.fragments, ['th', 'zz', 'qq']);
});

test('two-gram words build combo and three-gram words cash it out as AOE', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.fragments = ['th', 'he', 'zz'];

  const first = applyWord(room, 'p1', 'the', 1000, () => 0);
  player.fragments = ['th', 'he', 'zz'];
  const second = applyWord(room, 'p1', 'the', 1500, () => 0);

  assert.equal(first.event.totalLines, 4);
  assert.equal(first.event.comboAfter, 1);
  assert.equal(second.event.totalLines, 5);
  assert.equal(second.event.comboAfter, 2);
  assert.equal(player.combo, 2);

  player.fragments = ['th', 'he', 'in'];
  const aoe = applyWord(room, 'p1', 'thein', 2000, () => 0);

  assert.equal(aoe.event.matched, 3);
  assert.equal(aoe.event.totalLines, 8);
  assert.equal(aoe.event.aoe, true);
  assert.deepEqual(aoe.event.targetIds, ['p2', 'p3']);
  assert.equal(player.combo, 0);
  assert.equal(room.players.get('p2').pendingGarbage, 17);
  assert.equal(room.players.get('p3').pendingGarbage, 8);
});

test('two-gram combo bonus caps at four points', () => {
  const room = createBattle();
  const player = room.players.get('p1');

  for (let count = 1; count <= 5; count += 1) {
    player.fragments = ['th', 'he', 'zz'];
    const result = applyWord(room, 'p1', 'the', count * 1000, () => 0);
    assert.equal(result.event.comboAfter, Math.min(count, 4));
  }

  assert.equal(player.combo, 4);
  assert.equal(player.linesSent, 4 + 5 + 6 + 7 + 7);
});

test('pending garbage is canceled before excess is sent and never clears locked garbage', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.fragments = ['th', 'zz', 'qq'];
  player.pendingGarbage = 4;
  player.pendingGarbageLockAt = 5000;
  player.lockedGarbage = 6;

  const result = applyWord(room, 'p1', 'three', 1000, () => 0);

  assert.equal(result.event.cancelledPending, 1);
  assert.equal(result.event.defendedLocked, 0);
  assert.equal(result.event.outgoingLines, 0);
  assert.equal(player.pendingGarbage, 3);
  assert.equal(player.lockedGarbage, 6);
  assert.equal(room.players.get('p2').pendingGarbage, 0);
});

test('clean words defend locked garbage while still sending the full attack', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.fragments = ['th', 'zz', 'qq'];
  player.lockedGarbage = 6;

  const result = applyWord(room, 'p1', 'three', 1000, () => 0);

  assert.equal(result.event.defendedLocked, 1);
  assert.equal(result.event.cancelledPending, 0);
  assert.equal(result.event.outgoingLines, 1);
  assert.equal(player.lockedGarbage, 5);
  assert.equal(room.players.get('p2').pendingGarbage, 1);
});

test('KO, Equal, and Random target modes choose living opponents by locked garbage', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.fragments = ['th', 'zz', 'qq'];
  room.players.get('p2').lockedGarbage = 4;
  room.players.get('p3').lockedGarbage = 9;

  assert.equal(setTargetMode(room, 'p1', 'ko').accepted, true);
  let result = applyWord(room, 'p1', 'three', 1000, () => 0);
  assert.deepEqual(result.event.targetIds, ['p3']);

  player.fragments = ['th', 'zz', 'qq'];
  assert.equal(setTargetMode(room, 'p1', 'equal').accepted, true);
  result = applyWord(room, 'p1', 'three', 1100, () => 0);
  assert.deepEqual(result.event.targetIds, ['p2']);

  player.fragments = ['th', 'zz', 'qq'];
  assert.equal(setTargetMode(room, 'p1', 'random').accepted, true);
  result = applyWord(room, 'p1', 'three', 1200, () => 0);
  assert.deepEqual(result.event.targetIds, ['p2']);

  room.players.get('p3').status = 'eliminated';
  player.fragments = ['th', 'he', 'in'];
  result = applyWord(room, 'p1', 'thein', 1300, () => 0);
  assert.deepEqual(result.event.targetIds, ['p2']);
});

test('pending garbage extends its timer and locks at twenty lines', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  const target = room.players.get('p2');
  player.fragments = ['th', 'zz', 'qq'];
  target.pendingGarbage = 2;
  target.pendingGarbageLockAt = 5000;

  applyWord(room, 'p1', 'three', 2000, () => 0);
  assert.equal(target.pendingGarbage, 3);
  assert.equal(target.pendingGarbageLockAt, 5500);

  target.pendingGarbage = 20;
  target.pendingGarbageLockAt = 6000;
  target.pendingAttackerId = 'p1';
  target.pendingAttackerName = 'One';
  room.players.get('p3').status = 'eliminated';
  const events = tickRoom(room, 6000);

  assert.equal(target.lockedGarbage, 20);
  assert.equal(target.status, 'eliminated');
  assert.equal(room.status, 'finished');
  assert.equal(room.winnerId, 'p1');
  assert.equal(room.players.get('p1').kills, 1);
  assert.deepEqual(events.map((event) => event.type), ['garbageLocked', 'gameFinished']);
  assert.equal(events[0].attackerId, 'p1');
  assert.equal(events[0].attackerName, 'One');
});

test('pending garbage timer extends only eight times while the queue keeps growing', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  const target = room.players.get('p2');
  target.pendingGarbage = 1;
  target.pendingGarbageLockAt = 5_000;
  target.pendingGarbageExtensionCount = 0;

  for (let attack = 1; attack <= 9; attack += 1) {
    player.fragments = ['th', 'zz', 'qq'];
    applyWord(room, 'p1', 'three', 2_000 + attack * 10, () => 0);
  }

  assert.equal(target.pendingGarbage, 10);
  assert.equal(target.pendingGarbageExtensionCount, 8);
  assert.equal(target.pendingGarbageLockAt, 9_000);
});

test('public state keeps fragments private and exposes health queues to everyone', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.lockedGarbage = 3;
  player.pendingGarbage = 2;
  player.pendingGarbageLockAt = 4000;
  player.targetMode = 'equal';

  const state = publicState(room, 'p1');

  assert.equal(state.players[0].lockedGarbage, 3);
  assert.equal(state.players[0].pendingGarbage, 2);
  assert.equal('fragments' in state.players[0], false);
  assert.deepEqual(state.self.fragments, player.fragments);
  assert.equal(state.self.targetMode, 'equal');
});

test('public state reports round WPM and restarting a round clears round stats', () => {
  const room = createBattle();
  const player = room.players.get('p1');
  player.fragments = ['th', 'zz', 'qq'];

  applyWord(room, 'p1', 'three', 61_000, () => 0);
  room.status = 'finished';
  room.winnerId = 'p1';
  room.finishedAt = 61_000;
  const finished = publicState(room, 'p1');
  assert.equal(finished.self.wpm, 1);

  startRoom(room, 100_000, () => 0);
  assert.equal(room.status, 'playing');
  assert.equal(room.players.get('p1').wordsPlayed, 0);
  assert.equal(room.players.get('p1').kills, 0);
  assert.equal(publicState(room, 'p1').self.wpm, 0);
});

test('word submission reports the actual room lifecycle state', () => {
  const room = createRoom('ABCDE', 'p1', 'battle');
  room.players.set('p1', createPlayer('p1', 'One', () => 0));
  room.players.set('p2', createPlayer('p2', 'Two', () => 0));

  assert.equal(applyWord(room, 'p1', 'the').reason, 'room_not_playing');
  startRoom(room, 0, () => 0);
  room.status = 'finished';
  assert.equal(applyWord(room, 'p1', 'the').reason, 'room_finished');
});
