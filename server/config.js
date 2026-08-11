const defaultWordsFile = 'C:\\Users\\wenyu\\Downloads\\word dictionary final.json';

export const config = {
  port: Number(process.env.PORT || 3000),
  wordsFile: process.env.WORDS_FILE || defaultWordsFile,
  maxPlayersPerRoom: Number(process.env.MAX_PLAYERS_PER_ROOM || 8),
};

export const modes = new Set(['battle']);
