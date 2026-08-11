import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DictionaryService } from '../server/dictionaryService.js';

test('the local object dictionary is authoritative and case-insensitive', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lexi-dictionary-'));
  const wordsFile = path.join(directory, 'words.json');
  await writeFile(wordsFile, JSON.stringify({ Aardvark: 1, 'two words': 1, THREE: 1 }));

  try {
    const dictionary = new DictionaryService({ wordsFile });
    assert.deepEqual(await dictionary.validate('AARDVARK'), {
      valid: true,
      word: 'aardvark',
      source: 'local',
    });
    assert.deepEqual(await dictionary.validate('missing'), {
      valid: false,
      word: 'missing',
      source: 'local',
    });
    assert.equal((await dictionary.validate('two words')).source, 'shape');
    assert.equal(dictionary.stats().available, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
