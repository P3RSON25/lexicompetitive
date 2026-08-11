import { createPlayer, createRoom, startRoom } from './gameEngine.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeName(value) {
  const name = typeof value === 'string' ? value.trim().slice(0, 20) : '';
  return name || 'Player';
}

export class RoomManager {
  constructor({ maxPlayers = 8, random = Math.random } = {}) {
    this.maxPlayers = maxPlayers;
    this.random = random;
    this.rooms = new Map();
  }

  #code(length = 5) {
    let code;
    do {
      code = Array.from({ length }, () => ALPHABET[Math.floor(this.random() * ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  create(socketId, name, mode) {
    const room = createRoom(this.#code(), socketId, mode);
    room.players.set(socketId, createPlayer(socketId, normalizeName(name), this.random));
    this.rooms.set(room.code, room);
    return room;
  }

  join(code, socketId, name) {
    const room = this.rooms.get(String(code || '').trim().toUpperCase());
    if (!room) throw new Error('room_not_found');
    if (room.status !== 'lobby') throw new Error('room_already_started');
    if (room.players.size >= this.maxPlayers) throw new Error('room_full');
    room.players.set(socketId, createPlayer(socketId, normalizeName(name), this.random));
    return room;
  }

  start(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('room_not_found');
    if (room.hostId !== socketId) throw new Error('host_only');
    if (room.status !== 'lobby') throw new Error('room_already_started');
    if (room.players.size < 2) throw new Error('need_opponent');
    startRoom(room, Date.now(), this.random);
    return room;
  }

  findBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return null;
  }

  remove(socketId) {
    const room = this.findBySocket(socketId);
    if (!room) return null;
    room.players.delete(socketId);
    if (room.hostId === socketId) room.hostId = room.players.keys().next().value || null;
    if (room.players.size === 0) this.rooms.delete(room.code);
    return room;
  }

  all() {
    return this.rooms.values();
  }
}
