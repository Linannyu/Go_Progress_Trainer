/** Reusable multi-move tactical training. Ladder and Net can build on this. */
class TacticalSequence {
  constructor(options) {
    this.size = options.size;
    this.board = cloneBoard(options.board);
    this.previousBoard = options.previousBoard ? cloneBoard(options.previousBoard) : null;
    this.targetPoint = [...options.targetPoint];
    this.targetColor = options.targetColor || "b";
    this.attacker = options.attacker || otherColor(this.targetColor);
    this.attackStep = 0;
    this.targetSteps = options.targetSteps || 2;
    this.status = "active";
    this.lastMove = null;
  }

  targetGroup(board = this.board) {
    const [x, y] = this.targetPoint;
    return board[y]?.[x] === this.targetColor ? getGroup(board, x, y) : [];
  }

  attackingMoves() {
    if (this.status !== "active") return [];
    const target = this.targetGroup();
    const targetKeys = new Set(target.map(([x, y]) => keyOf(x, y)));
    const moves = [];
    for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
      const result = playMove(this.board, x, y, this.attacker, this.previousBoard);
      if (!result.legal) continue;
      const capturedTarget = result.captured.some(([cx, cy]) => targetKeys.has(keyOf(cx, cy)));
      if (capturedTarget) { moves.push([x, y]); continue; }
      const group = result.board[this.targetPoint[1]]?.[this.targetPoint[0]] === this.targetColor
        ? getGroup(result.board, ...this.targetPoint) : [];
      if (group.length && countLiberties(result.board, group) === 1) moves.push([x, y]);
    }
    return moves;
  }

  playAttack(x, y) {
    if (this.status !== "active") return { ok: false, status: this.status };
    if (!this.attackingMoves().some(([mx, my]) => mx === x && my === y)) {
      return { ok: false, status: "active", message: "这一步没有继续打吃目标棋。" };
    }
    const targetKeys = new Set(this.targetGroup().map(([gx, gy]) => keyOf(gx, gy)));
    const before = cloneBoard(this.board);
    const attack = playMove(this.board, x, y, this.attacker, this.previousBoard);
    this.board = attack.board;
    this.previousBoard = before;
    this.lastMove = [x, y];
    this.attackStep += 1;
    if (attack.captured.some(([cx, cy]) => targetKeys.has(keyOf(cx, cy)))) {
      this.status = "captured";
      return { ok: true, status: this.status, captured: attack.captured, message: "成功吃掉目标棋！" };
    }

    const target = this.targetGroup();
    const escapes = getLiberties(this.board, target)
      .map(([ex, ey]) => ({ point: [ex, ey], result: playMove(this.board, ex, ey, this.targetColor, this.previousBoard) }))
      .filter(item => item.result.legal)
      .sort((a, b) => {
        const aGroup = getGroup(a.result.board, ...this.targetPoint);
        const bGroup = getGroup(b.result.board, ...this.targetPoint);
        return countLiberties(b.result.board, bGroup) - countLiberties(a.result.board, aGroup);
      });
    if (!escapes.length) {
      this.status = "captured";
      return { ok: true, status: this.status, captured: [], message: "目标棋已经无处可逃。" };
    }
    const defense = escapes[0];
    const beforeDefense = cloneBoard(this.board);
    this.board = defense.result.board;
    this.previousBoard = beforeDefense;
    this.lastMove = defense.point;
    if (this.attackingMoves().length === 0 || this.attackStep >= this.targetSteps) {
      this.status = "escaped";
      return { ok: true, status: this.status, defense: defense.point, message: "目标棋已经获得足够的气，追击结束。" };
    }
    return { ok: true, status: "active", defense: defense.point, message: "✅ 对方延伸了。继续找下一次打吃！" };
  }
}

function transformTacticalPoint([x, y], size, rotation, mirror) {
  let px = mirror ? size - 1 - x : x, py = y;
  for (let index = 0; index < rotation; index += 1) [px, py] = [size - 1 - py, px];
  return [px, py];
}

function createChaseSequence(difficulty = "easy") {
  const size = 5, rotation = Math.floor(Math.random() * 4), mirror = Math.random() > .5;
  const stones = [
    [1, 1, "b"],
    [0, 1, "w"], [1, 0, "w"], [0, 2, "w"], [2, 0, "w"], [2, 2, "w"]
  ].map(([x, y, color]) => [...transformTacticalPoint([x, y], size, rotation, mirror), color]);
  const targetPoint = transformTacticalPoint([1, 1], size, rotation, mirror);
  return new TacticalSequence({ size, board: createBoard(size, stones), targetPoint, targetColor: "b", attacker: "w", targetSteps: 2, difficulty });
}

/** Two-part Ko exercise: immediate recapture fails, a threat and reply unlock it. */
class KoSequence {
  constructor() {
    this.size = 5;
    this.board = createBoard(5, [
      [1,1,"w"],[3,1,"w"],[2,0,"w"],[2,2,"w"],
      [0,1,"b"],[1,0,"b"],[1,2,"b"]
    ]);
    this.previousBoard = null;
    this.stage = 0;
    this.lastMove = null;
    this.points = { capture:[2,1], recapture:[1,1], threat:[4,4], response:[4,3] };
  }
  expectedPoint() { return this.stage === 0 ? this.points.capture : this.stage === 1 ? this.points.recapture : this.stage === 2 ? this.points.threat : this.points.recapture; }
  prompt() {
    return [
      "Ko Demo 1：轮到黑棋，请先提掉白棋。",
      "现在轮到白棋。请尝试在原处立即提回。",
      "Ko Demo 2：立即提回不行。请先下在标记的劫材位置。",
      "双方在别处交换一手后，现在可以回来提劫。"
    ][this.stage] || "劫练习完成。";
  }
  play(x, y) {
    const expected = this.expectedPoint();
    if (x !== expected[0] || y !== expected[1]) return { ok:false, message:"先按照亮起的步骤操作。" };
    if (this.stage === 0) {
      const before = cloneBoard(this.board), move = playMove(this.board, x, y, "b", this.previousBoard);
      if (!move.legal || move.captured.length !== 1) return { ok:false, message:"这一步没有形成劫。" };
      this.board = move.board; this.previousBoard = before; this.lastMove = [x,y]; this.stage = 1;
      return { ok:true, message:"黑棋提子成功。现在请白棋尝试立即提回。" };
    }
    if (this.stage === 1) {
      const move = playMove(this.board, x, y, "w", this.previousBoard);
      if (move.legal) return { ok:false, message:"规则检查异常：这里本应违反简单劫。" };
      this.stage = 2;
      return { ok:true, koBlocked:true, message:"Illegal Move: Ko。这里不能立即提回，因为会马上恢复上一局面。" };
    }
    if (this.stage === 2) {
      const beforeThreat = cloneBoard(this.board), threat = playMove(this.board, x, y, "w", this.previousBoard);
      if (!threat.legal) return { ok:false, message:"这个劫材位置不合法。" };
      this.board = threat.board; this.previousBoard = beforeThreat;
      const beforeReply = cloneBoard(this.board), reply = playMove(this.board, ...this.points.response, "b", this.previousBoard);
      if (!reply.legal) return { ok:false, message:"自动应劫失败。" };
      this.board = reply.board; this.previousBoard = beforeReply; this.lastMove = [...this.points.response]; this.stage = 3;
      return { ok:true, autoMove:this.points.response, message:"黑棋已经在别处回应。现在白棋可以回来提劫。" };
    }
    const before = cloneBoard(this.board), recapture = playMove(this.board, x, y, "w", this.previousBoard);
    if (!recapture.legal || recapture.captured.length !== 1) return { ok:false, message:"提劫失败。" };
    this.board = recapture.board; this.previousBoard = before; this.lastMove = [x,y]; this.stage = 4;
    return { ok:true, complete:true, captured:recapture.captured, message:"完成！隔了一回合后，白棋可以合法提劫。" };
  }
}
