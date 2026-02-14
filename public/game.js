// ===== Configuration =====
const CONFIG = {
    WS_RECONNECT_INTERVAL: 3000,
    WS_MAX_RETRIES: 5,
    ANIMATION_DURATION: 500,
    TOAST_DURATION: 3000,
    DICE_ROLL_DURATION: 600
};

// ===== WebSocket Management =====
let ws;
let wsRetries = 0;
let currentRoomId = null;
let myColor = null;
let gameState = null;
let canvas, ctx;
let animationQueue = [];

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
const gameStats = document.getElementById('gameStats');
const backToMenuBtn = document.getElementById('backToMenuBtn');

// ===== Ludo Board Configuration =====
const COLORS = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#10b981',
    yellow: '#f59e0b'
};

const CELL_SIZE = 40;
const BOARD_SIZE = 15;
const TOKEN_RADIUS = 14;

// Complete 52-cell Ludo path
const LUDO_PATH = [
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
    [14, 7], [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
    [7, 14], [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    [0, 7], [0, 6]
];

// Home stretch paths (last 6 cells before center)
const HOME_STRETCH = {
    red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    blue: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    green: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
    yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]]
};

// Starting positions on main path for each color
const START_INDEX = {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
};

// Safe spots (star positions)
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];

// ===== Local Storage Management =====
function savePlayerName(name) {
    try {
        localStorage.setItem('ludoPlayerName', name);
    } catch (e) {
        console.warn('LocalStorage not available');
    }
}

function loadPlayerName() {
    try {
        const name = localStorage.getItem('ludoPlayerName');
        if (name) {
            playerNameInput.value = name;
        }
    } catch (e) {
        console.warn('LocalStorage not available');
    }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, CONFIG.TOAST_DURATION);
}

// ===== WebSocket Functions =====
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log('Connecting to:', wsUrl);

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('✅ Connected to server');
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
            console.log('🔌 Disconnected from server');
            updateConnectionStatus('disconnected');

            if (wsRetries < CONFIG.WS_MAX_RETRIES) {
                wsRetries++;
                showToast(`Reconnecting... (${wsRetries}/${CONFIG.WS_MAX_RETRIES})`, 'warning');
                setTimeout(connectWebSocket, CONFIG.WS_RECONNECT_INTERVAL);
            } else {
                showToast('Failed to connect. Please refresh the page.', 'error');
                showLoading('Connection lost. Please refresh the page.');
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

function handleServerMessage(data) {
    console.log('📨 Received:', data);

    switch (data.type) {
        case 'room_created':
            currentRoomId = data.roomId;
            myColor = data.color;
            showWaitingScreen();
            showToast(`Room ${currentRoomId} created!`, 'success');
            break;

        case 'player_joined':
            updatePlayersList(data.players);
            showToast(`Player joined!`, 'success');
            if (data.players.length >= 2) {
                startGameBtn.disabled = false;
                document.querySelector('.waiting-hint').textContent = 'Ready to start!';
            }
            break;

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

        case 'token_moved':
            gameState = data.gameState;
            drawBoard();
            break;

        case 'turn_changed':
            gameState = data.gameState;
            updateTurn(data.currentTurn);
            rollDiceBtn.disabled = data.currentTurn !== myColor;
            break;

        case 'game_over':
            showGameOver(data.winner, data.stats);
            break;

        case 'error':
            showToast(data.message, 'error');
            console.error('Server error:', data.message);
            break;

        case 'player_disconnected':
            showToast(`Player disconnected`, 'warning');
            break;

        default:
            console.warn('Unknown message type:', data.type);
    }
}

// ===== UI Functions =====
function showWaitingScreen() {
    menuScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    waitingScreen.classList.add('active');

    displayRoomId.textContent = currentRoomId;
    updatePlayersList([{ name: playerNameInput.value || 'You', color: myColor, ready: true }]);
}

function updatePlayersList(players) {
    playersList.innerHTML = '';

    players.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.style.borderLeftColor = COLORS[player.color];
        item.innerHTML = `
            <div class="player-color-dot" style="background-color: ${COLORS[player.color]}"></div>
            <span>${player.name} ${player.color === myColor ? '(You)' : ''}</span>
        `;
        playersList.appendChild(item);
    });
}

function showGameScreen(players) {
    waitingScreen.classList.remove('active');
    gameScreen.classList.add('active');

    // Initialize canvas
    canvas = document.getElementById('ludoCanvas');
    ctx = canvas.getContext('2d');

    // Render players info
    playersInfo.innerHTML = '';
    players.forEach(player => {
        const div = document.createElement('div');
        div.className = `player-info ${player.color === gameState.currentTurn ? 'active' : ''}`;
        div.id = `player-${player.color}`;
        div.innerHTML = `
            <div class="player-color-dot" style="background-color: ${COLORS[player.color]}"></div>
            <span>${player.name}</span>
            <span id="score-${player.color}" style="margin-left: 5px; font-weight: bold;">(0)</span>
        `;
        playersInfo.appendChild(div);
    });

    drawBoard();
}

function updateTurn(currentTurn) {
    turnText.textContent = currentTurn === myColor ? "Your Turn!" : `${currentTurn.toUpperCase()}'s Turn`;
    turnText.className = currentTurn === myColor ? 'turn-indicator my-turn' : 'turn-indicator';

    // Update active player highlight
    document.querySelectorAll('.player-info').forEach(el => el.classList.remove('active'));
    const activePlayer = document.getElementById(`player-${currentTurn}`);
    if (activePlayer) activePlayer.classList.add('active');
}

function showDiceRoll(value) {
    const diceDiv = document.getElementById('dice');
    diceDiv.classList.add('rolling');

    setTimeout(() => {
        diceDiv.classList.remove('rolling');
        diceDiv.innerHTML = `<div class="dice-face">${value}</div>`;
    }, 600);
}

function showGameOver(winner, stats) {
    gameOverModal.classList.remove('hidden');
    winnerText.textContent = `${winner.toUpperCase()} WINS!`;
    winnerText.style.color = COLORS[winner];
}

// ===== Canvas Functions =====
function drawBoard() {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Ludo Board Grid
    drawCells();
    drawHomeStretch();
    drawCenter();
    drawSafeSpots();

    if (gameState) {
        drawTokens();
    }
}

function drawCells() {
    // Draw 15x15 Grid with colored zones
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            // Determine cell color based on Ludo board layout
            let fillStyle = '#fff';

            // Corners (Home Bases)
            if (x < 6 && y < 6) fillStyle = COLORS.red;
            else if (x > 8 && y < 6) fillStyle = COLORS.blue; // Green is usually right-top in some versions, but standard Ludo: Red (TL), Green (TR), Yellow (BR), Blue (BL)?
            // Wait, let's stick to standard Ludo based on START_INDEX:
            // Red: 0 (TL?), Blue: 13 (TR?), Green: 26 (BR?), Yellow: 39 (BL?)
            // Actually, based on `START_INDEX`:
            // Red starts at 0 -> Top Left Path
            // Blue starts at 13 -> Top Right Path ?? 
            // Let's create a generic "Base" drawer instead of loop for corners.

            // Basic Path Cells
            ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }

    // Draw Bases (replaces corners)
    drawBase(0, 0, COLORS.red);
    drawBase(9, 0, COLORS.blue); // Wait, 9? 6-8 is path. So 9-14 is base.
    drawBase(9, 9, COLORS.yellow);
    drawBase(0, 9, COLORS.green);
}

function drawBase(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, 6 * CELL_SIZE, 6 * CELL_SIZE);

    // Inner white square
    ctx.fillStyle = '#fff';
    ctx.fillRect((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE, 4 * CELL_SIZE, 4 * CELL_SIZE);
}
