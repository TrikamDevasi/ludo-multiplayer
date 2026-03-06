// ===== Configuration =====
const CONFIG = {
    WS_RECONNECT_INTERVAL: 3000,
    WS_MAX_RETRIES: 5,
    ANIMATION_DURATION: 500,
    TOAST_DURATION: 3000,
    DICE_ROLL_DURATION: 600
};


// ===== State =====
let ws;
let wsRetries = 0;
let currentRoomId = null;
let myColor = null;
let gameState = null;
let canvas, ctx;
let isAnimating = false;
let previousGameState = null;


// ===== DOM Elements =====
const menuScreen = document.getElementById('menuScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
const loadingOverlay = document.getElementById('loadingOverlay');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');


const playerNameInput = document.getElementById('playerNameInput');
const playerCountSelect = document.getElementById('playerCountSelect');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const joinRoomSection = document.getElementById('joinRoomSection');
const roomIdInput = document.getElementById('roomIdInput');
const joinRoomConfirmBtn = document.getElementById('joinRoomConfirmBtn');

if (roomIdInput) {
    roomIdInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    });
}


const displayRoomId = document.getElementById('displayRoomId');
const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
const playersList = document.getElementById('playersList');
const startGameBtn = document.getElementById('startGameBtn');


const playersInfo = document.getElementById('playersInfo');
const turnText = document.getElementById('turnText');
const dice = document.getElementById('dice');
const rollDiceBtn = document.getElementById('rollDiceBtn');
const diceResult = document.getElementById('diceResult');


const gameOverModal = document.getElementById('gameOverModal');
const winnerText = document.getElementById('winnerText');
const backToMenuBtn = document.getElementById('backToMenuBtn');


// Constants are now imported from js/constants.js



// ===== Local Storage =====
function savePlayerName(name) {
    try { localStorage.setItem('ludoPlayerName', name); }
    catch (e) { console.warn('LocalStorage not available'); }
}


function saveRoomId(roomId) {
    try { localStorage.setItem('ludoLastRoomId', roomId); }
    catch (e) { console.warn('LocalStorage not available'); }
}


function loadSessionData() {
    try {
        const name = localStorage.getItem('ludoPlayerName');
        if (name) playerNameInput.value = name;
        const roomId = localStorage.getItem('ludoLastRoomId');
        if (roomId) roomIdInput.value = roomId;
    } catch (e) { console.warn('LocalStorage not available'); }
}


// ===== How to Play UI =====
const howToPlayBtn = document.getElementById('howToPlayBtn');
const howToPlaySection = document.getElementById('howToPlaySection');
const closeHowToPlayBtn = document.getElementById('closeHowToPlayBtn');

if (howToPlayBtn) {
    howToPlayBtn.onclick = () => howToPlaySection.classList.remove('hidden');
}
if (closeHowToPlayBtn) {
    closeHowToPlayBtn.onclick = () => howToPlaySection.classList.add('hidden');
}


// ===== Audio =====
class AudioController {
    constructor() { this.ctx = null; this.enabled = true; }


    init() {
        if (!this.ctx)
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }


    playTone(freq, type, duration, volume = 0.1) {
        if (!this.enabled) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }


    playDice() { this.playTone(440, 'sine', 0.1, 0.05); }
    playMove() { this.playTone(660, 'triangle', 0.1, 0.05); }
    playCapture() {
        this.playTone(300, 'sawtooth', 0.1, 0.05);
        setTimeout(() => this.playTone(200, 'sawtooth', 0.2, 0.05), 100);
    }
    playHome() {
        this.playTone(523.25, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.1), 100);
        setTimeout(() => this.playTone(783.99, 'sine', 0.3, 0.1), 200);
    }
}


const audio = new AudioController();


// ===== Toast =====
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), CONFIG.TOAST_DURATION);
}


// ===== WebSocket =====
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    console.log('Connecting to:', wsUrl);


    try {
        ws = new WebSocket(wsUrl);


        ws.onopen = () => {
            console.log('✅ Connected');
            wsRetries = 0;
            updateConnectionStatus('connected');
            hideLoading();
            showToast('Connected to server', 'success');
        };


        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };


        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateConnectionStatus('disconnected');
            showToast('Connection error', 'error');
        };


        ws.onclose = () => {
            console.log('🔌 Disconnected');
            updateConnectionStatus('disconnected');
            if (wsRetries < CONFIG.WS_MAX_RETRIES) {
                wsRetries++;
                showToast(`Reconnecting... (${wsRetries}/${CONFIG.WS_MAX_RETRIES})`, 'warning');
                setTimeout(connectWebSocket, CONFIG.WS_RECONNECT_INTERVAL);
            } else {
                showToast('Failed to connect. Please refresh.', 'error');
                showLoading('Connection lost. Please refresh.');
            }
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        updateConnectionStatus('disconnected');
    }
}


function sendMessage(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            showToast('Failed to send message', 'error');
            return false;
        }
    } else {
        showToast('Not connected to server', 'error');
        return false;
    }
}


function updateConnectionStatus(status) {
    connectionStatus.className = `status-bar ${status}`;
    statusText.textContent = status === 'connected' ? 'Connected ✓' : 'Disconnected ✗';
}


function showLoading(message = 'Connecting to server...') {
    loadingOverlay.querySelector('p').textContent = message;
    loadingOverlay.classList.remove('hidden');
}


function hideLoading() {
    loadingOverlay.classList.add('hidden');
}


// ===== Server Message Handler =====
function handleServerMessage(data) {
    console.log('📨 Received:', data);


    switch (data.type) {
        case 'room_created':
            currentRoomId = data.roomId;
            myColor = data.color;
            saveRoomId(currentRoomId);
            showWaitingScreen();
            showToast(`Room ${currentRoomId} created!`, 'success');
            break;


        case 'join_success':
            currentRoomId = data.roomId;
            myColor = data.color;
            saveRoomId(currentRoomId);
            break;


        case 'player_joined':
            updatePlayersList(data.players);
            if (myColor && !waitingScreen.classList.contains('active')) {
                showWaitingScreen(data.players);
            }
            showToast('Player joined!', 'success');
            if (data.players.length >= 2) {
                startGameBtn.disabled = false;
                const hint = document.querySelector('.waiting-hint');
                if (hint) hint.textContent = 'Ready to start!';
            }
            break;


        case 'rejoin_success': {
            // FIX #4: Properly restore in-progress game screen on reconnect
            myColor = data.color;
            if (data.gameState) {
                gameState = data.gameState;
                if (data.gameState.gameStarted) {
                    showGameScreen(data.players || Object.keys(data.gameState.players).map(c => ({ color: c, name: c })));
                    drawBoard();
                    showToast('Reconnected to game!', 'success');
                }
            }
            break;
        }


        case 'game_started':
            gameState = data.gameState;
            showGameScreen(data.players);
            showToast('Game started! 🎮', 'success');
            break;


        case 'dice_rolled':
            showDiceRoll(data.diceValue);
            if (data.currentTurn === myColor) {
                diceResult.textContent = `You rolled ${data.diceValue}!`;
                diceResult.classList.remove('hidden');
                setTimeout(() => diceResult.classList.add('hidden'), 2000);
            }
            updateTurn(data.currentTurn);
            break;


        // FIX #2: Wrapped case in {} to allow lexical declarations (const/let)
        case 'token_moved': {
            previousGameState = gameState ? JSON.parse(JSON.stringify(gameState)) : null;
            const oldState = gameState;
            gameState = data.gameState;
            animateTokenMove(data.color, data.tokenId, oldState, gameState);
            updateScores();
            break;
        }


        case 'keep_turn':
            gameState = data.gameState;
            updateTurn(data.currentTurn);
            rollDiceBtn.disabled = data.currentTurn !== myColor;
            if (data.currentTurn === myColor) {
                showToast('Extra turn! Roll again 🎲', 'success');
            }
            break;


        case 'turn_changed':
            gameState = data.gameState;
            updateTurn(data.currentTurn);
            rollDiceBtn.disabled = data.currentTurn !== myColor;
            break;


        case 'game_over':
            showGameOver(data.winner, data.stats);
            break;


        case 'chat_message':
            appendChatMessage(data);
            break;


        case 'error':
            showToast(data.message, 'error');
            console.error('Server error:', data.message);
            break;


        case 'player_disconnected':
            showToast('A player disconnected', 'warning');
            break;


        default:
            console.warn('Unknown message type:', data.type);
    }
}


// ===== UI =====
function showWaitingScreen(players) {
    menuScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    waitingScreen.classList.add('active');
    displayRoomId.textContent = currentRoomId;
    const initialPlayers = players || [{ name: playerNameInput.value || 'You', color: myColor, ready: true }];
    updatePlayersList(initialPlayers);
}


function updatePlayersList(players) {
    playersList.innerHTML = '';
    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.style.borderLeftColor = COLORS[player.color];
        const isHost = index === 0;
        item.innerHTML = `
            <div class="player-color-dot" style="background-color: ${COLORS[player.color]}"></div>
            <div class="player-details">
                <span class="player-name-text">${player.name} ${player.color === myColor ? '(You)' : ''}</span>
                <div class="player-badges">
                    ${isHost ? '<span class="badge host-badge">Host</span>' : ''}
                    ${player.isBot ? '<span class="badge bot-badge">Bot</span>' : ''}
                </div>
            </div>
            <div class="player-status ${player.ready ? 'ready' : 'waiting'}">
                ${player.ready ? 'Ready ✓' : 'Waiting...'}
            </div>
        `;
        playersList.appendChild(item);
    });


    const addBotBtn = document.getElementById('addBotBtn');
    if (addBotBtn) {
        addBotBtn.disabled = players.length >= 4;
        addBotBtn.title = players.length >= 4 ? 'Room is full' : '';
    }
    if (startGameBtn) startGameBtn.disabled = players.length < 2;
}


function showGameScreen(players) {
    waitingScreen.classList.remove('active');
    gameScreen.classList.add('active');


    canvas = document.getElementById('ludoCanvas');
    ctx = canvas.getContext('2d');

    // FIX #3: Explicitly size the canvas — HTML default is 300×150, board needs 600×600
    canvas.width = BOARD_SIZE * CELL_SIZE;
    canvas.height = BOARD_SIZE * CELL_SIZE;


    playersInfo.innerHTML = '';
    players.forEach(player => {
        const div = document.createElement('div');
        div.className = `player-info ${player.color === gameState.currentTurn ? 'active' : ''}`;
        div.id = `player-${player.color}`;
        div.innerHTML = `
            <div class="player-color-dot" style="background-color: ${COLORS[player.color]}"></div>
            <span>${player.name}</span>
            <span id="score-${player.color}" style="margin-left:5px;font-weight:bold;">(0)</span>
        `;
        playersInfo.appendChild(div);
    });


    updateTurn(gameState.currentTurn);
    rollDiceBtn.disabled = gameState.currentTurn !== myColor;


    drawBoard();
}


function updateTurn(currentTurn) {
    turnText.textContent = currentTurn === myColor ? 'Your Turn!' : `${currentTurn.toUpperCase()}'s Turn`;
    if (currentTurn === myColor) {
        turnText.classList.add('my-turn');
    } else {
        turnText.classList.remove('my-turn');
    }
    document.querySelectorAll('.player-info').forEach(el => el.classList.remove('active'));
    const activePlayer = document.getElementById(`player-${currentTurn}`);
    if (activePlayer) activePlayer.classList.add('active');
}


function showDiceRoll(value) {
    // FIX #5: Use the module-level `dice` reference instead of re-querying the DOM
    rollDiceBtn.disabled = true;
    dice.classList.add('rolling');
    let count = 0;
    const rollingInterval = setInterval(() => {
        dice.innerHTML = `<div class="dice-face">${Math.floor(Math.random() * 6) + 1}</div>`;
        count++;
        if (count > 10) {
            clearInterval(rollingInterval);
            dice.classList.remove('rolling');
            dice.innerHTML = `<div class="dice-face">${value}</div>`;
        }
    }, 60);
}


function showGameOver(winner, stats) {
    gameOverModal.classList.remove('hidden');
    winnerText.textContent = `${winner.toUpperCase()} WINS!`;
    winnerText.style.color = COLORS[winner];
}


function updateScores() {
    if (!gameState) return;
    Object.keys(gameState.players).forEach(color => {
        const scoreEl = document.getElementById(`score-${color}`);
        if (scoreEl) scoreEl.textContent = `(${gameState.players[color].score})`;
    });
}


function appendChatMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    const messageDiv = document.createElement('div');
    const isSelf = data.sender === myColor;
    if (data.type_meta === 'system' || !data.sender) {
        messageDiv.className = 'chat-message system';
        messageDiv.textContent = data.message;
    } else {
        messageDiv.className = `chat-message ${isSelf ? 'self' : ''}`;
        messageDiv.innerHTML = `
            <span class="player-name" style="color:${isSelf ? 'white' : COLORS[data.sender]}">${data.senderName}</span>
            <span class="message-text">${data.message}</span>
        `;
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// ===== Canvas =====
function drawBoard() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCells();
    drawHomeStretch();
    drawCenter();
    drawSafeSpots();
    if (gameState) drawTokens();
}


function drawCells() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, BOARD_SIZE * CELL_SIZE, BOARD_SIZE * CELL_SIZE);


    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }


    drawBase(0, 0, COLORS.red);
    drawBase(9, 0, COLORS.blue);
    drawBase(9, 9, COLORS.green);
    drawBase(0, 9, COLORS.yellow);
}


function drawBase(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, 6 * CELL_SIZE, 6 * CELL_SIZE);
    ctx.fillStyle = '#fff';
    ctx.fillRect((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE, 4 * CELL_SIZE, 4 * CELL_SIZE);
    ctx.fillStyle = color;
    ctx.fillRect((x + 1.5) * CELL_SIZE, (y + 1.5) * CELL_SIZE, 3 * CELL_SIZE, 3 * CELL_SIZE);
}


function drawHomeStretch() {
    // FIX #1: Each color has 6 home-stretch cells; old loops only painted 5.
    // Red: cols 1–6 at row 7  (was i < 6, missed col 6)
    ctx.fillStyle = COLORS.red;
    for (let i = 1; i < 7; i++) ctx.fillRect(i * CELL_SIZE, 7 * CELL_SIZE, CELL_SIZE, CELL_SIZE);

    // Blue: rows 1–6 at col 7  (was i < 6, missed row 6)
    ctx.fillStyle = COLORS.blue;
    for (let i = 1; i < 7; i++) ctx.fillRect(7 * CELL_SIZE, i * CELL_SIZE, CELL_SIZE, CELL_SIZE);

    // Green: cols 8–13 at row 7  (was i starting at 9, missed col 8)
    ctx.fillStyle = COLORS.green;
    for (let i = 8; i < 14; i++) ctx.fillRect(i * CELL_SIZE, 7 * CELL_SIZE, CELL_SIZE, CELL_SIZE);

    // Yellow: rows 8–13 at col 7  (was i starting at 9, missed row 8)
    ctx.fillStyle = COLORS.yellow;
    for (let i = 8; i < 14; i++) ctx.fillRect(7 * CELL_SIZE, i * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}


function drawCenter() {
    const cx = 7.5 * CELL_SIZE;
    const cy = 7.5 * CELL_SIZE;
    const halfSize = 1.5 * CELL_SIZE;


    [
        { color: COLORS.red, pts: [[cx, cy], [cx - halfSize, cy - halfSize], [cx - halfSize, cy + halfSize]] },
        { color: COLORS.blue, pts: [[cx, cy], [cx - halfSize, cy - halfSize], [cx + halfSize, cy - halfSize]] },
        { color: COLORS.green, pts: [[cx, cy], [cx + halfSize, cy - halfSize], [cx + halfSize, cy + halfSize]] },
        { color: COLORS.yellow, pts: [[cx, cy], [cx - halfSize, cy + halfSize], [cx + halfSize, cy + halfSize]] },
    ].forEach(({ color, pts }) => {
        ctx.beginPath();
        ctx.moveTo(...pts[0]);
        ctx.lineTo(...pts[1]);
        ctx.lineTo(...pts[2]);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    });
}


function drawSafeSpots() {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    SAFE_SPOTS.forEach(index => {
        const [x, y] = LUDO_PATH[index];
        drawStar(x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2, 5, CELL_SIZE / 3, CELL_SIZE / 6);
    });
}


function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
}


function getCoordinates(position, color) {
    if (position === -1) return null;
    if (position === 57) return { x: 7.5, y: 7.5 };
    if (position >= 52) {
        const index = position - 52;
        if (HOME_STRETCH[color] && index < HOME_STRETCH[color].length) {
            const [x, y] = HOME_STRETCH[color][index];
            return { x: x + 0.5, y: y + 0.5 };
        }
        return { x: 7.5, y: 7.5 };
    }
    const globalIndex = (START_INDEX[color] + position) % 52;
    const [x, y] = LUDO_PATH[globalIndex];
    return { x: x + 0.5, y: y + 0.5 };
}


function drawTokens() {
    const positionGroups = {};


    Object.keys(gameState.players).forEach(color => {
        const player = gameState.players[color];
        player.tokens.forEach(token => {
            if (token.position === -1) {
                drawBaseToken(token, color);
            } else {
                const coords = getCoordinates(token.position, color);
                if (!coords) return;
                const posKey = `${coords.x},${coords.y}`;
                if (!positionGroups[posKey]) positionGroups[posKey] = [];
                positionGroups[posKey].push({ token, color, coords });
            }
        });
    });


    Object.keys(positionGroups).forEach(posKey => {
        const tokens = positionGroups[posKey];
        const count = tokens.length;
        tokens.forEach((t, index) => {
            let offsetX = 0, offsetY = 0;
            if (count > 1) {
                const angle = (index / count) * Math.PI * 2;
                offsetX = Math.cos(angle) * (TOKEN_RADIUS * 0.5);
                offsetY = Math.sin(angle) * (TOKEN_RADIUS * 0.5);
            }
            const x = t.coords.x * CELL_SIZE + offsetX;
            const y = t.coords.y * CELL_SIZE + offsetY;
            drawToken(x, y, t.color, t.token.isSafe);
        });
    });
}


function drawBaseToken(token, color) {
    const baseOffsets = [
        { dx: 1.5, dy: 1.5 }, { dx: 4.5, dy: 1.5 },
        { dx: 1.5, dy: 4.5 }, { dx: 4.5, dy: 4.5 }
    ];
    let bx = 0, by = 0;
    if (color === 'blue') bx = 9;
    else if (color === 'green') { bx = 9; by = 9; }
    else if (color === 'yellow') by = 9;
    const x = (bx + baseOffsets[token.id].dx) * CELL_SIZE;
    const y = (by + baseOffsets[token.id].dy) * CELL_SIZE;
    drawToken(x, y, color, token.isSafe);
}


function drawToken(x, y, color, isSafe) {
    ctx.beginPath();
    ctx.arc(x, y, TOKEN_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[color];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, TOKEN_RADIUS * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
}


async function animateTokenMove(color, tokenId, oldState, newState) {
    if (!oldState) { drawBoard(); return; }


    const oldToken = oldState.players[color].tokens[tokenId];
    const newToken = newState.players[color].tokens[tokenId];
    isAnimating = true;


    if (newToken.position === -1 || oldToken.position === -1) {
        drawBoard();
        isAnimating = false;
        return;
    }

    // FIX #7: Guard against no-op moves (same position) to ensure redraw still happens
    if (newToken.position === oldToken.position) {
        drawBoard();
        isAnimating = false;
        return;
    }


    if (newToken.position > oldToken.position) {
        for (let pos = oldToken.position + 1; pos <= newToken.position; pos++) {
            const tempState = JSON.parse(JSON.stringify(newState));
            tempState.players[color].tokens[tokenId].position = pos;
            const realState = gameState;
            gameState = tempState;
            drawBoard();
            gameState = realState;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }


    drawBoard();
    isAnimating = false;
}


// ===== Canvas Click =====
function handleCanvasClick(event) {
    if (!gameState || gameState.currentTurn !== myColor || !gameState.diceValue) return;


    const player = gameState.players[myColor];
    if (!player) return;


    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;


    for (let token of player.tokens) {
        if (token.isHome) continue;


        let tx, ty;
        if (token.position === -1) {
            const baseOffsets = [
                { dx: 1.5, dy: 1.5 }, { dx: 4.5, dy: 1.5 },
                { dx: 1.5, dy: 4.5 }, { dx: 4.5, dy: 4.5 }
            ];
            let bx = 0, by = 0;
            if (myColor === 'blue') bx = 9;
            else if (myColor === 'green') { bx = 9; by = 9; }
            else if (myColor === 'yellow') by = 9;
            tx = (bx + baseOffsets[token.id].dx) * CELL_SIZE;
            ty = (by + baseOffsets[token.id].dy) * CELL_SIZE;
        } else {
            const coords = getCoordinates(token.position, myColor);
            if (!coords) continue;
            tx = coords.x * CELL_SIZE;
            ty = coords.y * CELL_SIZE;
        }

        // FIX #6: Enlarged hit radius (2× TOKEN_RADIUS) to catch tokens shifted by
        // the stacking radial offset drawn in drawTokens()
        const distance = Math.sqrt((clickX - tx) ** 2 + (clickY - ty) ** 2);
        if (distance <= TOKEN_RADIUS * 2) {
            sendMessage({ type: 'move_token', tokenId: token.id });
            break;
        }
    }
}


// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    loadSessionData();


    const canvasEl = document.getElementById('ludoCanvas');
    if (canvasEl) canvasEl.addEventListener('click', handleCanvasClick);


    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (!name) { showToast('Please enter your name', 'error'); return; }
            const count = parseInt(playerCountSelect.value);
            sendMessage({ type: 'create_room', playerName: name, playerCount: count });
            savePlayerName(name);
        });
    }


    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            joinRoomSection.classList.remove('hidden');
            joinRoomBtn.classList.add('hidden');
            if (roomIdInput) roomIdInput.focus();
        });
    }


    if (joinRoomConfirmBtn) {
        joinRoomConfirmBtn.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            const roomId = roomIdInput.value.trim().toUpperCase();
            if (!name) { showToast('Please enter your name', 'error'); return; }
            if (!roomId) { showToast('Please enter Room ID', 'error'); return; }
            sendMessage({ type: 'join_room', playerName: name, roomId });
            savePlayerName(name);
        });
    }


    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => sendMessage({ type: 'start_game' }));
    }


    const addBotBtn = document.getElementById('addBotBtn');
    if (addBotBtn) addBotBtn.addEventListener('click', () => sendMessage({ type: 'add_bot' }));


    if (rollDiceBtn) {
        rollDiceBtn.addEventListener('click', () => sendMessage({ type: 'roll_dice' }));
    }


    if (copyRoomIdBtn) {
        copyRoomIdBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(displayRoomId.textContent)
                .then(() => {
                    showToast('Room ID copied!', 'success');
                    const originalText = copyRoomIdBtn.innerHTML;
                    copyRoomIdBtn.innerHTML = '<span aria-hidden="true">✔</span>';
                    setTimeout(() => { copyRoomIdBtn.innerHTML = originalText; }, 2000);
                })
                .catch(() => showToast('Failed to copy Room ID', 'error'));
        });
    }


    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => window.location.reload());
    }


    [playerNameInput, roomIdInput].forEach(input => {
        if (!input) return;
        input.addEventListener('keyup', (e) => {
            if (e.key !== 'Enter') return;
            if (input === roomIdInput || (input === playerNameInput && !joinRoomSection.classList.contains('hidden'))) {
                if (joinRoomConfirmBtn) joinRoomConfirmBtn.click();
            } else if (input === playerNameInput) {
                if (createRoomBtn) createRoomBtn.click();
            }
        });
    });


    if (playerNameInput) playerNameInput.focus();


    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    if (sendChatBtn && chatInput) {
        const sendMsg = () => {
            const message = chatInput.value.trim();
            if (message) {
                sendMessage({ type: 'chat_message', message });
                chatInput.value = '';
            }
        };
        sendChatBtn.addEventListener('click', sendMsg);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    }


    connectWebSocket();
});
