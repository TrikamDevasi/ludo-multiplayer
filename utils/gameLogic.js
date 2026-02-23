const COLORS = ['red', 'blue', 'green', 'yellow'];

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
    if (relativePos < 0 || relativePos >= 52) return -1; // Base or Safe/Home Stretch
    const startIndex = START_INDEX[color];
    return (startIndex + relativePos) % 52;
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

module.exports = {
    generateRoomId,
    createInitialGameState,
    COLORS,
    START_INDEX,
    getGlobalPosition,
    checkValidMoves,
    checkCapture
};
