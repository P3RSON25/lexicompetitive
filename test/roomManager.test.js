import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomManager } from '../server/roomManager.js';

test('players can create and join a room', () => {
  const manager = new RoomManager({ random: () => 0 });
  const room = manager.create('socket-a', 'Alice', 'battle');
  manager.join(room.code, 'socket-b', 'Bob');

  assert.equal(room.players.size, 2);
  assert.equal(manager.findBySocket('socket-b').code, room.code);
});

test('leaving promotes a new host and removes empty rooms', () => {
  const manager = new RoomManager({ random: () => 0 });
  const room = manager.create('socket-a', 'Alice', 'battle');
  manager.join(room.code, 'socket-b', 'Bob');

  manager.remove('socket-a');
  assert.equal(room.hostId, 'socket-b');
  manager.remove('socket-b');
  assert.equal([...manager.all()].length, 0);
});
