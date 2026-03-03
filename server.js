const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const { generateRoomId, createInitialGameState, COLORS, START_INDEX, getGlobalPosition, checkValidMoves, checkCapture, getBotMove } = require('./utils/gameLogic');

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
        case 'add_bot':
            addBot(ws);
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
 * Adds a bot player to the room.
 * @param {WebSocket} ws - The host's WebSocket client.
 */
function addBot(ws) {
    const room = rooms.get(ws.roomId);
    if (!room || room.host !== ws) return;

    if (room.players.length >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    const botId = room.players.filter(p => p.isBot).length + 1;
    const color = COLORS[room.players.length];

    const botPlayer = {
        ws: { send: () => { } }, // Dummy WS for bots
        name: `Bot ${botId}`,
        color: color,
        ready: true,
        isBot: true
    };

    room.players.push(botPlayer);

    broadcastToRoom(room, {
        type: 'player_joined',
        players: room.players.map(p => ({
            name: p.name,
            color: p.color,
            ready: p.ready,
            isBot: p.isBot
        }))
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        type_meta: 'system',
        message: `${botPlayer.name} (Bot) has joined the game!`
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

    broadcastToRoom(room, {
        type: 'chat_message',
        type_meta: 'system',
        message: 'A new game begins! Capture opponents for extra turns!'
    });

    checkBotTurn(room);
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

    if (diceValue === 6) {
        gameState.consecutiveSixes++;
    } else {
        gameState.consecutiveSixes = 0;
    }

    broadcastToRoom(room, {
        type: 'dice_rolled',
        diceValue: diceValue,
        currentTurn: gameState.currentTurn
    });

    if (gameState.consecutiveSixes === 3) {
        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `${ws.playerName} rolled three 6s! Turn lost.`
        });
        setTimeout(() => {
            nextTurn(room);
        }, 1500);
        return;
    }

    // Check for forced moves
    setTimeout(() => {
        const player = gameState.players[ws.playerColor];
        const validTokens = player.tokens.filter(t => {
            if (t.isHome) return false;
            if (t.position === -1) return diceValue === 6;
            return t.position + diceValue <= 57;
        });

        if (validTokens.length === 0) {
            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${ws.playerName} has no valid moves.`
            });
            nextTurn(room);
        } else if (validTokens.length === 1) {
            // Auto-move the only valid token
            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${ws.playerName} only has one valid move. Moving automatically...`
            });
            setTimeout(() => {
                moveToken(ws, { tokenId: validTokens[0].id });
            }, 800);
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

    if (!token || token.isHome) return;

    // Server-side Move Validation
    // Check if the specific token can move the diceValue
    if (token.position === -1) {
        if (gameState.diceValue !== 6) return;
    } else {
        if (token.position + gameState.diceValue > 57) return;
    }

    let extraTurn = false;

    // Bring token out
    if (token.position === -1 && gameState.diceValue === 6) {
        token.position = 0;
        token.isSafe = false;
        // Rolling a 6 already gives an extra turn
    }
    // Move token
    else if (token.position >= 0 && !token.isHome) {
        const newPosition = token.position + gameState.diceValue;

        if (newPosition === 57) {
            token.position = 57;
            token.isHome = true;
            player.score++;
            extraTurn = true; // Reaching home gives extra turn

            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${ws.playerName} reached home! Extra turn awarded.`
            });
        } else if (newPosition < 57) {
            token.position = newPosition;

            // Check for capture
            const captured = checkCapture(gameState, ws.playerColor, newPosition);
            if (captured) {
                extraTurn = true;
                broadcastToRoom(room, {
                    type: 'chat_message',
                    type_meta: 'system',
                    message: `${ws.playerName} captured a token! Extra turn awarded.`
                });
            }
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

    // Next turn logic
    if (gameState.diceValue === 6 || extraTurn) {
        gameState.diceValue = null;
        // Current player keeps turn
        // If they keep turn, we might need to check if they have valid moves with a null dice? No, they need to roll.
        // The frontend enables rollDiceBtn if it's their turn and diceValue is null.
    } else {
        nextTurn(room);
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
    gameState.consecutiveSixes = 0;

    broadcastToRoom(room, {
        type: 'turn_changed',
        currentTurn: gameState.currentTurn,
        gameState: gameState
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        type_meta: 'system',
        message: `It is now ${gameState.currentTurn.toUpperCase()}'s turn.`
    });

    checkBotTurn(room);
}

/**
 * Checks if the current turn belongs to a bot and triggers bot action.
 * @param {Object} room - The current game room.
 */
function checkBotTurn(room) {
    const gameState = room.gameState;
    if (!gameState || gameState.gameOver) return;

    const currentPlayer = room.players.find(p => p.color === gameState.currentTurn);
    if (currentPlayer && currentPlayer.isBot) {
        setTimeout(() => {
            botRollDice(room, currentPlayer);
        }, 1500); // Wait after turn change
    }
}

/**
 * Bot rolls the dice.
 */
function botRollDice(room, botPlayer) {
    const gameState = room.gameState;
    const diceValue = Math.floor(Math.random() * 6) + 1;
    gameState.diceValue = diceValue;

    if (diceValue === 6) {
        gameState.consecutiveSixes++;
    } else {
        gameState.consecutiveSixes = 0;
    }

    broadcastToRoom(room, {
        type: 'dice_rolled',
        diceValue: diceValue,
        currentTurn: gameState.currentTurn
    });

    if (gameState.consecutiveSixes === 3) {
        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `${botPlayer.name} rolled three 6s! Turn lost.`
        });
        setTimeout(() => {
            nextTurn(room);
        }, 1500);
        return;
    }

    setTimeout(() => {
        const tokenId = getBotMove(gameState, botPlayer.color, diceValue);

        if (tokenId === null) {
            nextTurn(room);
        } else {
            botMoveToken(room, botPlayer, tokenId);
        }
    }, 1500); // Wait after roll
}

/**
 * Bot moves a token.
 */
function botMoveToken(room, botPlayer, tokenId) {
    const gameState = room.gameState;
    const player = gameState.players[botPlayer.color];
    const token = player.tokens[tokenId];

    let extraTurn = false;

    if (token.position === -1 && gameState.diceValue === 6) {
        token.position = 0;
        token.isSafe = false;
    } else if (token.position >= 0 && !token.isHome) {
        const newPosition = token.position + gameState.diceValue;
        if (newPosition === 57) {
            token.position = 57;
            token.isHome = true;
            player.score++;
            extraTurn = true;
        } else if (newPosition < 57) {
            token.position = newPosition;
            const captured = checkCapture(gameState, botPlayer.color, newPosition);
            if (captured) extraTurn = true;
        }
    }

    broadcastToRoom(room, {
        type: 'token_moved',
        color: botPlayer.color,
        tokenId: tokenId,
        gameState: gameState
    });

    if (player.score === 4) {
        gameState.gameOver = true;
        gameState.winner = botPlayer.color;
        broadcastToRoom(room, { type: 'game_over', winner: botPlayer.color });
        return;
    }

    if (gameState.diceValue === 6 || extraTurn) {
        gameState.diceValue = null;
        setTimeout(() => {
            botRollDice(room, botPlayer);
        }, 1500);
    } else {
        nextTurn(room);
    }
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
                // Host Migration
                if (room.host === ws) {
                    // Filter out bots to find a human host? 
                    // Actually, let's just pick the first player who isn't a bot.
                    const newHost = room.players.find(p => !p.isBot);
                    if (newHost) {
                        room.host = newHost.ws;
                        broadcastToRoom(room, {
                            type: 'chat_message',
                            type_meta: 'system',
                            message: `${newHost.name} is now the host.`
                        });
                    }
                }

                const playerName = ws.playerName || 'A player';
                broadcastToRoom(room, {
                    type: 'player_left',
                    players: room.players.map(p => ({
                        name: p.name,
                        color: p.color,
                        ready: p.ready,
                        isBot: p.isBot
                    }))
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
