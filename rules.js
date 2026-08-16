/** Pure Go rules functions. Coordinates are [x, y], zero-based. */
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const keyOf = (x, y) => `${x},${y}`;
const otherColor = color => color === "b" ? "w" : "b";
function createBoard(size = 9, stones = []) { const board = Array.from({ length: size }, () => Array(size).fill(null)); stones.forEach(([x, y, color]) => { if (board[y]?.[x] !== undefined) board[y][x] = color; }); return board; }
function cloneBoard(board) { return board.map(row => [...row]); }
function inBounds(board, x, y) { return y >= 0 && y < board.length && x >= 0 && x < board.length; }
function neighbors(board, x, y) { return directions.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => inBounds(board, nx, ny)); }
/** Return all orthogonally connected same-colour stones. */
function getGroup(board, x, y) { const color = board[y]?.[x]; if (!color) return []; const group = [], seen = new Set([keyOf(x, y)]), queue = [[x, y]]; while (queue.length) { const [cx, cy] = queue.shift(); group.push([cx, cy]); neighbors(board, cx, cy).forEach(([nx, ny]) => { const key = keyOf(nx, ny); if (!seen.has(key) && board[ny][nx] === color) { seen.add(key); queue.push([nx, ny]); } }); } return group; }
/** Return each distinct empty intersection beside a group. */
function getLiberties(board, group) { const found = new Set(); group.forEach(([x, y]) => neighbors(board, x, y).forEach(([nx, ny]) => { if (!board[ny][nx]) found.add(keyOf(nx, ny)); })); return [...found].map(point => point.split(",").map(Number)); }
function countLiberties(board, group) { return getLiberties(board, group).length; }
/** Remove every stone in a captured group. */
function captureGroup(board, group) { group.forEach(([x, y]) => { board[y][x] = null; }); return group; }
function checkAtari(board, x, y) { const group = getGroup(board, x, y); return group.length ? countLiberties(board, group) === 1 : false; }
function checkCapture(board, x, y, color) { if (!inBounds(board, x, y) || board[y][x]) return false; const trial = cloneBoard(board); trial[y][x] = color; return neighbors(trial, x, y).some(([nx, ny]) => trial[ny][nx] === otherColor(color) && countLiberties(trial, getGroup(trial, nx, ny)) === 0); }
function serializeBoard(board) { return board.map(row => row.map(cell => cell || ".").join("")).join("/"); }
function checkKo(nextBoard, previousBoard) { return !!previousBoard && serializeBoard(nextBoard) === serializeBoard(previousBoard); }
/** Test occupancy, suicide and immediate Ko without changing the supplied board. */
function isLegalMove(board, x, y, color, previousBoard = null) { if (!inBounds(board, x, y) || board[y][x]) return false; const trial = cloneBoard(board); trial[y][x] = color; neighbors(trial, x, y).forEach(([nx, ny]) => { if (trial[ny][nx] === otherColor(color)) { const enemy = getGroup(trial, nx, ny); if (!countLiberties(trial, enemy)) captureGroup(trial, enemy); } }); if (!countLiberties(trial, getGroup(trial, x, y))) return false; return !checkKo(trial, previousBoard); }
/** Play one legal move and report resulting board plus captured stones. */
function playMove(board, x, y, color, previousBoard = null) { if (!isLegalMove(board, x, y, color, previousBoard)) return { legal: false, board, captured: [] }; const next = cloneBoard(board); next[y][x] = color; const captured = []; neighbors(next, x, y).forEach(([nx, ny]) => { if (next[ny][nx] === otherColor(color)) { const enemy = getGroup(next, nx, ny); if (!countLiberties(next, enemy)) captured.push(...captureGroup(next, enemy)); } }); return { legal: true, board: next, captured }; }
