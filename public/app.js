const socket = io();

const $ = (selector) => document.querySelector(selector);
const lobby = $('#lobby');
const room = $('#room');
const status = $('#status');
const fragments = $('#fragments');
const players = $('#players');
const opponents = $('#opponents');
const eventLog = $('#event-log');
const board = $('#board');
const wordInput = $('#word-input');
const roundResult = $('#round-result');
const roundResultTitle = $('#round-result-title');
const roundResultWpm = $('#round-result-wpm');
const roundStartButton = $('#round-start-button');
const targetButtons = [...document.querySelectorAll('[data-target]')];
const boardCells = [];
const ROWS = 20;
const COLUMNS = 10;
let currentState = null;

const SOUND_FILES = {
  comboFirst: 'first combo.wav',
  comboSecond: 'second combo.wav',
  comboThird: 'third combo.wav',
  comboFourth: '4 combo.wav',
  comboFivePlus: '5 and over combo.wav',
  sentOneGram: 'sent 1gram.wav',
  sentTwoGram: 'sent 2gram.wav',
  sentThreeGram: 'sent 3gram.wav',
  receiveOneGram: 'recieve 1gram pending.wav',
  receiveTwoGram: 'recieve 2gram pending.wav',
  receiveTwoGramCombo: 'recieve 2gram pending with combo or 3gram.wav',
  lockedOneToThree: '1-3 locked garbage recieve.wav',
  lockedFourToFive: '3-5 locked garbage recieve.wav',
  lockedFivePlus: '5+ locked garbage recieve.wav',
  pendingOverTen: 'alert pending garbage over 10.wav',
  lockedOverFifteen: 'alert locked garbage over 15.wav',
  invalidWord: 'not real word entered.wav',
  joinLobby: 'join lobby.wav',
  leaveLobby: 'leave lobby.wav',
  gameStart: 'game start.wav',
  kill: 'kill.wav',
  keyPress: 'key press.wav',
  died: 'died.wav',
};

const SOUND_VOLUMES = {
  keyPress: 0.22,
  invalidWord: 0.45,
  joinLobby: 0.5,
  leaveLobby: 0.5,
  pendingOverTen: 0.55,
  lockedOverFifteen: 0.6,
  died: 0.65,
  kill: 0.65,
};

class SoundManager {
  constructor(files) {
    this.files = files;
    this.active = new Set();
  }

  play(name) {
    const file = this.files[name];
    if (!file) return;
    const audio = new Audio(`/sounds/${encodeURIComponent(file)}`);
    audio.preload = 'auto';
    audio.volume = SOUND_VOLUMES[name] ?? 0.5;
    this.active.add(audio);
    audio.addEventListener('ended', () => this.active.delete(audio), { once: true });
    const playback = audio.play();
    if (playback?.catch) playback.catch(() => this.active.delete(audio));
  }
}

const sounds = new SoundManager(SOUND_FILES);

for (let index = 0; index < ROWS * COLUMNS; index += 1) {
  const cell = document.createElement('span');
  cell.className = 'board-cell';
  cell.style.setProperty('--cell-index', index);
  boardCells.push(cell);
}
board.replaceChildren(...boardCells);

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function showRoom() {
  document.body.classList.add('in-room');
  lobby.hidden = true;
  room.hidden = false;
}

function showLobby() {
  document.body.classList.remove('in-room');
  lobby.hidden = false;
  room.hidden = true;
}

function addEvent(message) {
  const line = document.createElement('div');
  line.textContent = message;
  eventLog.prepend(line);
  while (eventLog.children.length > 10) eventLog.lastElementChild.remove();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function comboSoundName(combo) {
  if (combo >= 5) return 'comboFivePlus';
  return {
    1: 'comboFirst',
    2: 'comboSecond',
    3: 'comboThird',
    4: 'comboFourth',
  }[combo];
}

function playWordSounds(event) {
  const isSender = event.playerId === socket.id;
  const isTarget = event.targetIds?.includes(socket.id);

  if (isSender) {
    const combo = event.matched === 2 ? event.comboAfter : event.comboBonus;
    if (combo > 0) sounds.play(comboSoundName(combo));
    if (event.outgoingLines > 0) {
      sounds.play({ 1: 'sentOneGram', 2: 'sentTwoGram', 3: 'sentThreeGram' }[event.matched]);
    }
  }

  if (event.outgoingLines <= 0) return;

  if (isTarget) {
    if (event.matched === 1) {
      sounds.play('receiveOneGram');
    } else if (event.matched === 2 && event.comboBefore > 0) {
      sounds.play('receiveTwoGramCombo');
    } else if (event.matched === 2) {
      sounds.play('receiveTwoGram');
    } else if (event.matched === 3) {
      sounds.play('receiveTwoGramCombo');
    }
  }
}

function playGarbageLockedSounds(event) {
  if (event.playerId === socket.id) {
    if (event.lines <= 3) sounds.play('lockedOneToThree');
    else if (event.lines <= 5) sounds.play('lockedFourToFive');
    else sounds.play('lockedFivePlus');
  }
  if (event.eliminated) {
    if (event.playerId === socket.id) sounds.play('died');
    if (event.attackerId === socket.id) sounds.play('kill');
  }
}

function renderBoard(lockedGarbage = 0) {
  const filledRows = Math.min(ROWS, Math.max(0, Number(lockedGarbage) || 0));
  boardCells.forEach((cell, index) => {
    const row = Math.floor(index / COLUMNS);
    cell.classList.toggle('filled', row >= ROWS - filledRows);
  });
}

function renderFragments(nextFragments = []) {
  fragments.replaceChildren(...nextFragments.map((fragment) => {
    const element = document.createElement('span');
    element.textContent = fragment.toUpperCase();
    return element;
  }));
}

function renderTargetMode(targetMode = 'ko', canChange = false) {
  targetButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.target === targetMode);
    button.disabled = !canChange;
  });
}

function healthPercent(lockedGarbage) {
  return Math.max(0, Math.round(100 - (Math.max(0, lockedGarbage) / ROWS) * 100));
}

function renderOpponentCards(state) {
  const selfId = state.self?.id;
  const otherPlayers = state.players.filter((player) => player.id !== selfId);
  if (otherPlayers.length === 0) {
    opponents.innerHTML = '<div class="empty-opponents">Waiting for an opponent to join...</div>';
    return;
  }

  opponents.replaceChildren(...otherPlayers.map((player) => {
    const card = document.createElement('article');
    card.className = 'opponent-card';
    card.dataset.status = player.status;
    const health = healthPercent(player.lockedGarbage);
    const pending = Math.min(100, Math.round((player.pendingGarbage / ROWS) * 100));
    card.innerHTML = `
      <div class="opponent-heading">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${player.status === 'playing' ? `${health}%` : 'OUT'}</span>
      </div>
      <div class="opponent-track"><span style="width:${health}%"></span></div>
      <div class="opponent-meta"><span>${player.lockedGarbage}/20</span><span class="pending-label">+${player.pendingGarbage}</span></div>
      <div class="opponent-pending-track"><span style="width:${pending}%"></span></div>
    `;
    return card;
  }));
}

function renderPlayers(state) {
  $('#player-count').textContent = state.players.length;
  const selfId = state.self?.id;
  players.replaceChildren(...state.players.map((player) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.dataset.status = player.status;
    if (player.id === selfId) row.dataset.self = 'true';
    row.innerHTML = `
      <div><strong>${escapeHtml(player.name)}</strong><span>${player.status === 'playing' ? `${player.lockedGarbage}/20` : 'OUT'}</span></div>
      <b>${player.pendingGarbage}</b>
    `;
    return row;
  }));
}

function renderState(state) {
  const previousStatus = currentState?.status;
  const previousSelf = currentState?.self;
  currentState = state;
  showRoom();

  const self = state.self;
  const canPlay = state.status === 'playing' && self?.status === 'playing';
  const canChangeTarget = state.status !== 'finished' && self?.status === 'playing';
  const lockedGarbage = self?.lockedGarbage || 0;
  const pendingGarbage = self?.pendingGarbage || 0;

  if (previousSelf && self) {
    if (previousSelf.pendingGarbage <= 10 && pendingGarbage > 10) sounds.play('pendingOverTen');
    if (previousSelf.lockedGarbage <= 15 && lockedGarbage > 15) sounds.play('lockedOverFifteen');
  }

  $('#room-code').textContent = state.code;
  $('#room-status').textContent = state.status.toUpperCase();
  $('#arena-state').textContent = state.status === 'playing'
    ? (self?.status === 'eliminated' ? 'OUT' : 'LIVE')
    : state.status === 'finished' ? 'DONE' : 'WAITING';
  $('#start-button').hidden = state.hostId !== socket.id || state.status !== 'lobby';
  $('#start-button').disabled = state.players.length < 2;
  roundStartButton.hidden = state.hostId !== socket.id || state.status !== 'finished';
  roundStartButton.disabled = state.players.length < 2;
  roundResult.hidden = state.status !== 'finished';
  $('#word-input').disabled = !canPlay;
  $('#word-form button').disabled = !canPlay;
  renderTargetMode(self?.targetMode, canChangeTarget);
  renderFragments(self?.fragments || []);
  renderBoard(lockedGarbage);
  $('#locked-lines').textContent = lockedGarbage;
  $('#health-percent').textContent = `${healthPercent(lockedGarbage)}%`;
  $('#pending-count').textContent = pendingGarbage;
  $('#pending-fill').style.height = `${Math.min(100, Math.round((pendingGarbage / ROWS) * 100))}%`;
  $('#combo').textContent = self?.combo || 0;
  $('#kills').textContent = self?.kills || 0;
  $('#lines-sent').textContent = self?.linesSent || 0;
  $('#words-played').textContent = self?.wordsPlayed || 0;
  renderOpponentCards(state);
  renderPlayers(state);

  if (state.status === 'finished') {
    const result = state.winnerId === socket.id ? 'win' : state.winnerId ? 'lose' : 'draw';
    roundResult.dataset.result = result;
    roundResultTitle.textContent = result === 'win' ? 'WIN' : result === 'lose' ? 'LOSE' : 'DRAW';
    roundResultWpm.textContent = self?.wpm || 0;
    setStatus(result === 'win' ? 'WIN' : result === 'lose' ? 'LOSE' : 'DRAW', result === 'win' ? 'success' : 'error');
  } else if (previousStatus !== state.status) {
    setStatus(state.status === 'playing' ? 'Battle live. Find a gram and attack.' : 'Waiting for the host to start the battle.');
  }

  updatePendingTimer();
  if (canPlay && document.activeElement !== wordInput) wordInput.focus();
}

function updatePendingTimer() {
  const pendingLockAt = currentState?.self?.pendingGarbageLockAt;
  if (!currentState?.self || currentState.self.pendingGarbage <= 0 || !pendingLockAt) {
    $('#pending-timer').textContent = 'CLEAR';
    return;
  }
  const remaining = Math.max(0, pendingLockAt - Date.now());
  $('#pending-timer').textContent = `${(remaining / 1000).toFixed(1)}S`;
}

function errorLabel(error) {
  return {
    invalid_word: 'NOT A WORD',
    dictionary_unavailable: 'NO DICTIONARY',
    no_fragment: 'NO MATCH',
    need_opponent: 'NEED OPPONENT',
    invalid_target_mode: 'BAD TARGET',
    room_finished: 'MATCH DONE',
    room_not_playing: 'NOT LIVE',
    player_not_playing: 'OUT',
  }[error] || String(error || 'Request failed').replaceAll('_', ' ');
}

function handleRoomResponse(response) {
  if (response?.state) renderState(response.state);
  if (!response?.ok) setStatus(errorLabel(response?.error), 'error');
}

socket.on('connect', () => {
  if (!currentState) setStatus('READY', 'success');
});

socket.on('disconnect', () => setStatus('OFFLINE', 'error'));
socket.on('room:state', renderState);

socket.on('game:event', (event) => {
  if (event.type === 'wordAccepted') {
    playWordSounds(event);
    let message = `${event.playerName} +${event.totalLines}${event.aoe ? ' AOE' : ''}`;
    if (!event.outgoingLines) message += ' DEF';
    if (event.cancelledPending) message += ` -${event.cancelledPending}`;
    if (event.defendedLocked) message += ` /${event.defendedLocked}`;
    if (event.comboBonus) message += ` C${event.comboBonus}`;
    if (event.gramOnly) message += ' HALF';
    addEvent(message);
  } else if (event.type === 'garbageLocked') {
    playGarbageLockedSounds(event);
    addEvent(`${event.playerName} +${event.lines}${event.eliminated ? ' OUT' : ''}`);
  } else if (event.type === 'gameFinished') {
    addEvent(event.winnerId ? 'DONE' : 'DRAW');
  } else if (event.type === 'gameStarted') {
    sounds.play('gameStart');
    addEvent('LIVE');
  } else if (event.type === 'playerJoined') {
    addEvent('+ PLAYER');
  } else if (event.type === 'playerLeft') {
    addEvent('- PLAYER');
  }
});

socket.on('word:result', (result) => {
  if (!result.accepted) {
    if (result.error === 'invalid_word') sounds.play('invalidWord');
    setStatus(errorLabel(result.error), 'error');
    return;
  }
  const details = result.cancelledPending
    ? ` -${result.cancelledPending}`
    : result.defendedLocked ? ` /${result.defendedLocked}` : '';
  setStatus(`+${result.lines}${details}`, 'success');
});

$('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  socket.emit('room:create', { name: $('#create-name').value, mode: 'battle' }, (response) => {
    if (response?.ok) sounds.play('joinLobby');
    handleRoomResponse(response);
  });
});

$('#join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  socket.emit('room:join', {
    name: $('#join-name').value,
    code: $('#join-code').value,
  }, (response) => {
    if (response?.ok) sounds.play('joinLobby');
    handleRoomResponse(response);
  });
});

$('#start-button').addEventListener('click', () => {
  startRound();
});

function startRound() {
  socket.emit('room:start', { code: currentState?.code }, handleRoomResponse);
}

roundStartButton.addEventListener('click', startRound);

$('#leave-button').addEventListener('click', () => {
  sounds.play('leaveLobby');
  socket.emit('room:leave');
  currentState = null;
  showLobby();
  setStatus('READY');
});

targetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    socket.emit('player:target', { mode: button.dataset.target }, handleRoomResponse);
  });
});

$('#word-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const word = wordInput.value;
  if (!word.trim()) return;
  wordInput.value = '';
  socket.emit('word:submit', { word });
});

wordInput.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.key === 'Tab') return;
  sounds.play('keyPress');
});

setInterval(updatePendingTimer, 100);
renderBoard();
