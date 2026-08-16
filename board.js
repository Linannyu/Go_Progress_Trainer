/** Standard hoshi (star point) coordinates for the supported board sizes. */
function starPointKeys(size) {
  const axes = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : size === 9 ? [2, 4, 6] : [];
  if (!axes.length) return new Set();
  const points = size === 19
    ? axes.flatMap(y => axes.map(x => [x, y]))
    : [[axes[0], axes[0]], [axes[2], axes[0]], [axes[1], axes[1]], [axes[0], axes[2]], [axes[2], axes[2]]];
  return new Set(points.map(([x, y]) => keyOf(x, y)));
}

/** DOM Go board: real buttons make it work with touch, keyboard and mouse. */
class GoBoard {
  constructor(container, options = {}) { this.container = container; this.setPosition(options); }
  setPosition(options = {}) {
    this.size = options.size || this.size || 9;
    this.board = options.board ? cloneBoard(options.board) : createBoard(this.size, options.stones || []);
    this.previousBoard = options.previousBoard ? cloneBoard(options.previousBoard) : null;
    this.toPlay = options.toPlay || "b";
    this.lastMove = options.lastMove || null;
    this.captures = { b: 0, w: 0, ...(options.captures || {}) };
    this.moveNumber = options.moveNumber || 0;
    this.passCount = options.passCount || 0;
    this.gameOver = !!options.gameOver;
    this.moveHistory = (options.moveHistory || []).map(move => ({ ...move }));
    this.history = [];
    this.future = [];
    this.locked = !!options.locked;
    this.highlights = options.highlights || [];
    this.labels = options.labels || {};
    this.onMove = options.onMove || this.onMove || (() => {});
    this.draw();
  }
  snapshot() {
    return {
      board: cloneBoard(this.board),
      previousBoard: this.previousBoard && cloneBoard(this.previousBoard),
      toPlay: this.toPlay,
      lastMove: this.lastMove && [...this.lastMove],
      captures: { ...this.captures },
      moveNumber: this.moveNumber,
      passCount: this.passCount,
      gameOver: this.gameOver,
      moveHistory: this.moveHistory.map(move => ({ ...move }))
    };
  }
  restore(snapshot) {
    this.board = cloneBoard(snapshot.board);
    this.previousBoard = snapshot.previousBoard && cloneBoard(snapshot.previousBoard);
    this.toPlay = snapshot.toPlay;
    this.lastMove = snapshot.lastMove && [...snapshot.lastMove];
    this.captures = { ...snapshot.captures };
    this.moveNumber = snapshot.moveNumber;
    this.passCount = snapshot.passCount;
    this.gameOver = snapshot.gameOver;
    this.moveHistory = snapshot.moveHistory.map(move => ({ ...move }));
  }
  draw() {
    const letters = "ABCDEFGHJKLMNOPQRST".slice(0, this.size).split("");
    const stars = starPointKeys(this.size);
    this.container.innerHTML = `<div class="board-coordinates top" style="--size:${this.size}">${letters.map(letter => `<span>${letter}</span>`).join("")}</div><div class="board-main"><div class="board-coordinates side" style="--size:${this.size}">${Array.from({ length: this.size }, (_, i) => `<span>${this.size - i}</span>`).join("")}</div><div class="go-board" style="--size:${this.size}" role="grid" aria-label="${this.size} 路围棋棋盘"></div></div>`;
    const grid = this.container.querySelector(".go-board");
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const point = document.createElement("button");
      point.type = "button";
      point.className = "intersection";
      const color = this.board[y][x], key = keyOf(x, y);
      point.dataset.coordinate = key;
      point.setAttribute("aria-label", `${letters[x]}${this.size-y}`);
      if (stars.has(key)) point.innerHTML = `<i class="star-point" aria-hidden="true"></i>`;
      if (color) point.insertAdjacentHTML("beforeend", `<i class="stone ${color}"></i>`);
      if (this.lastMove?.[0] === x && this.lastMove?.[1] === y) point.classList.add("last-move");
      if (this.highlights.some(([hx, hy]) => hx === x && hy === y)) point.classList.add("highlight");
      if (this.labels[key]) point.insertAdjacentHTML("beforeend", `<span class="point-label">${this.labels[key]}</span>`);
      point.addEventListener("click", () => this.handleClick(x, y));
      grid.append(point);
    }
  }
  handleClick(x, y) {
    if (this.locked || this.gameOver) return;
    const player = this.toPlay;
    const result = playMove(this.board, x, y, player, this.previousBoard);
    if (!result.legal) return this.onMove({ legal: false, x, y, state: this.snapshot() });
    this.history.push(this.snapshot());
    this.previousBoard = cloneBoard(this.board);
    this.board = result.board;
    this.lastMove = [x, y];
    this.captures[player] += result.captured.length;
    this.moveNumber += 1;
    this.passCount = 0;
    this.moveHistory.push({ player: player.toUpperCase(), x, y });
    this.toPlay = otherColor(player);
    this.future = [];
    this.draw();
    this.onMove({ legal: true, type: "move", player, x, y, captured: result.captured, board: this.board, state: this.snapshot() });
  }
  animateMove(x, y, color = this.toPlay, delay = 430) {
    const result = playMove(this.board, x, y, color, this.previousBoard);
    if (!result.legal) return result;
    const staged = cloneBoard(this.board);
    staged[y][x] = color;
    this.board = staged;
    this.lastMove = [x, y];
    this.draw();
    result.captured.forEach(([cx, cy]) => this.container.querySelector(`[data-coordinate="${keyOf(cx, cy)}"]`)?.classList.add("being-captured"));
    setTimeout(() => {
      this.board = result.board;
      this.draw();
      this.container.classList.add("capture-complete");
      setTimeout(() => this.container.classList.remove("capture-complete"), 420);
    }, result.captured.length ? delay : 180);
    return result;
  }
  undo() { const old = this.history.pop(); if (!old) return false; this.future.push(this.snapshot()); this.restore(old); this.draw(); this.onMove({ legal: true, type: "undo", state: this.snapshot() }); return true; }
  redo() { const next = this.future.pop(); if (!next) return false; this.history.push(this.snapshot()); this.restore(next); this.draw(); this.onMove({ legal: true, type: "redo", state: this.snapshot() }); return true; }
  clear() { this.setPosition({ size: this.size, toPlay: "b", onMove: this.onMove }); }
  pass() {
    if (this.locked || this.gameOver) return false;
    const player = this.toPlay;
    this.history.push(this.snapshot());
    this.previousBoard = cloneBoard(this.board);
    this.toPlay = otherColor(player);
    this.lastMove = null;
    this.moveNumber += 1;
    this.passCount += 1;
    this.gameOver = this.passCount >= 2;
    this.moveHistory.push({ player: player.toUpperCase(), pass: true });
    this.future = [];
    this.draw();
    this.onMove({ legal: true, type: "pass", pass: true, player, captured: [], board: this.board, state: this.snapshot() });
    return true;
  }
}

function exportSGF(size, moves = []) {
  const coordinate = value => String.fromCharCode(97 + value);
  const nodes = moves.map(move => `;${move.player || "B"}[${move.pass ? "" : `${coordinate(move.x)}${coordinate(move.y)}`}]`).join("");
  return `(;GM[1]FF[4]CA[UTF-8]AP[Go Progress Trainer]SZ[${size}]${nodes})`;
}
