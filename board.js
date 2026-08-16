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
  setPosition(options = {}) { this.size = options.size || this.size || 9; this.board = createBoard(this.size, options.stones || []); this.previousBoard = null; this.toPlay = options.toPlay || "b"; this.lastMove = null; this.history = []; this.future = []; this.locked = !!options.locked; this.highlights = options.highlights || []; this.labels = options.labels || {}; this.onMove = options.onMove || (() => {}); this.draw(); }
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
  handleClick(x, y) { if (this.locked) return; const result = playMove(this.board, x, y, this.toPlay, this.previousBoard); if (!result.legal) return this.onMove({ legal: false, x, y }); this.history.push({ board: cloneBoard(this.board), previousBoard: this.previousBoard && cloneBoard(this.previousBoard), toPlay: this.toPlay, lastMove: this.lastMove }); this.previousBoard = cloneBoard(this.board); this.board = result.board; this.lastMove = [x, y]; this.toPlay = otherColor(this.toPlay); this.future = []; this.draw(); this.onMove({ legal: true, x, y, captured: result.captured, board: this.board }); }
  undo() { const old = this.history.pop(); if (!old) return; this.future.push({ board: cloneBoard(this.board), previousBoard: this.previousBoard && cloneBoard(this.previousBoard), toPlay: this.toPlay, lastMove: this.lastMove }); Object.assign(this, old); this.draw(); }
  redo() { const next = this.future.pop(); if (!next) return; this.history.push({ board: cloneBoard(this.board), previousBoard: this.previousBoard && cloneBoard(this.previousBoard), toPlay: this.toPlay, lastMove: this.lastMove }); Object.assign(this, next); this.draw(); }
  clear() { this.setPosition({ size: this.size, toPlay: "b", onMove: this.onMove }); }
  pass() { this.previousBoard = cloneBoard(this.board); this.toPlay = otherColor(this.toPlay); this.lastMove = null; this.draw(); this.onMove({ legal: true, pass: true, captured: [], board: this.board }); }
}
