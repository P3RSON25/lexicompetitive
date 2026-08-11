import test from 'node:test';
import assert from 'node:assert/strict';

import { applyWord, createRoom, createPlayer, startRoom } from '../server/gameEngine.js';

test('a matching word clears lines and rotates fragments', () => {
  const room = createRoom('ABCDE', 'p1', 'clear40');
  const player = createPlayer('p1', 'One', () => 0);
  player.fragments = ['th', 'zz', 'qq'];
  room.players.set(player.id, player);
  startRoom(room, 1000, () => 0);
  room.players.get('p1').fragments = ['th', 'zz', 'qq'];

  const result = applyWord(room, 'p1', 'three', 2000, () => 0);

  assert.equal(result.accepted, true);
  assert.equal(result.event.lines, 1);
  assert.equal(room.players.get('p1').linesCleared, 1);
});

test('clear40 finishes when the player reaches the goal', () => {
  const room = createRoom('ABCDE', 'p1', 'clear40');
  const player = createPlayer('p1', 'One', () => 0);
  player.fragments = ['th', 'he', 'zz'];
  room.players.set(player.id, player);
  startRoom(room, 1000, () => 0);
  room.players.get('p1').fragments = ['th', 'he', 'zz'];
  room.players.get('p1').linesCleared = 39;

  const result = applyWord(room, 'p1', 'the', 2000, () => 0);

  assert.equal(result.roomFinished, true);
  assert.equal(room.winnerId, 'p1');
});
