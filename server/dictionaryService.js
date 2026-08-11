import { readFile } from 'node:fs/promises';

export function normalizeWord(value) {
  if (typeof value !== 'string') return '';
  const word = value.trim().toLowerCase();
  return /^[a-z]+$/.test(word) ? word : '';
}

export class DictionaryService {
  constructor({ wordsFile }) {
    this.wordsFile = wordsFile;
    this.words = new Set();
    this.loadPromise = null;
    this.loadedFrom = null;
    this.loadError = null;
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

  async validate(value) {
    const word = normalizeWord(value);
    if (!word) return { valid: false, word: '', source: 'shape' };

    await this.load();
    if (this.loadError) return { valid: false, word, unavailable: true, source: 'local' };
    return { valid: this.words.has(word), word, source: 'local' };
  }

  stats() {
    return {
      words: this.words.size,
      loadedFrom: this.loadedFrom,
      available: !this.loadError,
    };
  }
}
