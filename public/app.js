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
const targetButtons = [...document.querySelectorAll('[data-target]')];
const boardCells = [];
const ROWS = 20;
const COLUMNS = 10;
let currentState = null;

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

function pluralize(value, singular = 'line', plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
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
        <span>${player.status === 'playing' ? `${health}% health` : player.status}</span>
      </div>
      <div class="opponent-track"><span style="width:${health}%"></span></div>
      <div class="opponent-meta"><span>${player.lockedGarbage}/20 locked</span><span class="pending-label">+${player.pendingGarbage} pending</span></div>
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
      <div><strong>${escapeHtml(player.name)}</strong><span>${player.status === 'playing' ? `${player.lockedGarbage}/20 locked` : player.status}</span></div>
      <b>${player.pendingGarbage}</b>
    `;
    return row;
  }));
}

function renderState(state) {
  const previousStatus = currentState?.status;
  currentState = state;
  showRoom();

  const self = state.self;
  const canPlay = state.status === 'playing' && self?.status === 'playing';
  const canChangeTarget = state.status !== 'finished' && self?.status === 'playing';
  const lockedGarbage = self?.lockedGarbage || 0;
  const pendingGarbage = self?.pendingGarbage || 0;

  $('#room-code').textContent = state.code;
  $('#room-status').textContent = state.status.toUpperCase();
  $('#arena-state').textContent = state.status === 'playing'
    ? (self?.status === 'eliminated' ? 'ELIMINATED' : 'LIVE PVP')
    : state.status === 'finished' ? 'MATCH COMPLETE' : 'WAITING FOR PLAYERS';
  $('#start-button').hidden = state.hostId !== socket.id || state.status !== 'lobby';
  $('#start-button').disabled = state.players.length < 2;
  $('#word-input').disabled = !canPlay;
  $('#word-form button').disabled = !canPlay;
  renderTargetMode(self?.targetMode, canChangeTarget);
  renderFragments(self?.fragments || []);
  renderBoard(lockedGarbage);
  $('#locked-lines').textContent = lockedGarbage;
  $('#health-percent').textContent = `${healthPercent(lockedGarbage)}% HEALTH`;
  $('#pending-count').textContent = pendingGarbage;
  $('#pending-fill').style.height = `${Math.min(100, Math.round((pendingGarbage / ROWS) * 100))}%`;
  $('#combo').textContent = self?.combo || 0;
  $('#lines-sent').textContent = self?.linesSent || 0;
  $('#words-played').textContent = self?.wordsPlayed || 0;
  renderOpponentCards(state);
  renderPlayers(state);

  if (state.status === 'finished') {
    setStatus(state.winnerId === socket.id ? 'Victory. You are the last board standing.' : 'Match complete.', 'success');
  } else if (previousStatus !== state.status) {
    setStatus(state.status === 'playing' ? 'Battle live. Find a gram and attack.' : 'Waiting for the host to start the battle.');
  }

  updatePendingTimer();
  if (canPlay && document.activeElement !== wordInput) wordInput.focus();
}

function updatePendingTimer() {
  const pendingLockAt = currentState?.self?.pendingGarbageLockAt;
  if (!currentState?.self || currentState.self.pendingGarbage <= 0 || !pendingLockAt) {
    $('#pending-timer').textContent = 'CLEAR TO HOLD';
    return;
  }
  const remaining = Math.max(0, pendingLockAt - Date.now());
  $('#pending-timer').textContent = `LOCKS IN ${(remaining / 1000).toFixed(1)}S`;
}

function errorLabel(error) {
  return {
    invalid_word: 'That word is not in the local dictionary.',
    dictionary_unavailable: 'The local dictionary could not be loaded.',
    no_fragment: 'That word does not contain one of your grams.',
    need_opponent: 'A PVP room needs at least one opponent.',
    invalid_target_mode: 'Choose a valid targeting mode.',
    room_finished: 'The match is already over.',
    player_not_playing: 'You are out of this match.',
  }[error] || String(error || 'Request failed').replaceAll('_', ' ');
}

function handleRoomResponse(response) {
  if (!response?.ok) setStatus(errorLabel(response?.error), 'error');
}

socket.on('connect', () => {
  if (!currentState) setStatus('Connected. Create or join a PVP room.', 'success');
});

socket.on('disconnect', () => setStatus('Connection lost. Reconnecting...', 'error'));
socket.on('room:state', renderState);

socket.on('game:event', (event) => {
  if (event.type === 'wordAccepted') {
    const route = event.aoe
      ? 'to every living opponent'
      : event.targetIds?.length ? 'to one opponent' : 'into defense';
    let message = `${event.playerName} used ${event.word}: ${pluralize(event.totalLines)} ${route}.`;
    if (event.cancelledPending) message += ` Canceled ${pluralize(event.cancelledPending, 'pending line')}.`;
    if (event.defendedLocked) message += ` Cleared ${pluralize(event.defendedLocked, 'locked line')}.`;
    if (event.comboBonus) message += ` Combo +${event.comboBonus}.`;
    addEvent(message);
  } else if (event.type === 'garbageLocked') {
    addEvent(`${event.playerName} locked ${pluralize(event.lines)}.`);
    if (event.eliminated) addEvent(`${event.playerName} has been eliminated.`);
  } else if (event.type === 'gameFinished') {
    addEvent(event.winnerId ? 'The match is over.' : 'The match ended with no survivor.');
  } else if (event.type === 'gameStarted') {
    addEvent('Battle started.');
  } else if (event.type === 'playerJoined') {
    addEvent('A new combatant joined the room.');
  } else if (event.type === 'playerLeft') {
    addEvent('A combatant left the room.');
  }
});

socket.on('word:result', (result) => {
  if (!result.accepted) {
    setStatus(errorLabel(result.error), 'error');
    return;
  }
  const details = result.cancelledPending
    ? ` Canceled ${pluralize(result.cancelledPending, 'pending line')}.`
    : result.defendedLocked ? ` Cleared ${pluralize(result.defendedLocked, 'locked line')}.` : '';
  setStatus(`Accepted: ${pluralize(result.lines)}.${details}`, 'success');
});

$('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  socket.emit('room:create', { name: $('#create-name').value, mode: 'battle' }, handleRoomResponse);
});

$('#join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  socket.emit('room:join', {
    name: $('#join-name').value,
    code: $('#join-code').value,
  }, handleRoomResponse);
});

$('#start-button').addEventListener('click', () => {
  socket.emit('room:start', { code: currentState?.code }, handleRoomResponse);
});

$('#leave-button').addEventListener('click', () => {
  socket.emit('room:leave');
  currentState = null;
  showLobby();
  setStatus('You left the room.');
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

setInterval(updatePendingTimer, 100);
renderBoard();
