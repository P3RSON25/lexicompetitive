import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const externalWordsFile = 'C:\\Users\\wenyu\\Downloads\\word dictionary final.json';
const bundledWordsFile = path.join(projectRoot, 'data', 'word dictionary final.json');
const configuredWordsFile = process.env.WORDS_FILE || externalWordsFile;
const defaultWordsFile = existsSync(configuredWordsFile) ? configuredWordsFile : bundledWordsFile;

export const config = {
  port: Number(process.env.PORT || 3000),
  wordsFile: defaultWordsFile,
  datamuseApiBaseUrl: process.env.DATAMUSE_API_BASE_URL || 'https://api.datamuse.com/words',
  maxPlayersPerRoom: Number(process.env.MAX_PLAYERS_PER_ROOM || 8),
};

export const modes = new Set(['battle']);
