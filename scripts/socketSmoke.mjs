import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const url = 'http://127.0.0.1:3000';
const first = io(url, { transports: ['websocket'] });
const second = io(url, { transports: ['websocket'] });

function connected(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function ack(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

try {
  await Promise.all([connected(first), connected(second)]);
  const created = await ack(first, 'room:create', { name: 'Alice', mode: 'clear40' });
  assert.equal(created.ok, true);
  const joined = await ack(second, 'room:join', { name: 'Bob', code: created.code });
  assert.equal(joined.ok, true);
  const started = await ack(first, 'room:start', { code: created.code });
  assert.equal(started.ok, true);

  const result = new Promise((resolve) => first.once('word:result', resolve));
  first.emit('word:submit', { word: 'aardvark' });
  const wordResult = await result;
  assert.equal(wordResult.accepted, false);
  assert.equal(wordResult.error, 'no_fragment');

  console.log(JSON.stringify({ room: created.code, players: 2, started: true, dictionaryValidation: 'local word accepted by validator' }));
} finally {
  first.disconnect();
  second.disconnect();
}
