// WebSocket connection
let ws;
let currentRoomId = null;
let myColor = null;
let gameState = null;
let canvas, ctx;

// DOM Elements
const menuScreen = document.getElementById('menuScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
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

const gameOverModal = document.getElementById('gameOverModal');
const winnerText = document.getElementById('winnerText');
const backToMenuBtn = document.getElementById('backToMenuBtn');

// Ludo Board Configuration
const COLORS = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#10b981',
    yellow: '#f59e0b'
};

const CELL_SIZE = 35;
const BOARD_SIZE = 15;
const TOKEN_RADIUS = 12;

// Initialize WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        updateConnectionStatus('connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected');
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        updateConnectionStatus('disconnected');
        setTimeout(connectWebSocket, 3000);
    };
}

function updateConnectionStatus(status) {
    connectionStatus.className = `status-bar ${status}`;
    statusText.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
}

function handleServerMessage(data) {
    console.log('Received:', data);
    
    switch (data.type) {
        case 'room_created':
            currentRoomId = data.roomId;
            myColor = data.color;
            showWaitingScreen();
            break;
        case 'player_joined':
            updatePlayersList(data.players);
            break;
        case 'game_started':
            gameState = data.gameState;
            showGameScreen(data.players);
            break;
        case 'dice_rolled':
            showDiceRoll(data.diceValue);
            updateTurn(data.currentTurn);
            break;
        case 'token_moved':
            gameState = data.gameState;
            drawBoard();
            break;
        case 'turn_changed':
            gameState = data.gameState;
            updateTurn(data.currentTurn);
            break;
        case 'game_over':
            showGameOver(data.winner);
            break;
        case 'error':
            alert(data.message);
            break;
    }
}

// Event Listeners
createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    const playerCount = parseInt(playerCountSelect.value);
    
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'create_room',
        playerName: playerName,
        playerCount: playerCount
    }));
});

joinRoomBtn.addEventListener('click', () => {
    joinRoomSection.classList.toggle('hidden');
});

joinRoomConfirmBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim().toUpperCase();
    
    if (!playerName || !roomId) {
        alert('Please enter your name and room ID');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'join_room',
        playerName: playerName,
        roomId: roomId
    }));
});

copyRoomIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomId).then(() => {
        copyRoomIdBtn.textContent = '✓';
        setTimeout(() => {
            copyRoomIdBtn.textContent = '📋';
        }, 2000);
    });
});

startGameBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({
        type: 'start_game'
    }));
});

rollDiceBtn.addEventListener('click', () => {
    if (gameState && gameState.currentTurn === myColor) {
        ws.send(JSON.stringify({
            type: 'roll_dice'
        }));
        rollDiceBtn.disabled = true;
    }
});

backToMenuBtn.addEventListener('click', () => {
    location.reload();
});

// Screen Management
function showWaitingScreen() {
    menuScreen.classList.remove('active');
    waitingScreen.classList.add('active');
    displayRoomId.textContent = currentRoomId;
}

function showGameScreen(players) {
    waitingScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    // Initialize canvas
    canvas = document.getElementById('ludoCanvas');
    ctx = canvas.getContext('2d');
    
    // Display players
    playersInfo.innerHTML = players.map(player => `
        <div class="player-info">
            <div class="player-color-dot" style="background: ${COLORS[player.color]}"></div>
            <span>${player.name}</span>
        </div>
    `).join('');
    
    drawBoard();
    updateTurn(gameState.currentTurn);
    
    // Add click listener for tokens
    canvas.addEventListener('click', handleCanvasClick);
}

function updatePlayersList(players) {
    playersList.innerHTML = players.map(player => `
        <div class="player-item">
            <div class="player-color-dot" style="background: ${COLORS[player.color]}; width: 20px; height: 20px; border-radius: 50%;"></div>
            <span>${player.name}</span>
        </div>
    `).join('');
}

function showDiceRoll(value) {
    dice.classList.add('rolling');
    dice.querySelector('.dice-face').textContent = '?';
    
    setTimeout(() => {
        dice.classList.remove('rolling');
        dice.querySelector('.dice-face').textContent = value;
    }, 500);
}

function updateTurn(currentTurn) {
    if (currentTurn === myColor) {
        turnText.textContent = 'Your Turn! Roll the dice';
        turnText.style.color = '#10b981';
        rollDiceBtn.disabled = false;
    } else {
        turnText.textContent = `${currentTurn.toUpperCase()}'s Turn`;
        turnText.style.color = '#6b7280';
        rollDiceBtn.disabled = true;
    }
    drawBoard();
}

function handleCanvasClick(event) {
    if (!gameState || gameState.currentTurn !== myColor || !gameState.diceValue) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Check if clicked on a token
    const player = gameState.players[myColor];
    for (let i = 0; i < player.tokens.length; i++) {
        const token = player.tokens[i];
        const pos = getTokenPosition(myColor, token, i);
        
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist <= TOKEN_RADIUS) {
            // Check if move is valid
            if (token.position === -1 && gameState.diceValue === 6) {
                moveToken(i);
            } else if (token.position >= 0 && !token.isHome) {
                moveToken(i);
            }
            break;
        }
    }
}

function moveToken(tokenId) {
    ws.send(JSON.stringify({
        type: 'move_token',
        tokenId: tokenId
    }));
}

// Drawing Functions
function drawBoard() {
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= BOARD_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, canvas.height);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(canvas.width, i * CELL_SIZE);
        ctx.stroke();
    }
    
    // Draw home areas
    drawHomeArea('red', 0, 0);
    drawHomeArea('blue', 9, 0);
    drawHomeArea('green', 0, 9);
    drawHomeArea('yellow', 9, 9);
    
    // Draw center
    drawCenter();
    
    // Draw path
    drawPath();
    
    // Draw tokens
    if (gameState) {
        for (let color in gameState.players) {
            drawTokens(color);
        }
    }
}

function drawHomeArea(color, gridX, gridY) {
    const x = gridX * CELL_SIZE;
    const y = gridY * CELL_SIZE;
    const size = 6 * CELL_SIZE;
    
    ctx.fillStyle = COLORS[color];
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 1;
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, size, size);
    
    // Draw token spots
    const spots = [
        [1.5, 1.5], [4.5, 1.5],
        [1.5, 4.5], [4.5, 4.5]
    ];
    
    ctx.fillStyle = COLORS[color];
    spots.forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.arc(
            x + sx * CELL_SIZE,
            y + sy * CELL_SIZE,
            TOKEN_RADIUS,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function drawCenter() {
    const centerX = 7.5 * CELL_SIZE;
    const centerY = 7.5 * CELL_SIZE;
    const size = CELL_SIZE;
    
    // Draw triangles
    const triangles = [
        { color: 'red', points: [[0, 0], [0, -size], [size, 0]] },
        { color: 'blue', points: [[0, 0], [size, 0], [0, size]] },
        { color: 'green', points: [[0, 0], [0, size], [-size, 0]] },
        { color: 'yellow', points: [[0, 0], [-size, 0], [0, -size]] }
    ];
    
    triangles.forEach(tri => {
        ctx.fillStyle = COLORS[tri.color];
        ctx.beginPath();
        ctx.moveTo(centerX + tri.points[0][0], centerY + tri.points[0][1]);
        ctx.lineTo(centerX + tri.points[1][0], centerY + tri.points[1][1]);
        ctx.lineTo(centerX + tri.points[2][0], centerY + tri.points[2][1]);
        ctx.closePath();
        ctx.fill();
    });
}

function drawPath() {
    // Draw safe spots (star marks)
    const safeSpots = [
        [1, 6], [6, 1], [8, 6], [13, 6],
        [6, 8], [6, 13], [8, 13], [13, 8]
    ];
    
    ctx.fillStyle = '#fbbf24';
    safeSpots.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x * CELL_SIZE + CELL_SIZE/2, y * CELL_SIZE + CELL_SIZE/2, 8, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawTokens(color) {
    const player = gameState.players[color];
    
    player.tokens.forEach((token, index) => {
        const pos = getTokenPosition(color, token, index);
        
        // Draw token
        ctx.fillStyle = COLORS[color];
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, TOKEN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Highlight if it's my turn
        if (color === myColor && gameState.currentTurn === myColor && gameState.diceValue) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    });
}

function getTokenPosition(color, token, index) {
    if (token.position === -1) {
        // Token in home
        const homePositions = {
            red: [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]],
            blue: [[10.5, 1.5], [13.5, 1.5], [10.5, 4.5], [13.5, 4.5]],
            green: [[1.5, 10.5], [4.5, 10.5], [1.5, 13.5], [4.5, 13.5]],
            yellow: [[10.5, 10.5], [13.5, 10.5], [10.5, 13.5], [13.5, 13.5]]
        };
        
        const pos = homePositions[color][index];
        return {
            x: pos[0] * CELL_SIZE,
            y: pos[1] * CELL_SIZE
        };
    } else if (token.isHome) {
        // Token reached home (center)
        return {
            x: 7.5 * CELL_SIZE,
            y: 7.5 * CELL_SIZE
        };
    } else {
        // Token on path - simplified path calculation
        const pathPos = getPathPosition(color, token.position);
        return {
            x: pathPos[0] * CELL_SIZE + CELL_SIZE/2,
            y: pathPos[1] * CELL_SIZE + CELL_SIZE/2
        };
    }
}

function getPathPosition(color, position) {
    // Simplified Ludo path - this is a basic implementation
    // In a real game, you'd have the complete 52-cell path
    const basePaths = {
        red: [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6]],
        blue: [[6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]],
        green: [[13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 8]],
        yellow: [[8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8]]
    };
    
    const path = basePaths[color];
    const index = Math.min(position, path.length - 1);
    return path[index];
}

function showGameOver(winner) {
    const winnerName = winner.charAt(0).toUpperCase() + winner.slice(1);
    winnerText.textContent = `${winnerName} Wins!`;
    winnerText.style.color = COLORS[winner];
    gameOverModal.classList.remove('hidden');
}

// Initialize
connectWebSocket();
