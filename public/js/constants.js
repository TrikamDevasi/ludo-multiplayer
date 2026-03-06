// Shared Constants for Ludo Multiplayer

const COLORS = {
    red: '#eb1c24',
    blue: '#22409a',
    green: '#02a04b',
    yellow: '#ffe013'
};

const CELL_SIZE = 40;
const BOARD_SIZE = 15;
const TOKEN_RADIUS = 14;

const LUDO_PATH = [
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
    [14, 7], [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
    [7, 14], [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    [0, 7], [0, 6]
];

const HOME_STRETCH = {
    red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    blue: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    green: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
    yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]]
};

const START_INDEX = { red: 0, blue: 13, green: 26, yellow: 39 };
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];

if (typeof window === 'undefined') {
    module.exports = {
        COLORS,
        CELL_SIZE,
        BOARD_SIZE,
        TOKEN_RADIUS,
        LUDO_PATH,
        HOME_STRETCH,
        START_INDEX,
        SAFE_SPOTS
    };
}
