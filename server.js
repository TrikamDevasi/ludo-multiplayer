const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const { generateRoomId, createInitialGameState, COLORS, START_INDEX, getGlobalPosition, checkValidMoves, checkCapture } = require('./utils/gameLogic');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// Basic logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const PORT = process.env.PORT || 3000;

// Map to store active game rooms with roomId as key
const rooms = new Map();

// const COLORS = ['red', 'blue', 'green', 'yellow']; // Removed

// START_INDEX and getGlobalPosition moved to utils/gameLogic.js


// function createInitialGameState(playerCount) { ... } // Removed

// Initialize WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Listen for incoming messages from the client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

/**
 * Handles incoming WebSocket messages.
 * @param {WebSocket} ws - The current WebSocket client.
 * @param {Object} data - The message data received.
 */
function handleMessage(ws, data) {
    switch (data.type) {
        case 'create_room':
            createRoom(ws, data);
            break;
        case 'join_room':
            joinRoom(ws, data);
            break;
        case 'start_game':
            startGame(ws);
            break;
        case 'roll_dice':
            rollDice(ws);
            break;
        case 'move_token':
            moveToken(ws, data);
            break;
        case 'chat_message':
            handleChatMessage(ws, data);
            break;
    }
}

/**
 * Creates a new game room and assigns the host.
 * @param {WebSocket} ws - The current WebSocket client.
 * @param {Object} data - The request data (playerName, playerCount).
 */
function createRoom(ws, data) {
    const roomId = generateRoomId();
    const room = {
        id: roomId,
        host: ws,
        players: [{
            ws,
            name: data.playerName,
            color: COLORS[0],
            ready: false
        }],
        maxPlayers: data.playerCount || 2,
        gameState: null
    };

    rooms.set(roomId, room);
    ws.roomId = roomId;
    ws.playerName = data.playerName;
    ws.playerColor = COLORS[0];

    ws.send(JSON.stringify({
        roomId: roomId,
        color: COLORS[0]
    }));

    broadcastToRoom(room, {
        type: 'chat_message',
        type_meta: 'system',
        message: `Welcome! Room ID: ${roomId}`
    });
}

/**
 * Joins an existing game room.
 * @param {WebSocket} ws - The current WebSocket client.
 * @param {Object} data - The request data (roomId, playerName).
 */
function joinRoom(ws, data) {
    const room = rooms.get(data.roomId);

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    if (room.players.length >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    const color = COLORS[room.players.length];
    room.players.push({
        ws,
        name: data.playerName,
        color: color,
        ready: false
    });

    ws.roomId = data.roomId;
    ws.playerName = data.playerName;
    ws.playerColor = color;

    broadcastToRoom(room, {
        type: 'player_joined',
        players: room.players.map(p => ({ name: p.name, color: p.color, ready: p.ready }))
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        type_meta: 'system',
        message: `${data.playerName} has joined the game!`
    });
}

/**
 * Starts the game for the specified room.
 * @param {WebSocket} ws - The host's WebSocket client.
 */
function startGame(ws) {
    const room = rooms.get(ws.roomId);
    if (!room || room.host !== ws) return;

    room.gameState = createInitialGameState(room.players.length);
    room.gameState.gameStarted = true;

    broadcastToRoom(room, {
        type: 'game_started',
        gameState: room.gameState,
        players: room.players.map(p => ({ name: p.name, color: p.color }))
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        type_meta: 'system',
        message: 'Game has started! Good luck!'
    });
}

/**
 * Rolls the dice for the current player's turn.
 * @param {WebSocket} ws - The current player's WebSocket client.
 */
function rollDice(ws) {
    const room = rooms.get(ws.roomId);
    if (!room || !room.gameState) return;

    const gameState = room.gameState;

    if (gameState.currentTurn !== ws.playerColor) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
        return;
    }

    const diceValue = Math.floor(Math.random() * 6) + 1;
    gameState.diceValue = diceValue;

    broadcastToRoom(room, {
        type: 'dice_rolled',
        diceValue: diceValue,
        currentTurn: gameState.currentTurn
    });

    // Check if player has valid moves
    setTimeout(() => {
        const hasValidMoves = checkValidMoves(gameState, ws.playerColor, diceValue);

        if (!hasValidMoves) {
            nextTurn(room);
        }
    }, 1500);
}


// checkValidMoves moved to utils/gameLogic.js

/**
 * Moves a token based on the current dice value.
 * @param {WebSocket} ws - The switching player's WebSocket client.
 * @param {Object} data - The move data (tokenId).
 */
function moveToken(ws, data) {
    const room = rooms.get(ws.roomId);
    if (!room || !room.gameState) return;

    const gameState = room.gameState;
    const player = gameState.players[ws.playerColor];
    const token = player.tokens[data.tokenId];

    if (!token) return;

    // Bring token out
    if (token.position === -1 && gameState.diceValue === 6) {
        token.position = 0;
        token.isSafe = false;
    }
    // Move token
    else if (token.position >= 0 && !token.isHome) {
        const newPosition = token.position + gameState.diceValue;

        if (newPosition === 57) {
            token.position = 57;
            token.isHome = true;
            player.score++;
        } else if (newPosition < 57) {
            token.position = newPosition;

            // Check for capture
            checkCapture(gameState, ws.playerColor, newPosition);
        }
    }

    broadcastToRoom(room, {
        type: 'token_moved',
        color: ws.playerColor,
        tokenId: data.tokenId,
        gameState: gameState
    });

    // Check win condition
    if (player.score === 4) {
        gameState.gameOver = true;
        gameState.winner = ws.playerColor;

        broadcastToRoom(room, {
            type: 'game_over',
            winner: ws.playerColor
        });

        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `🏆 GAME OVER! ${room.players.find(p => p.ws === ws)?.name || ws.playerColor} wins!`
        });
        return;
    }

    // Next turn (unless rolled 6)
    if (gameState.diceValue !== 6) {
        nextTurn(room);
    } else {
        gameState.diceValue = null;
    }
}


// checkCapture moved to utils/gameLogic.js

/**
 * Switches the turn to the next player.
 * @param {Object} room - The current game room objects.
 */
function nextTurn(room) {
    const gameState = room.gameState;
    const colors = Object.keys(gameState.players);
    const currentIndex = colors.indexOf(gameState.currentTurn);
    const nextIndex = (currentIndex + 1) % colors.length;

    gameState.currentTurn = colors[nextIndex];
    gameState.diceValue = null;

    broadcastToRoom(room, {
        type: 'turn_changed',
        currentTurn: gameState.currentTurn,
        gameState: gameState
    });
}

/**
 * Broadcasts a message to all players in a room.
 * @param {Object} room - The game room to broadcast to.
 * @param {Object} message - The message object to send.
 */
function broadcastToRoom(room, message) {
    room.players.forEach(player => {
        player.ws.send(JSON.stringify(message));
    });
}

/**
 * Handles player disconnection.
 * @param {WebSocket} ws - The disconnected player's WebSocket.
 */
function handleDisconnect(ws) {
    if (ws.roomId) {
        const room = rooms.get(ws.roomId);
        if (room) {
            room.players = room.players.filter(p => p.ws !== ws);

            if (room.players.length === 0) {
                rooms.delete(ws.roomId);
            } else {
                const playerName = ws.playerName || 'A player';
                broadcastToRoom(room, {
                    type: 'player_left',
                    players: room.players.map(p => ({ name: p.name, color: p.color }))
                });

                broadcastToRoom(room, {
                    type: 'chat_message',
                    type_meta: 'system',
                    message: `${playerName} has left the game.`
                });
            }
        }
    }
}

/**
 * Handles incoming chat messages and broadcasts them to the room.
 * @param {WebSocket} ws - The current WebSocket client.
 * @param {Object} data - The chat message data.
 */
function handleChatMessage(ws, data) {
    const room = rooms.get(ws.roomId);
    if (!room) return;

    broadcastToRoom(room, {
        type: 'chat_message',
        sender: ws.playerColor,
        senderName: room.players.find(p => p.ws === ws)?.name || 'Unknown',
        message: data.message
    });
}

server.listen(PORT, () => {
    console.log(`Ludo server running on port ${PORT}`);
});

// Export elements for potential testing
module.exports = { app, server, rooms };
