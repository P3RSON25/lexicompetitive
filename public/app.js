const socket = io();

const $ = (selector) => document.querySelector(selector);
const lobby = $('#lobby');
const room = $('#room');
const status = $('#status');
const fragments = $('#fragments');
const players = $('#players');
const eventLog = $('#event-log');
let currentState = null;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function showRoom() {
  lobby.hidden = true;
  room.hidden = false;
}

function showLobby() {
  lobby.hidden = false;
  room.hidden = true;
}

function modeLabel(mode) {
  return { battle: 'Battle', clear40: 'Clear 40 lines', timed2m: 'Two-minute sprint' }[mode] || mode;
}

function addEvent(message) {
  const line = document.createElement('div');
  line.textContent = message;
  eventLog.prepend(line);
  while (eventLog.children.length > 8) eventLog.lastElementChild.remove();
}

function renderState(state) {
  currentState = state;
  showRoom();
  $('#room-code').textContent = state.code;
  $('#mode-label').textContent = `${modeLabel(state.mode)} · ${state.status}`;
  $('#start-button').hidden = state.hostId !== socket.id || state.status !== 'lobby';
  $('#word-input').disabled = state.status !== 'playing';
  $('#word-form button').disabled = state.status !== 'playing';
  fragments.replaceChildren(...(state.self?.fragments || []).map((fragment) => {
    const element = document.createElement('span');
    element.textContent = fragment.toUpperCase();
    return element;
  }));
  $('#lines').textContent = state.self?.linesCleared || 0;
  $('#score').textContent = state.self?.score || 0;
  players.replaceChildren(...state.players.map((player) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<span>${escapeHtml(player.name)}</span><strong>${player.linesCleared}</strong>`;
    if (player.id === state.hostId) row.dataset.host = 'true';
    if (player.status !== 'playing') row.dataset.status = player.status;
    return row;
  }));
  if (state.status === 'finished') {
    setStatus(state.winnerId === socket.id ? 'You won!' : 'Game finished', 'success');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function updateTimer() {
  if (!currentState?.endAt || currentState.status !== 'playing') {
    $('#timer').textContent = currentState?.mode === 'clear40' ? '40 goal' : '--:--';
    return;
  }
  const remaining = Math.max(0, currentState.endAt - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  $('#timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function handleRoomResponse(response) {
  if (!response?.ok) setStatus(response?.error || 'Request failed', 'error');
}

socket.on('connect', () => setStatus('Connected. Create or join a room.', 'success'));
socket.on('disconnect', () => setStatus('Connection lost. Reconnecting...', 'error'));
socket.on('room:state', renderState);
socket.on('game:event', (event) => {
  if (event.type === 'wordAccepted') {
    addEvent(`${event.playerName} cleared ${event.lines} line${event.lines === 1 ? '' : 's'}.`);
  } else if (event.type === 'gameStarted') {
    addEvent('Game started.');
  } else if (event.type === 'timeExpired') {
    addEvent('Time expired.');
  }
});
socket.on('word:result', (result) => {
  if (result.accepted) setStatus(`Accepted: ${result.lines} line${result.lines === 1 ? '' : 's'}.`, 'success');
  else setStatus(result.error.replaceAll('_', ' '), 'error');
});

$('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  socket.emit('room:create', {
    name: $('#create-name').value,
    mode: $('#create-mode').value,
  }, handleRoomResponse);
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

$('#word-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#word-input');
  const word = input.value;
  if (!word) return;
  input.value = '';
  socket.emit('word:submit', { word });
});

setInterval(updateTimer, 250);
updateTimer();
