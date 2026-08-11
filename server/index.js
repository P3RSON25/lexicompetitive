import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

import { config, modes } from './config.js';
import { DictionaryService } from './dictionaryService.js';
import { applyWord, publicState, setTargetMode, tickRoom } from './gameEngine.js';
import { RoomManager } from './roomManager.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new RoomManager({ maxPlayers: config.maxPlayersPerRoom });
const dictionary = new DictionaryService({
  wordsFile: config.wordsFile,
});

app.use(express.json());
app.use(express.static(publicDir));
app.get('/api/health', async (_request, response) => {
  await dictionary.load();
  response.json({ ok: true, dictionary: dictionary.stats(), rooms: [...rooms.all()].length });
});

function reply(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

function emitRoomState(room) {
  if (!room || !rooms.rooms.has(room.code)) return;
  for (const player of room.players.values()) {
    io.to(player.id).emit('room:state', publicState(room, player.id));
  }
}

function emitRoomEvent(room, event) {
  if (room && rooms.rooms.has(room.code)) io.to(room.code).emit('game:event', event);
}

function joinSocketRoom(socket, room) {
  socket.join(room.code);
  emitRoomState(room);
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload = {}, callback) => {
    try {
      const mode = modes.has(payload.mode) ? payload.mode : 'battle';
      const room = rooms.create(socket.id, payload.name, mode);
      joinSocketRoom(socket, room);
      reply(callback, { ok: true, code: room.code });
    } catch {
      reply(callback, { ok: false, error: 'room_create_failed' });
    }
  });

  socket.on('room:join', (payload = {}, callback) => {
    try {
      const room = rooms.join(payload.code, socket.id, payload.name);
      joinSocketRoom(socket, room);
      reply(callback, { ok: true, code: room.code });
      emitRoomEvent(room, { type: 'playerJoined' });
    } catch (error) {
      reply(callback, { ok: false, error: error.message || 'room_join_failed' });
    }
  });

  socket.on('room:start', (payload = {}, callback) => {
    try {
      const room = rooms.start(String(payload.code || '').toUpperCase(), socket.id);
      emitRoomEvent(room, { type: 'gameStarted', mode: room.mode });
      emitRoomState(room);
      reply(callback, { ok: true });
    } catch (error) {
      reply(callback, { ok: false, error: error.message || 'room_start_failed' });
    }
  });

  socket.on('player:target', (payload = {}, callback) => {
    const room = rooms.findBySocket(socket.id);
    if (!room) return reply(callback, { ok: false, error: 'not_in_room' });
    const result = setTargetMode(room, socket.id, payload.mode);
    if (!result.accepted) return reply(callback, { ok: false, error: result.reason });
    emitRoomState(room);
    reply(callback, { ok: true, targetMode: result.targetMode });
  });

  socket.on('word:submit', async (payload = {}, callback) => {
    const room = rooms.findBySocket(socket.id);
    if (!room) return reply(callback, { ok: false, error: 'not_in_room' });

    const validation = await dictionary.validate(payload.word);
    if (!validation.valid) {
      const error = validation.unavailable ? 'dictionary_unavailable' : 'invalid_word';
      socket.emit('word:result', { accepted: false, error });
      return reply(callback, { ok: false, error });
    }

    const result = applyWord(room, socket.id, validation.word, Date.now());
    if (result.tickEvents?.length) {
      for (const event of result.tickEvents) emitRoomEvent(room, event);
      emitRoomState(room);
    }
    if (!result.accepted) {
      socket.emit('word:result', { accepted: false, error: result.reason });
      return reply(callback, { ok: false, error: result.reason });
    }

    socket.emit('word:result', { accepted: true, word: validation.word, ...result.event });
    emitRoomEvent(room, result.event);
    emitRoomState(room);
    reply(callback, { ok: true, ...result.event });
  });

  socket.on('room:leave', () => {
    const room = rooms.remove(socket.id);
    if (!room) return;
    socket.leave(room.code);
    emitRoomEvent(room, { type: 'playerLeft' });
    emitRoomState(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.remove(socket.id);
    if (!room) return;
    emitRoomEvent(room, { type: 'playerLeft' });
    emitRoomState(room);
  });
});

setInterval(() => {
  for (const room of rooms.all()) {
    const events = tickRoom(room);
    if (events.length > 0) {
      for (const event of events) emitRoomEvent(room, event);
      emitRoomState(room);
    }
  }
}, 250);

server.listen(config.port, () => {
  console.log(`Word game server listening on http://localhost:${config.port}`);
  console.log(`Dictionary path: ${config.wordsFile}`);
});
