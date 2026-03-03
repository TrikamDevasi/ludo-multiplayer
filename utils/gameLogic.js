const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'];
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];
const BOARD_PATH_LENGTH = 52;
const HOME_STRETCH_LENGTH = 57;

/**
 * Generates a random alphanumeric room ID of fixed length.
 * @returns {string} A 6-character room ID.
 */
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const START_INDEX = {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
};

/**
 * Converts a relative token position to a global board position.
 * @param {number} relativePos - The position relative to the starting point (0-51).
 * @param {string} color - The color of the player.
 * @returns {number} The global position on the 52-cell track, or -1 if invalid/safe zone.
 */
function getGlobalPosition(relativePos, color) {
    if (relativePos < 0 || relativePos >= BOARD_PATH_LENGTH) return -1; // Base or Safe/Home Stretch
    const startIndex = START_INDEX[color];
    return (startIndex + relativePos) % BOARD_PATH_LENGTH;
}

/**
 * Initializes a new game state for the specified number of players.
 * @param {number} playerCount - The number of players (2-4).
 * @returns {Object} The initial state of the game.
 */
function createInitialGameState(playerCount) {
    const players = {};

    for (let i = 0; i < playerCount; i++) {
        const color = PLAYER_COLORS[i];
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
        currentTurn: PLAYER_COLORS[0],
        diceValue: null,
        gameStarted: false,
        gameOver: false,
        winner: null,
        consecutiveSixes: 0
    };
}

/**
 * Checks if a player has any valid moves with the current dice value.
 * @param {Object} gameState - The current game state.
 * @param {string} color - The color of the player to check.
 * @param {number} diceValue - The value rolled on the dice.
 * @returns {boolean} True if at least one move is valid.
 */
function checkValidMoves(gameState, color, diceValue) {
    const player = gameState.players[color];

    for (let token of player.tokens) {
        if (token.isHome) continue;

        if (token.position === -1) {
            if (diceValue === 6) return true;
        } else {
            const nextPosition = token.position + diceValue;
            if (nextPosition <= HOME_STRETCH_LENGTH) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Checks for token captures at a given relative position.
 * @param {Object} gameState - The current game state.
 * @param {string} currentColor - The color of the player who just moved.
 * @param {number} relativePos - The new relative position of the moved token.
 */
function checkCapture(gameState, currentColor, relativePos) {
    const myGlobalPos = getGlobalPosition(relativePos, currentColor);
    let captured = false;

    // If in safe spot (global) or safe zone (base/home stretch), no capture
    if (myGlobalPos === -1) return false;

    if (SAFE_SPOTS.includes(myGlobalPos)) return false;

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
                    captured = true;
                }
            }
        }
    }
    return captured;
}

/**
 * Selects the best move for a bot player.
 * @param {Object} gameState - The current game state.
 * @param {string} color - The bot's color.
 * @param {number} diceValue - The value rolled on the dice.
 * @returns {number|null} The ID of the token to move, or null if no moves possible.
 */
function getBotMove(gameState, color, diceValue) {
    const player = gameState.players[color];
    const validTokenIds = [];

    // Identify all valid moves
    for (let token of player.tokens) {
        if (token.position === -1) {
            if (diceValue === 6) validTokenIds.push(token.id);
        } else if (!token.isHome) {
            if (token.position + diceValue <= HOME_STRETCH_LENGTH) {
                validTokenIds.push(token.id);
            }
        }
    }

    if (validTokenIds.length === 0) return null;

    // 1. Check for tokens that can reach home
    for (let id of validTokenIds) {
        if (player.tokens[id].position + diceValue === HOME_STRETCH_LENGTH) return id;
    }

    // 2. Check for captures
    for (let id of validTokenIds) {
        const token = player.tokens[id];
        const newPos = token.position === -1 ? 0 : token.position + diceValue;

        // Use a temporary clone or simulation to check capture
        const myGlobalPos = getGlobalPosition(newPos, color);
        if (myGlobalPos !== -1 && !SAFE_SPOTS.includes(myGlobalPos)) {
            for (let otherColor in gameState.players) {
                if (otherColor === color) continue;
                for (let otherToken of gameState.players[otherColor].tokens) {
                    if (otherToken.position !== -1 && !otherToken.isHome) {
                        if (getGlobalPosition(otherToken.position, otherColor) === myGlobalPos) {
                            return id;
                        }
                    }
                }
            }
        }
    }

    // 3. Bring token out of base
    for (let id of validTokenIds) {
        if (player.tokens[id].position === -1) return id;
    }

    // 4. Move token closest to home (highest position)
    let bestId = validTokenIds[0];
    let maxPos = player.tokens[bestId].position;

    for (let i = 1; i < validTokenIds.length; i++) {
        const id = validTokenIds[i];
        if (player.tokens[id].position > maxPos) {
            maxPos = player.tokens[id].position;
            bestId = id;
        }
    }

    return bestId;
}

module.exports = {
    generateRoomId,
    createInitialGameState,
    PLAYER_COLORS,
    SAFE_SPOTS,
    START_INDEX,
    BOARD_PATH_LENGTH,
    HOME_STRETCH_LENGTH,
    getGlobalPosition,
    checkValidMoves,
    checkCapture,
    getBotMove
};
