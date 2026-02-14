const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const COLORS = ['red', 'blue', 'green', 'yellow'];

const START_INDEX = {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
};

function getGlobalPosition(relativePos, color) {
    if (relativePos < 0 || relativePos >= 52) return -1; // Base or Safe/Home Stretch
    const startIndex = START_INDEX[color];
    return (startIndex + relativePos) % 52;
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createInitialGameState(playerCount) {
    const players = {};

    for (let i = 0; i < playerCount; i++) {
        const color = COLORS[i];
        players[color] = {
            tokens: [
                { id: 0, position: -1, isHome: false, isSafe: true },
                { id: 1, position: -1, isHome: false, isSafe: true },
                { id: 2, position: -1, isHome: false, isSafe: true },
                { id: 3, position: -1, isHome: false, isSafe: true }
            ],
            score: 0
        };
    }

    return {
        players,
        currentTurn: COLORS[0],
        diceValue: null,
        gameStarted: false,
        gameOver: false,
        winner: null
    };
}

wss.on('connection', (ws) => {
    console.log('New client connected');

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
    }
}

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
    ws.playerColor = COLORS[0];

    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: roomId,
        color: COLORS[0]
    }));
}

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
    ws.playerColor = color;

    broadcastToRoom(room, {
        type: 'player_joined',
        players: room.players.map(p => ({ name: p.name, color: p.color, ready: p.ready }))
    });
}

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
}

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

function checkValidMoves(gameState, color, diceValue) {
    const player = gameState.players[color];

    for (let token of player.tokens) {
        if (token.position === -1) {
            if (diceValue === 6) return true;
        } else if (!token.isHome) {
            if (token.position + diceValue <= 57) {
                return true;
            }
        }
    }

    return false;
}

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
        return;
    }

    // Next turn (unless rolled 6)
    if (gameState.diceValue !== 6) {
        nextTurn(room);
    } else {
        gameState.diceValue = null;
    }
}

function checkCapture(gameState, currentColor, relativePos) {
    const myGlobalPos = getGlobalPosition(relativePos, currentColor);

    // If in safe spot (global) or safe zone (base/home stretch), no capture
    if (myGlobalPos === -1) return;

    const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];
    if (SAFE_SPOTS.includes(myGlobalPos)) return;

    for (let color in gameState.players) {
        if (color === currentColor) continue;

        const player = gameState.players[color];
        for (let token of player.tokens) {
            if (token.position !== -1 && !token.isHome) {
                const theirGlobalPos = getGlobalPosition(token.position, color);

                if (theirGlobalPos === myGlobalPos) {
                    // Capture!
                    token.position = -1;
                    token.isSafe = true;
                    // Provide extra turn reward? (Standard Ludo rule)
                    // For now, minimal changes.
                }
            }
        }
    }
}

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

function broadcastToRoom(room, message) {
    room.players.forEach(player => {
        player.ws.send(JSON.stringify(message));
    });
}

function handleDisconnect(ws) {
    if (ws.roomId) {
        const room = rooms.get(ws.roomId);
        if (room) {
            room.players = room.players.filter(p => p.ws !== ws);

            if (room.players.length === 0) {
                rooms.delete(ws.roomId);
            } else {
                broadcastToRoom(room, {
                    type: 'player_left',
                    players: room.players.map(p => ({ name: p.name, color: p.color }))
                });
            }
        }
    }
}

server.listen(PORT, () => {
    console.log(`Ludo server running on port ${PORT}`);
});
