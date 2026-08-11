import { readFile } from 'node:fs/promises';

const FALLBACK_WORDS = [
  'apple', 'attack', 'battle', 'blue', 'earth', 'equal', 'game', 'green',
  'hello', 'heart', 'learn', 'letter', 'orange', 'planet', 'random',
  'read', 'red', 'score', 'start', 'stone', 'target', 'the', 'there',
  'three', 'thread', 'tree', 'water', 'word',
];

export function normalizeWord(value) {
  if (typeof value !== 'string') return '';
  const word = value.trim().toLowerCase();
  return /^[a-z]+$/.test(word) ? word : '';
}

export class DictionaryService {
  constructor({ wordsFile, apiBaseUrl, cacheTtlMs, unavailableCacheTtlMs, maxCacheEntries, fetchImpl = fetch }) {
    this.wordsFile = wordsFile;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.cacheTtlMs = cacheTtlMs;
    this.unavailableCacheTtlMs = unavailableCacheTtlMs;
    this.maxCacheEntries = maxCacheEntries;
    this.fetchImpl = fetchImpl;
    this.words = new Set();
    this.cache = new Map();
    this.loadPromise = null;
    this.loadedFrom = 'fallback';
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
      } catch {
        for (const word of FALLBACK_WORDS) this.words.add(word);
        this.loadedFrom = 'fallback';
      }
      return this.words.size;
    })();
    return this.loadPromise;
  }

  #getCached(word) {
    const entry = this.cache.get(word);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(word);
      return null;
    }
    this.cache.delete(word);
    this.cache.set(word, entry);
    return entry.result;
  }

  #setCached(word, result, ttlMs) {
    this.cache.delete(word);
    this.cache.set(word, { result, expiresAt: Date.now() + ttlMs });
    while (this.cache.size > this.maxCacheEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  async validate(value) {
    const word = normalizeWord(value);
    if (!word) return { valid: false, word: '', source: 'shape' };

    await this.load();
    if (this.words.has(word)) return { valid: true, word, source: 'local' };

    const cached = this.#getCached(word);
    if (cached) return { ...cached, word, source: 'cache' };

    let result;
    let ttl = this.cacheTtlMs;
    try {
      const response = await this.fetchImpl(`${this.apiBaseUrl}/${encodeURIComponent(word)}`);
      if (response.status === 200) {
        result = { valid: true, status: response.status };
      } else if (response.status === 404) {
        result = { valid: false, status: response.status };
      } else {
        result = { valid: false, unavailable: true, status: response.status };
        ttl = this.unavailableCacheTtlMs;
      }
    } catch {
      result = { valid: false, unavailable: true };
      ttl = this.unavailableCacheTtlMs;
    }

    this.#setCached(word, result, ttl);
    return { ...result, word, source: 'api' };
  }

  stats() {
    return {
      words: this.words.size,
      loadedFrom: this.loadedFrom,
      cacheEntries: this.cache.size,
    };
  }
}
