// WebSocket connection
let ws;
let currentRoomId = null;
let myColor = null;
let gameState = null;

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
            updateBoard();
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
    
    // Display players
    playersInfo.innerHTML = players.map(player => `
        <div class="player-info">
            <div class="player-color-dot" style="background: ${player.color}"></div>
            <span>${player.name}</span>
        </div>
    `).join('');
    
    updateBoard();
    updateTurn(gameState.currentTurn);
}

function updatePlayersList(players) {
    playersList.innerHTML = players.map(player => `
        <div class="player-item">
            <div class="player-color-dot" style="background: ${player.color}"></div>
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
        
        if (gameState.currentTurn === myColor) {
            enableTokenSelection(value);
        }
    }, 500);
}

function updateTurn(currentTurn) {
    if (currentTurn === myColor) {
        turnText.textContent = 'Your Turn! Roll the dice';
        turnText.style.color = '#10b981';
        rollDiceBtn.disabled = false;
    } else {
        turnText.textContent = `${currentTurn}'s Turn`;
        turnText.style.color = '#6b7280';
        rollDiceBtn.disabled = true;
    }
}

function enableTokenSelection(diceValue) {
    const tokens = document.querySelectorAll(`.${myColor}-token`);
    
    tokens.forEach(token => {
        const tokenId = parseInt(token.dataset.id);
        const tokenData = gameState.players[myColor].tokens[tokenId];
        
        // Can bring out with 6
        if (tokenData.position === -1 && diceValue === 6) {
            token.classList.add('active');
            token.onclick = () => moveToken(tokenId);
        }
        // Can move if on board
        else if (tokenData.position >= 0 && !tokenData.isHome) {
            token.classList.add('active');
            token.onclick = () => moveToken(tokenId);
        }
    });
}

function moveToken(tokenId) {
    ws.send(JSON.stringify({
        type: 'move_token',
        tokenId: tokenId
    }));
    
    // Disable all tokens
    document.querySelectorAll('.token').forEach(t => {
        t.classList.remove('active');
        t.onclick = null;
    });
}

function updateBoard() {
    // Update token positions
    for (let color in gameState.players) {
        const player = gameState.players[color];
        
        player.tokens.forEach((token, id) => {
            const tokenElement = document.querySelector(`.${color}-token[data-id="${id}"]`);
            
            if (token.position === -1) {
                // Token in home
                const homeArea = document.getElementById(`${color}Home`);
                if (!homeArea.contains(tokenElement)) {
                    homeArea.appendChild(tokenElement);
                }
            } else if (token.isHome) {
                // Token reached home
                tokenElement.style.opacity = '0.5';
            } else {
                // Token on board - simplified positioning
                // In a real implementation, you'd position based on the path
                tokenElement.style.transform = `translate(${token.position * 10}px, 0)`;
            }
        });
    }
}

function showGameOver(winner) {
    const winnerName = winner.charAt(0).toUpperCase() + winner.slice(1);
    winnerText.textContent = `${winnerName} Wins!`;
    winnerText.style.color = winner;
    gameOverModal.classList.remove('hidden');
}

// Initialize
connectWebSocket();
