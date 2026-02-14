const COLORS = ['red', 'blue', 'green', 'yellow'];

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

module.exports = {
    generateRoomId,
    createInitialGameState,
    COLORS
};
