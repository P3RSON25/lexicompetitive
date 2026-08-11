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
    const dictionary = new DictionaryService({
      wordsFile,
      fetchImpl: async () => ({ status: 200, json: async () => [] }),
    });
    assert.deepEqual(await dictionary.validate('AARDVARK'), {
      valid: true,
      word: 'aardvark',
      source: 'local',
    });
    assert.deepEqual(await dictionary.validate('missing'), {
      valid: false,
      word: 'missing',
      source: 'datamuse',
    });
    assert.equal((await dictionary.validate('two words')).source, 'shape');
    assert.equal(dictionary.stats().available, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Datamuse results require an exact word and exact matches become global entries', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lexi-datamuse-'));
  const wordsFile = path.join(directory, 'words.json');
  const requests = [];
  await writeFile(wordsFile, JSON.stringify({ known: 1 }));

  try {
    const dictionary = new DictionaryService({
      wordsFile,
      datamuseApiBaseUrl: 'https://api.datamuse.com/words',
      fetchImpl: async (url) => {
        requests.push(url);
        const word = new URL(url).searchParams.get('sp');
        const result = word === 'newword' ? [{ word: 'newword', score: 1000 }] : [{ word: 'samca', score: 1003 }];
        return { status: 200, json: async () => result };
      },
    });

    assert.deepEqual(await dictionary.validate('newword'), {
      valid: true,
      word: 'newword',
      source: 'datamuse',
    });
    assert.deepEqual(await dictionary.validate('NEWWORD'), {
      valid: true,
      word: 'newword',
      source: 'local',
    });
    assert.deepEqual(await dictionary.validate('sadca'), {
      valid: false,
      word: 'sadca',
      source: 'datamuse',
    });
    await dictionary.validate('sadca');

    assert.deepEqual(requests, [
      'https://api.datamuse.com/words?sp=newword&max=1',
      'https://api.datamuse.com/words?sp=sadca&max=1',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
