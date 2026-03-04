const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'];
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];
const BOARD_PATH_LENGTH = 52;

// FIX #3: Renamed from HOME_STRETCH_LENGTH — this is a *position*, not a length.
// Home stretch occupies positions 52–56; 57 is the goal cell.
const GOAL_POSITION = 57;

const START_INDEX = {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
};


/**
 * Generates a unique random alphanumeric room ID.
 * FIX #4: Accepts a Set/array of existing IDs and retries on collision.
 * @param {Set<string>|string[]} [existingIds=[]] - Currently active room IDs.
 * @returns {string} A unique 6-character room ID.
 */
function generateRoomId(existingIds = []) {
    const existing = new Set(existingIds);
    let id;
    do {
        id = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (existing.has(id));
    return id;
}


/**
 * Converts a relative token position to a global board position.
 * Returns -1 for tokens in base, home stretch, or at goal.
 */
function getGlobalPosition(relativePos, color) {
    if (relativePos < 0 || relativePos >= BOARD_PATH_LENGTH) return -1;
    return (START_INDEX[color] + relativePos) % BOARD_PATH_LENGTH;
}


/**
 * Initializes a new game state for the specified number of players.
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
 */
function checkValidMoves(gameState, color, diceValue) {
    const player = gameState.players[color];

    for (const token of player.tokens) {
        if (token.isHome) continue;

        if (token.position === -1) {
            if (diceValue === 6) return true;
        } else {
            // FIX #3: reference GOAL_POSITION instead of HOME_STRETCH_LENGTH
            if (token.position + diceValue <= GOAL_POSITION) return true;
        }
    }

    return false;
}


/**
 * Checks for token captures at a given relative position.
 *
 * FIX #6: Returns an array of captured token descriptors { color, tokenId }
 * instead of a bare boolean, so callers can react (score, notifications, etc.).
 * The function still mutates captured tokens in-place (sends them back to base).
 *
 * @param {object} gameState
 * @param {string} currentColor
 * @param {number} relativePos - The moving token's new relative position.
 * @returns {{ color: string, tokenId: number }[]} List of captured tokens (empty = none).
 */
function checkCapture(gameState, currentColor, relativePos) {
    if (relativePos < 0 || relativePos >= BOARD_PATH_LENGTH) return [];

    const myGlobalPos = getGlobalPosition(relativePos, currentColor);
    if (myGlobalPos === -1) return [];
    if (SAFE_SPOTS.includes(myGlobalPos)) return [];

    const captured = [];

    // FIX #1: Object.keys() instead of for...in to avoid prototype chain iteration
    for (const color of Object.keys(gameState.players)) {
        if (color === currentColor) continue;

        for (const token of gameState.players[color].tokens) {
            if (token.position === -1 || token.isHome || token.position >= BOARD_PATH_LENGTH) continue;

            const theirGlobalPos = getGlobalPosition(token.position, color);
            if (theirGlobalPos === myGlobalPos) {
                token.position = -1;
                token.isSafe = true;
                captured.push({ color, tokenId: token.id });
            }
        }
    }

    return captured;
}


/**
 * Selects the best move for a bot player using priority rules.
 * Priority: reach home > capture enemy > exit base > advance furthest token.
 *
 * FIX #5: Returns null immediately when consecutiveSixes >= 3 (turn is forfeited).
 * FIX #2: Uses Array.find() to look up tokens by id instead of treating id as index.
 * FIX #7: Explicitly skips base-token exits in Priority 2 (they always land on safe
 *         start squares and can never capture).
 *
 * @returns {number|null} Token ID to move, or null if no valid moves.
 */
function getBotMove(gameState, color, diceValue) {
    // FIX #5: Three consecutive sixes forfeits the turn
    if (gameState.consecutiveSixes >= 3) return null;

    const player = gameState.players[color];

    // FIX #2: store token ids; retrieve tokens via .find() below
    const validTokenIds = [];

    for (const token of player.tokens) {
        if (token.isHome) continue;

        if (token.position === -1) {
            if (diceValue === 6) validTokenIds.push(token.id);
        } else {
            // FIX #3: GOAL_POSITION
            if (token.position + diceValue <= GOAL_POSITION) {
                validTokenIds.push(token.id);
            }
        }
    }

    if (validTokenIds.length === 0) return null;

    // Helper — FIX #2: safe token lookup by id
    const getToken = (id) => player.tokens.find(t => t.id === id);

    // Priority 1: Token that reaches home exactly
    for (const id of validTokenIds) {
        const token = getToken(id);
        const currentPos = token.position === -1 ? 0 : token.position;
        // FIX #3: GOAL_POSITION
        if (currentPos + diceValue === GOAL_POSITION) return id;
    }

    // Priority 2: Capture an enemy token
    for (const id of validTokenIds) {
        const token = getToken(id);

        // FIX #7: Base-token exits always land on a safe start square — skip immediately.
        // All START_INDEX values are in SAFE_SPOTS, so the inner lookup would always bail
        // anyway; skip up front to make the intent explicit.
        if (token.position === -1) continue;

        const newPos = token.position + diceValue;

        // Only main-path positions can capture
        if (newPos >= BOARD_PATH_LENGTH) continue;

        const myGlobalPos = getGlobalPosition(newPos, color);
        if (myGlobalPos === -1 || SAFE_SPOTS.includes(myGlobalPos)) continue;

        // FIX #1: Object.keys() instead of for...in
        for (const otherColor of Object.keys(gameState.players)) {
            if (otherColor === color) continue;
            for (const otherToken of gameState.players[otherColor].tokens) {
                if (
                    otherToken.position !== -1 &&
                    !otherToken.isHome &&
                    otherToken.position < BOARD_PATH_LENGTH &&
                    getGlobalPosition(otherToken.position, otherColor) === myGlobalPos
                ) {
                    return id;
                }
            }
        }
    }

    // Priority 3: Bring a token out of base
    for (const id of validTokenIds) {
        if (getToken(id).position === -1) return id;
    }

    // Priority 4: Advance the token closest to home (highest position).
    // By this point all valid tokens are on the board (position >= 0) because
    // any base token would have been returned in Priority 3.
    let bestId = null;
    let maxPos = -Infinity;

    for (const id of validTokenIds) {
        const pos = getToken(id).position;
        if (pos > maxPos) {
            maxPos = pos;
            bestId = id;
        }
    }

    return bestId;
}


module.exports = {
    generateRoomId,
    createInitialGameState,
    getGlobalPosition,
    checkValidMoves,
    checkCapture,
    getBotMove,
    PLAYER_COLORS,
    SAFE_SPOTS,
    START_INDEX,
    BOARD_PATH_LENGTH,
    GOAL_POSITION          // FIX #3: exported under new name
};
