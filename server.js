const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const {
    generateRoomId,
    createInitialGameState,
    PLAYER_COLORS,
    GOAL_POSITION,
    getGlobalPosition,
    checkValidMoves,
    checkCapture,
    getBotMove
} = require('./utils/gameLogic');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

app.use((req, res, next) => {
    log('HTTP', `${req.method} ${req.url}`);
    next();
});

function log(category, message, roomId = 'GLOBAL') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${category}] [${roomId}] ${message}`);
}

const PORT = process.env.PORT || 3000;
const rooms = new Map();

wss.on('connection', (ws) => {
    log('WS', 'New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            log('ERROR', `Error parsing message: ${error.message}`);
        }
    });

    ws.on('close', () => handleDisconnect(ws));
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'create_room': createRoom(ws, data); break;
        case 'join_room': joinRoom(ws, data); break;
        case 'start_game': startGame(ws); break;
        case 'roll_dice': rollDice(ws); break;
        case 'move_token': moveToken(ws, data); break;
        case 'chat_message': handleChatMessage(ws, data); break;
        case 'add_bot': addBot(ws); break;
    }
}

function createRoom(ws, data) {
    const roomId = generateRoomId(Array.from(rooms.keys()));
    const room = {
        id: roomId,
        host: ws,
        players: [{
            ws,
            name: data.playerName,
            color: PLAYER_COLORS[0],  // ✅ FIX #2
            ready: false
        }],
        maxPlayers: data.playerCount || 2,
        gameState: null
    };

    rooms.set(roomId, room);
    ws.roomId = roomId;
    ws.playerName = data.playerName;
    ws.playerColor = PLAYER_COLORS[0];  // ✅ FIX #2

    // ✅ FIX #1: Added type: 'room_created'
    ws.send(JSON.stringify({
        type: 'room_created',
        roomId,
        color: PLAYER_COLORS[0]
    }));

    broadcastToRoom(room, {
        type: 'chat_message',
        isSystem: true,
        message: `Welcome! Room ID: ${roomId}`
    });
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
    if (room.gameState && room.gameState.gameStarted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress' }));
        return;
    }

    // ✅ FIX #3: Correct reconnection detection
    const existingPlayer = room.players.find(
        p => p.name === data.playerName && p.ws.readyState !== WebSocket.OPEN
    );

    if (existingPlayer) {
        existingPlayer.ws = ws;
        ws.roomId = data.roomId;
        ws.playerName = data.playerName;
        ws.playerColor = existingPlayer.color;

        ws.send(JSON.stringify({
            type: 'rejoin_success',
            gameState: room.gameState,
            color: existingPlayer.color
        }));

        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `${data.playerName} has re-joined the game!`
        });
        return;
    }

    const color = PLAYER_COLORS[room.players.length];
    room.players.push({ ws, name: data.playerName, color, ready: false });

    ws.roomId = data.roomId;
    ws.playerName = data.playerName;
    ws.playerColor = color;

    // Tell the joining player their color
    ws.send(JSON.stringify({
        type: 'join_success',
        roomId: data.roomId,
        color
    }));

    broadcastToRoom(room, {
        type: 'player_joined',
        players: room.players.map(p => ({ name: p.name, color: p.color, ready: p.ready }))
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        isSystem: true,
        message: `📢 ${data.playerName} has joined the game!`
    });
}

function addBot(ws) {
    const room = rooms.get(ws.roomId);
    if (!room || room.host !== ws) return;

    if (room.players.length >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    const botNames = [
        'Sir Rolls-a-Lot', 'Ludo Legend', 'Dice Master', 'Token Terror',
        'Amber Avenger', 'Gold Gobbler', 'Classic Champ', 'Board Boss',
        'Quick Click', 'Swift Slider', 'Royal Roller', 'Parchment Pal'
    ];
    const botName = botNames[Math.floor(Math.random() * botNames.length)];
    const color = PLAYER_COLORS[room.players.length];  // ✅ FIX #2

    const botPlayer = {
        ws: { send: () => { }, readyState: WebSocket.OPEN }, // ✅ added readyState for safety
        name: `${botName} (Bot)`,
        color,
        ready: true,
        isBot: true
    };

    room.players.push(botPlayer);

    broadcastToRoom(room, {
        type: 'player_joined',
        players: room.players.map(p => ({
            name: p.name, color: p.color, ready: p.ready, isBot: p.isBot
        }))
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        isSystem: true,
        message: `🤖 ${botPlayer.name} has joined the game!`
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

    broadcastToRoom(room, {
        type: 'chat_message',
        isSystem: true,
        message: 'Game has started! Good luck! Capture opponents for extra turns!'
    });

    checkBotTurn(room);
}

function rollDice(ws) {
    const room = rooms.get(ws.roomId);
    if (!room || !room.gameState) return;

    const gameState = room.gameState;

    if (gameState.currentTurn !== ws.playerColor) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
        return;
    }

    // ✅ Guard: don't allow rolling if dice already rolled and move pending
    if (gameState.diceValue !== null) {
        ws.send(JSON.stringify({ type: 'error', message: 'Already rolled. Move a token first.' }));
        return;
    }

    const diceValue = Math.floor(Math.random() * 6) + 1;
    gameState.diceValue = diceValue;
    console.log(`[Dice] ${ws.playerName} (${ws.playerColor}) rolled ${diceValue}`);

    if (diceValue === 6) gameState.consecutiveSixes++;
    else gameState.consecutiveSixes = 0;

    broadcastToRoom(room, {
        type: 'dice_rolled',
        diceValue,
        currentTurn: gameState.currentTurn
    });

    if (gameState.consecutiveSixes === 3) {
        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `${ws.playerName} rolled three 6s! Turn lost.`
        });
        gameState.diceValue = null;
        setTimeout(() => nextTurn(room), 1500);
        return;
    }

    setTimeout(() => {
        // Guard: if diceValue was already consumed (player moved manually), skip
        if (gameState.diceValue === null) return;

        const player = gameState.players[ws.playerColor];
        if (!player) return;

        const validTokens = player.tokens.filter(t => {
            if (t.isHome) return false;
            if (t.position === -1) return diceValue === 6;
            return t.position + diceValue <= GOAL_POSITION;
        });

        if (validTokens.length === 0) {
            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${ws.playerName} has no valid moves. Turn skipped.`
            });
            gameState.diceValue = null;
            nextTurn(room);
        } else if (validTokens.length === 1) {
            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${ws.playerName} only has one valid move. Moving automatically...`
            });
            setTimeout(() => {
                // Double-guard: make sure move hasn't been made yet
                if (gameState.diceValue !== null) {
                    moveToken(ws, { tokenId: validTokens[0].id });
                }
            }, 800);
        }
    }, 1500);
}

function moveToken(ws, data) {
    const room = rooms.get(ws.roomId);
    if (!room || !room.gameState) return;

    const gameState = room.gameState;
    const player = gameState.players[ws.playerColor];
    if (!player) return;

    // Look up token by id (not array index)
    const token = player.tokens.find(t => t.id === data.tokenId);
    if (!token || token.isHome) return;

    // Validate move
    if (token.position === -1) {
        if (gameState.diceValue !== 6) {
            console.warn(`[Move] Rejected: ${ws.playerName} tried to move from base without a 6`);
            return;
        }
    } else {
        if (token.position + gameState.diceValue > GOAL_POSITION) {
            console.warn(`[Move] Rejected: ${ws.playerName} tried to overshoot GOAL`);
            return;
        }
    }
    console.log(`[Move] ${ws.playerName} moving token ${data.tokenId} by ${gameState.diceValue}`);

    let extraTurn = false;

    if (token.position === -1 && gameState.diceValue === 6) {
        token.position = 0;
        token.isSafe = false;
    } else if (token.position >= 0) {
        const newPosition = token.position + gameState.diceValue;

        if (newPosition === GOAL_POSITION) {
            token.position = GOAL_POSITION;
            token.isHome = true;
            player.score++;
            extraTurn = true;

            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${ws.playerName}'s token reached home! Extra turn awarded.`
            });
        } else {
            token.position = newPosition;
            const captured = checkCapture(gameState, ws.playerColor, newPosition);
            if (captured.length > 0) {
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
        gameState
    });

    // Check win condition
    if (player.score === 4) {
        gameState.gameOver = true;
        gameState.winner = ws.playerColor;
        const winnerName = room.players.find(p => p.ws === ws)?.name || ws.playerColor;

        broadcastToRoom(room, { type: 'game_over', winner: ws.playerColor });
        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `🏆 GAME OVER! ${winnerName} wins!`
        });
        return;
    }

    if (gameState.diceValue === 6 || extraTurn) {
        gameState.diceValue = null;
        // Broadcast keep_turn so the client re-enables the Roll Dice button
        broadcastToRoom(room, {
            type: 'keep_turn',
            currentTurn: gameState.currentTurn,
            gameState
        });
    } else {
        nextTurn(room);
    }
}

function nextTurn(room) {
    const gameState = room.gameState;
    const colors = Object.keys(gameState.players);
    const currentIndex = colors.indexOf(gameState.currentTurn);
    gameState.currentTurn = colors[(currentIndex + 1) % colors.length];
    gameState.diceValue = null;
    gameState.consecutiveSixes = 0;

    broadcastToRoom(room, {
        type: 'turn_changed',
        currentTurn: gameState.currentTurn,
        gameState
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        isSystem: true,
        message: `It is now ${gameState.currentTurn.toUpperCase()}'s turn.`
    });

    checkBotTurn(room);
}

function checkBotTurn(room) {
    const gameState = room.gameState;
    // ✅ FIX #8: Added gameStarted guard
    if (!gameState || gameState.gameOver || !gameState.gameStarted) return;

    const currentPlayer = room.players.find(p => p.color === gameState.currentTurn);
    if (currentPlayer && currentPlayer.isBot) {
        setTimeout(() => botRollDice(room, currentPlayer), 1500);
    }
}

function botRollDice(room, botPlayer) {
    const gameState = room.gameState;
    if (!gameState || gameState.gameOver || gameState.diceValue !== null) return;

    const diceValue = Math.floor(Math.random() * 6) + 1;
    gameState.diceValue = diceValue;

    if (diceValue === 6) gameState.consecutiveSixes++;
    else gameState.consecutiveSixes = 0;

    broadcastToRoom(room, {
        type: 'dice_rolled',
        diceValue,
        currentTurn: gameState.currentTurn
    });

    if (gameState.consecutiveSixes === 3) {
        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `${botPlayer.name} rolled three 6s! Turn lost.`
        });
        gameState.diceValue = null;
        setTimeout(() => nextTurn(room), 1500);
        return;
    }

    setTimeout(() => {
        const tokenId = getBotMove(gameState, botPlayer.color, diceValue);
        if (tokenId === null) {
            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${botPlayer.name} has no valid moves.`
            });
            nextTurn(room);
        } else {
            botMoveToken(room, botPlayer, tokenId);
        }
    }, 1500);
}

function botMoveToken(room, botPlayer, tokenId) {
    const gameState = room.gameState;
    const player = gameState.players[botPlayer.color];
    // Look up token by id (not array index)
    const token = player.tokens.find(t => t.id === tokenId);
    if (!token || token.isHome) return;

    let extraTurn = false;

    if (token.position === -1 && gameState.diceValue === 6) {
        token.position = 0;
        token.isSafe = false;
    } else if (token.position >= 0) {
        const newPosition = token.position + gameState.diceValue;
        if (newPosition === GOAL_POSITION) {
            token.position = GOAL_POSITION;
            token.isHome = true;
            player.score++;
            extraTurn = true;

            broadcastToRoom(room, {
                type: 'chat_message',
                type_meta: 'system',
                message: `${botPlayer.name}'s token reached home! Extra turn awarded.`
            });
        } else {
            token.position = newPosition;
            const captured = checkCapture(gameState, botPlayer.color, newPosition);
            if (captured.length > 0) {
                extraTurn = true;
                broadcastToRoom(room, {
                    type: 'chat_message',
                    type_meta: 'system',
                    message: `${botPlayer.name} captured a token! Extra turn awarded.`
                });
            }
        }
    }

    broadcastToRoom(room, {
        type: 'token_moved',
        color: botPlayer.color,
        tokenId,
        gameState
    });

    if (player.score === 4) {
        gameState.gameOver = true;
        gameState.winner = botPlayer.color;
        broadcastToRoom(room, { type: 'game_over', winner: botPlayer.color });
        broadcastToRoom(room, {
            type: 'chat_message',
            type_meta: 'system',
            message: `🏆 GAME OVER! ${botPlayer.name} wins!`
        });
        return;
    }

    if (gameState.diceValue === 6 || extraTurn) {
        gameState.diceValue = null;
        broadcastToRoom(room, {
            type: 'keep_turn',
            currentTurn: gameState.currentTurn,
            gameState
        });
        setTimeout(() => botRollDice(room, botPlayer), 1500);
    } else {
        nextTurn(room);
    }
}

// ✅ FIX #4: Safe broadcast with try/catch
function broadcastToRoom(room, message) {
    const json = JSON.stringify(message);
    room.players.forEach(player => {
        try {
            if (player.ws.readyState === WebSocket.OPEN || player.isBot) {
                player.ws.send(json);
            }
        } catch (err) {
            console.error(`Failed to send to ${player.name}:`, err.message);
        }
    });
}

function handleDisconnect(ws) {
    if (!ws.roomId) return;

    const room = rooms.get(ws.roomId);
    if (!room) return;

    const playerName = ws.playerName || 'A player';
    room.players = room.players.filter(p => p.ws !== ws);

    if (room.players.length === 0) {
        rooms.delete(ws.roomId);
        return;
    }

    // Host migration
    if (room.host === ws) {
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

    // ✅ FIX #6: 'player_disconnected' to match client handler
    broadcastToRoom(room, {
        type: 'player_disconnected',
        players: room.players.map(p => ({
            name: p.name, color: p.color, ready: p.ready, isBot: p.isBot
        }))
    });

    broadcastToRoom(room, {
        type: 'chat_message',
        isSystem: true,
        message: `🚪 ${playerName} has left the game.`
    });
}

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

module.exports = { app, server, rooms };
