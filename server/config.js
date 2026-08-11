const defaultWordsFile = 'C:\\Users\\wenyu\\Downloads\\word dictionary final.json';

export const config = {
  port: Number(process.env.PORT || 3000),
  wordsFile: process.env.WORDS_FILE || defaultWordsFile,
  dictionaryApiBaseUrl: process.env.DICTIONARY_API_URL || 'https://api.dictionaryapi.dev/api/v2/entries/en',
  apiCacheTtlMs: Number(process.env.API_CACHE_TTL_MS || 24 * 60 * 60 * 1000),
  unavailableCacheTtlMs: Number(process.env.UNAVAILABLE_CACHE_TTL_MS || 5_000),
  apiCacheMaxEntries: Number(process.env.API_CACHE_MAX_ENTRIES || 20_000),
  maxPlayersPerRoom: Number(process.env.MAX_PLAYERS_PER_ROOM || 8),
  roomCodeLength: 5,
  battleTargetLines: 40,
  timedModeMs: 2 * 60 * 1000,
};

export const modes = new Set(['battle', 'clear40', 'timed2m']);
