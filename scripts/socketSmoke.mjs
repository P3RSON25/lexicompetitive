import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const url = 'http://127.0.0.1:3000';
const first = io(url, { transports: ['websocket'] });
const second = io(url, { transports: ['websocket'] });
const wordsByFragment = {
  th: 'the', he: 'the', in: 'in', en: 'end', nt: 'ant', re: 'red', er: 'her', an: 'an',
  ti: 'time', es: 'yes', on: 'on', at: 'at', se: 'see', nd: 'and', or: 'or', ar: 'are',
  al: 'all', te: 'ten', co: 'come', de: 'den', to: 'to', ra: 'ram', et: 'get', ed: 'red',
  it: 'it', sa: 'sat', em: 'empty', ro: 'road',
};

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
  const created = await ack(first, 'room:create', { name: 'Alice', mode: 'battle' });
  assert.equal(created.ok, true);
  const joined = await ack(second, 'room:join', { name: 'Bob', code: created.code });
  assert.equal(joined.ok, true);
  const playingStatePromise = new Promise((resolve) => {
    const handler = (state) => {
      if (state.status !== 'playing') return;
      first.off('room:state', handler);
      resolve(state);
    };
    first.on('room:state', handler);
  });
  const started = await ack(first, 'room:start', { code: created.code });
  assert.equal(started.ok, true);
  assert.equal(started.status, 'playing');
  assert.equal(started.state.status, 'playing');

  const playingState = await playingStatePromise;
  const playableWord = playingState.self.fragments.map((fragment) => wordsByFragment[fragment]).find(Boolean);
  assert.ok(playableWord);
  const accepted = await ack(first, 'word:submit', { word: playableWord });
  assert.equal(accepted.ok, true);

  const targetMode = await ack(first, 'player:target', { mode: 'random' });
  assert.equal(targetMode.ok, true);
  assert.equal(targetMode.targetMode, 'random');

  const result = new Promise((resolve) => first.once('word:result', resolve));
  first.emit('word:submit', { word: 'a' });
  const wordResult = await result;
  assert.equal(wordResult.accepted, false);
  assert.equal(wordResult.error, 'no_fragment');

  console.log(JSON.stringify({ room: created.code, players: 2, started: true, dictionaryValidation: 'local word accepted by validator' }));
} finally {
  first.disconnect();
  second.disconnect();
}
