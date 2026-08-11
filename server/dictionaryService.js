import { readFile } from 'node:fs/promises';

export function normalizeWord(value) {
  if (typeof value !== 'string') return '';
  const word = value.trim().toLowerCase();
  return /^[a-z]+$/.test(word) ? word : '';
}

export class DictionaryService {
  constructor({ wordsFile, datamuseApiBaseUrl = 'https://api.datamuse.com/words', fetchImpl = fetch }) {
    this.wordsFile = wordsFile;
    this.datamuseApiBaseUrl = datamuseApiBaseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.words = new Set();
    this.loadPromise = null;
    this.loadedFrom = null;
    this.loadError = null;
    this.lookupPromises = new Map();
    this.lookupResults = new Map();
  }

  async load() {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = await readFile(this.wordsFile, 'utf8');
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
        const candidates = Array.isArray(parsed) ? parsed : Object.keys(parsed);
        for (const candidate of candidates) {
          const word = normalizeWord(candidate);
          if (word) this.words.add(word);
        }
        this.loadedFrom = this.wordsFile;
      } catch (error) {
        this.loadedFrom = 'unavailable';
        this.loadError = error;
      }
      return this.words.size;
    })();
    return this.loadPromise;
  }

  #lookupExact(word) {
    const cached = this.lookupResults.get(word);
    if (cached) return Promise.resolve(cached);

    const pending = this.lookupPromises.get(word);
    if (pending) return pending;

    const lookup = (async () => {
      try {
        const url = `${this.datamuseApiBaseUrl}?sp=${encodeURIComponent(word)}&max=1`;
        const response = await this.fetchImpl(url);
        if (response.status !== 200) return { exact: false, unavailable: true };
        const results = await response.json();
        return {
          exact: Array.isArray(results) && results[0]?.word === word,
          unavailable: false,
        };
      } catch {
        return { exact: false, unavailable: true };
      }
    })();

    this.lookupPromises.set(word, lookup);
    return lookup.then((result) => {
      this.lookupPromises.delete(word);
      this.lookupResults.set(word, result);
      return result;
    });
  }

  async validate(value) {
    const word = normalizeWord(value);
    if (!word) return { valid: false, word: '', source: 'shape' };

    await this.load();
    if (this.loadError) return { valid: false, word, unavailable: true, source: 'local' };
    if (this.words.has(word)) return { valid: true, word, source: 'local' };

    const lookup = await this.#lookupExact(word);
    if (lookup.exact) {
      this.words.add(word);
      return { valid: true, word, source: 'datamuse' };
    }
    return {
      valid: false,
      word,
      source: 'datamuse',
      ...(lookup.unavailable ? { unavailable: true } : {}),
    };
  }

  stats() {
    return {
      words: this.words.size,
      loadedFrom: this.loadedFrom,
      available: !this.loadError,
      datamuseCacheEntries: this.lookupResults.size,
    };
  }
}
