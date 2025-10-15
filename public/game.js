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

const CELL_SIZE = 40;
const BOARD_SIZE = 15;
const TOKEN_RADIUS = 14;

// Complete 52-cell Ludo path for each color
const LUDO_PATH = [
    // Red path starts at [1,6]
    [1,6], [2,6], [3,6], [4,6], [5,6], [6,5], [6,4], [6,3], [6,2], [6,1], [6,0],
    [7,0], [8,0], [8,1], [8,2], [8,3], [8,4], [8,5], [9,6], [10,6], [11,6], [12,6], [13,6], [14,6],
    [14,7], [14,8], [13,8], [12,8], [11,8], [10,8], [9,8], [8,9], [8,10], [8,11], [8,12], [8,13], [8,14],
    [7,14], [6,14], [6,13], [6,12], [6,11], [6,10], [6,9], [5,8], [4,8], [3,8], [2,8], [1,8], [0,8],
    [0,7], [0,6]
];

// Home stretch paths (last 6 cells before center)
const HOME_STRETCH = {
    red: [[1,7], [2,7], [3,7], [4,7], [5,7], [6,7]],
    blue: [[7,1], [7,2], [7,3], [7,4], [7,5], [7,6]],
    green: [[13,7], [12,7], [11,7], [10,7], [9,7], [8,7]],
    yellow: [[7,13], [7,12], [7,11], [7,10], [7,9], [7,8]]
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
    
    // Clear canvas with beige background
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw outer border
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Draw home areas (4 corners)
    drawHomeArea('red', 0, 0);
    drawHomeArea('blue', 9, 0);
    drawHomeArea('green', 0, 9);
    drawHomeArea('yellow', 9, 9);
    
    // Draw center (winning area)
    drawCenter();
    
    // Draw the complete path
    drawCompletePath();
    
    // Draw home stretch paths
    drawHomeStretchPaths();
    
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
    
    // Draw colored background
    ctx.fillStyle = COLORS[color];
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 1;
    
    // Draw border
    ctx.strokeStyle = COLORS[color];
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, size, size);
    
    // Draw circular token spots with white circles
    const spots = [
        [1.5, 1.5], [4.5, 1.5],
        [1.5, 4.5], [4.5, 4.5]
    ];
    
    spots.forEach(([sx, sy]) => {
        // White circle background
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(
            x + sx * CELL_SIZE,
            y + sy * CELL_SIZE,
            TOKEN_RADIUS + 4,
            0,
            Math.PI * 2
        );
        ctx.fill();
        
        // Colored border
        ctx.strokeStyle = COLORS[color];
        ctx.lineWidth = 3;
        ctx.stroke();
    });
}

function drawCenter() {
    const centerX = 7 * CELL_SIZE;
    const centerY = 7 * CELL_SIZE;
    const size = CELL_SIZE;
    
    // Draw white center square
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerX, centerY, size, size);
    
    // Draw colored triangles pointing to center
    const triangles = [
        { color: 'red', points: [[0, size/2], [size/2, 0], [size/2, size]] },
        { color: 'blue', points: [[size/2, 0], [size, size/2], [0, size/2]] },
        { color: 'green', points: [[size, size/2], [size/2, size], [size/2, 0]] },
        { color: 'yellow', points: [[size/2, size], [0, size/2], [size, size/2]] }
    ];
    
    triangles.forEach(tri => {
        ctx.fillStyle = COLORS[tri.color];
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(centerX + tri.points[0][0], centerY + tri.points[0][1]);
        ctx.lineTo(centerX + tri.points[1][0], centerY + tri.points[1][1]);
        ctx.lineTo(centerX + tri.points[2][0], centerY + tri.points[2][1]);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    });
    
    // Draw center circle
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(centerX + size/2, centerY + size/2, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawCompletePath() {
    // Draw all path cells
    LUDO_PATH.forEach((cell, index) => {
        const x = cell[0] * CELL_SIZE;
        const y = cell[1] * CELL_SIZE;
        
        // Draw cell background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        
        // Draw cell border
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
        
        // Draw safe spots (stars)
        if (SAFE_SPOTS.includes(index)) {
            drawStar(x + CELL_SIZE/2, y + CELL_SIZE/2, 8, 5, '#fbbf24');
        }
        
        // Draw starting spots with colored arrows
        if (index === START_INDEX.red) drawArrow(x, y, 'red');
        if (index === START_INDEX.blue) drawArrow(x, y, 'blue');
        if (index === START_INDEX.green) drawArrow(x, y, 'green');
        if (index === START_INDEX.yellow) drawArrow(x, y, 'yellow');
    });
}

function drawHomeStretchPaths() {
    Object.keys(HOME_STRETCH).forEach(color => {
        HOME_STRETCH[color].forEach(cell => {
            const x = cell[0] * CELL_SIZE;
            const y = cell[1] * CELL_SIZE;
            
            // Draw colored path
            ctx.fillStyle = COLORS[color];
            ctx.globalAlpha = 0.3;
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            ctx.globalAlpha = 1;
            
            // Draw border
            ctx.strokeStyle = COLORS[color];
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
        });
    });
}

function drawStar(cx, cy, outerRadius, innerRadius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

function drawArrow(x, y, color) {
    ctx.fillStyle = COLORS[color];
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + CELL_SIZE/2, y + 5);
    ctx.lineTo(x + CELL_SIZE - 5, y + CELL_SIZE/2);
    ctx.lineTo(x + CELL_SIZE/2, y + CELL_SIZE - 5);
    ctx.lineTo(x + 5, y + CELL_SIZE/2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawTokens(color) {
    const player = gameState.players[color];
    
    player.tokens.forEach((token, index) => {
        const pos = getTokenPosition(color, token, index);
        
        // Draw token shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, TOKEN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw token
        ctx.fillStyle = COLORS[color];
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, TOKEN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw white border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw inner circle for 3D effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(pos.x - 2, pos.y - 2, TOKEN_RADIUS / 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight if it's my turn and can move
        if (color === myColor && gameState.currentTurn === myColor && gameState.diceValue) {
            if (canTokenMove(token, gameState.diceValue)) {
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 4;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, TOKEN_RADIUS + 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    });
}

function canTokenMove(token, diceValue) {
    // Token in home can only move on 6
    if (token.position === -1) return diceValue === 6;
    // Token on board can move if not finished
    if (!token.isHome) return true;
    return false;
}

function getTokenPosition(color, token, index) {
    if (token.position === -1) {
        // Token in home area
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
        // Token reached winning center
        return {
            x: 7 * CELL_SIZE + CELL_SIZE/2,
            y: 7 * CELL_SIZE + CELL_SIZE/2
        };
    } else {
        // Token on path
        const pathPos = getPathPosition(color, token.position);
        return {
            x: pathPos[0] * CELL_SIZE + CELL_SIZE/2,
            y: pathPos[1] * CELL_SIZE + CELL_SIZE/2
        };
    }
}

function getPathPosition(color, position) {
    // Check if token is in home stretch (last 6 cells)
    if (position >= 51) {
        const homeStretchIndex = position - 51;
        if (homeStretchIndex < HOME_STRETCH[color].length) {
            return HOME_STRETCH[color][homeStretchIndex];
        }
        // At center
        return [7, 7];
    }
    
    // Calculate position on main path
    const startIndex = START_INDEX[color];
    const actualIndex = (startIndex + position) % 52;
    
    return LUDO_PATH[actualIndex];
}

function showGameOver(winner) {
    const winnerName = winner.charAt(0).toUpperCase() + winner.slice(1);
    winnerText.textContent = `${winnerName} Wins!`;
    winnerText.style.color = COLORS[winner];
    gameOverModal.classList.remove('hidden');
}

// Initialize
connectWebSocket();
