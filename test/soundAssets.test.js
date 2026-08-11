import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const soundsDirectory = path.resolve('public', 'sounds');
const expectedSounds = [
  'third combo.wav',
  'sent 3gram.wav',
  'sent 2gram.wav',
  'sent 1gram.wav',
  'second combo.wav',
  'recieve 2gram pending with combo or 3gram.wav',
  'recieve 2gram pending.wav',
  'recieve 1gram pending.wav',
  'not real word entered.wav',
  'leave lobby.wav',
  'kill.wav',
  'key press.wav',
  'join lobby.wav',
  'first combo.wav',
  'died.wav',
  'alert pending garbage over 10.wav',
  'alert locked garbage over 15.wav',
  '5+ locked garbage recieve.wav',
  '5 and over combo.wav',
  '4 combo.wav',
  '3-5 locked garbage recieve.wav',
  '1-3 locked garbage recieve.wav',
];

test('all named sound effects are shipped as public assets', async () => {
  const files = await readdir(soundsDirectory);
  assert.equal(files.filter((file) => file.endsWith('.wav')).length, expectedSounds.length);
  for (const file of expectedSounds) {
    const details = await stat(path.join(soundsDirectory, file));
    assert.equal(details.isFile(), true, `${file} is not a file`);
    assert.ok(details.size > 0, `${file} is empty`);
  }
});
