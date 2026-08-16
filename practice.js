const pick = list => list[Math.floor(Math.random() * list.length)];
const id = () => `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const difficultyFor = mastery => mastery >= 70 ? "challenge" : mastery >= 35 ? "normal" : "simple";
const boardStones = board => board.flatMap((row, y) => row.flatMap((color, x) => color ? [[x, y, color]] : []));
const shuffled = list => [...list].sort(() => Math.random() - .5);

function randomAnchor() { return [1 + Math.floor(Math.random() * 3), 1 + Math.floor(Math.random() * 3)]; }
function libertyPosition(kind = "liberty") {
  const size = 5, [x, y] = randomAnchor(), board = createBoard(size);
  const shape = kind === "group" || Math.random() > .55 ? pick([[[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,0],[0,1]]]) : [[0,0]];
  shape.forEach(([dx, dy]) => board[y + dy][x + dx] = "b");
  // Add a few white neighbours in normal/challenge patterns without ruining validity.
  if (Math.random() > .45) {
    const group = getGroup(board, x, y); const liberties = shuffled(getLiberties(board, group));
    liberties.slice(0, Math.min(liberties.length - 1, Math.floor(Math.random() * 2))).forEach(([lx, ly]) => board[ly][lx] = "w");
  }
  const group = getGroup(board, x, y); return { size, board, target: [x, y], group, liberties: getLiberties(board, group) };
}
function atariPosition(color = "b") {
  const size = 5, [x, y] = randomAnchor(), enemy = color === "b" ? "w" : "b", board = createBoard(size);
  board[y][x] = color;
  const open = pick([[1,0],[-1,0],[0,1],[0,-1]]), all = [[1,0],[-1,0],[0,1],[0,-1]];
  all.filter(([dx,dy]) => dx !== open[0] || dy !== open[1]).forEach(([dx,dy]) => board[y+dy][x+dx] = enemy);
  const answer = [x + open[0], y + open[1]];
  return { size, board, target: [x, y], answer, color, enemy };
}

function groupAtariPosition(color = "b") {
  const size = 5, enemy = color === "b" ? "w" : "b", board = createBoard(size);
  const horizontal = Math.random() > .5;
  const x = 1 + Math.floor(Math.random() * (horizontal ? 2 : 3));
  const y = 1 + Math.floor(Math.random() * (horizontal ? 3 : 2));
  const group = horizontal ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
  group.forEach(([gx, gy]) => board[gy][gx] = color);
  const liberties = shuffled(getLiberties(board, group));
  const answer = liberties.pop();
  liberties.forEach(([lx, ly]) => board[ly][lx] = enemy);
  return { size, board, target: group[0], group, answer, color, enemy };
}

function generateQuestion(skill, mastery = 0) {
  const difficulty = difficultyFor(mastery);
  if (skill === "intro") return introQuestion(difficulty);
  if (skill === "liberty") return Math.random() < .48 ? countLibertiesQuestion(difficulty) : selectLibertiesQuestion(difficulty);
  if (skill === "group") return groupQuestion(difficulty);
  if (skill === "atari" || skill === "chase") return atariQuestion(skill, difficulty);
  if (["capture", "hunt", "whole-capture"].includes(skill)) return captureQuestion(skill, difficulty);
  if (skill === "escape") return escapeQuestion(difficulty);
  if (skill === "suicide") return suicideQuestion(difficulty);
  if (skill === "ko") return koQuestion(difficulty);
  return countLibertiesQuestion(difficulty);
}

function base(question) { return { id: id(), createdAt: new Date().toISOString(), ...question }; }
function introQuestion(difficulty) {
  const list = [
    ["围棋棋子应该下在哪里？", ["格子中央","交叉点","棋盘外"], "交叉点", "棋子下在横线和竖线的交叉点。"],
    ["围棋开局时，哪一方先下？", ["白棋","黑棋","同时下"], "黑棋", "围棋采用黑先白后。"],
    ["完全初学时，最推荐哪种棋盘？", ["19×19","13×13","9×9"], "9×9", "局面较小的 9×9 最适合理解规则。"],
    ["黑棋下完一手后，轮到谁？", ["黑棋","白棋","双方同时"], "白棋", "双方每次只下一手，轮流行棋。"],
    ["围棋坐标为什么跳过 I？", ["避免与数字 1 混淆","I 不能做棋子","让棋盘变小"], "避免与数字 1 混淆", "棋谱与软件通常跳过 I，避免看错。"],
    ["9×9 表示什么？", ["每边有 9 个交叉点","每边有 9 颗棋","一局 9 分钟"], "每边有 9 个交叉点", "数字表示每一边的交叉点数量。"],
    ["下在棋盘边上的交叉点合法吗？", ["合法","不合法","只有白棋合法"], "合法", "边上的交叉点和中央一样可以落子。"],
    ["围棋开始时最需要先记住什么？", ["棋子下在交叉点","先围地盘","先吃子"], "棋子下在交叉点", "规则从正确的落子位置开始。"]
  ]; const [prompt, options, answer, explanation] = pick(list);
  return base({ skill:"intro", difficulty, type:"choice", prompt, options, answer, explanation, signature:`intro-${answer}` });
}
function countLibertiesQuestion(difficulty) {
  const position = libertyPosition(difficulty === "simple" ? "single" : "group");
  return base({ skill:"liberty", difficulty, type:"count", prompt:"这块黑棋共有几口气？", answer:countLiberties(position.board, position.group), explanation:"只数整块黑棋上下左右相邻的空交叉点；斜线不算。", board:{size:position.size, stones:boardStones(position.board), highlights:position.group}, signature:`count-${boardStones(position.board).map(s=>s.join("")).join("-")}` });
}
function selectLibertiesQuestion(difficulty) {
  const position = libertyPosition("group"); const answer = position.liberties.map(([x,y]) => keyOf(x,y));
  return base({ skill:"liberty", difficulty, type:"multi", prompt:"请点击这块黑棋所有的气，然后提交答案。", answer, explanation:"气只在上下左右；相连的黑棋共享全部气。", board:{size:position.size, stones:boardStones(position.board), highlights:position.group}, signature:`multi-${boardStones(position.board).map(s=>s.join("")).join("-")}` });
}
function groupQuestion(difficulty) {
  const connected = Math.random() > .5, size = 5, [x,y] = randomAnchor();
  const second = connected ? pick([[x+1,y],[x,y+1]]) : [x+1,y+1];
  return base({ skill:"group", difficulty, type:"choice", prompt:`两颗黑棋${connected ? "上下或左右相邻" : "斜着相邻"}。它们是一块棋（Group）吗？`, options:["是","否"], answer:connected ? "是" : "否", explanation: connected ? "上下左右相连的同色棋属于同一块棋。" : "斜线相邻不算连接。", board:{size, stones:[[x,y,"b"],[...second,"b"]], highlights:[[x,y],second]}, signature:`group-${connected}-${second[0]-x},${second[1]-y}` });
}
function atariQuestion(skill, difficulty) {
  const position = atariPosition("b");
  return base({ skill, difficulty, type:"click", toPlay:"w", prompt:"这颗黑棋正在被打吃（只剩 1 口气）。请点击它最后一口气。", answer:keyOf(...position.answer), explanation:"对，白棋占住最后一口气，黑棋会被提走。", board:{size:position.size, stones:boardStones(position.board), highlights:[position.target]}, signature:`atari-${boardStones(position.board).map(stone=>stone.join("")).join("-")}-${keyOf(...position.answer)}` });
}
function captureQuestion(skill, difficulty) {
  const position = skill === "whole-capture" ? groupAtariPosition("b") : atariPosition("b");
  const target = position.group || [position.target];
  return base({ skill, difficulty, type:"click", toPlay:"w", prompt:skill === "whole-capture" ? "轮到白棋。请提掉这整块相连的黑棋。" : "轮到白棋。请点击可以提掉黑棋的位置。", answer:keyOf(...position.answer), explanation:skill === "whole-capture" ? "白棋占住整块黑棋最后一口气，两颗相连的黑棋会一起被提走。" : "白棋占住黑棋最后一口气后，黑棋会被提走。", board:{size:position.size, stones:boardStones(position.board), highlights:target}, signature:`capture-${boardStones(position.board).map(stone=>stone.join("")).join("-")}-${keyOf(...position.answer)}` });
}
function escapeQuestion(difficulty) {
  const position = atariPosition("b");
  return base({ skill:"escape", difficulty, type:"click", toPlay:"b", prompt:"轮到黑棋。请点击可以延伸、增加气的位置。", answer:keyOf(...position.answer), explanation:"延伸到最后一口气后，黑棋不再是只有一气的单子。", board:{size:position.size, stones:boardStones(position.board), highlights:[position.target]}, signature:`escape-${boardStones(position.board).map(stone=>stone.join("")).join("-")}-${keyOf(...position.answer)}` });
}
function suicideQuestion(difficulty) {
  const size = 5, [x,y] = randomAnchor();
  const stones = [[x,y-1,"w"],[x-1,y,"w"],[x+1,y,"w"],[x,y+1,"w"]];
  return base({ skill:"suicide", difficulty, type:"choice", prompt:"中央空点的上下左右都是白棋。黑棋直接下在中央，而且不能吃掉任何白棋。这手合法吗？", options:["合法","不合法"], answer:"不合法", explanation:"不合法。落子后黑棋没有气，又没有提掉白棋，这就是普通自杀。", board:{size,stones,highlights:[[x,y]]}, signature:`suicide-${x},${y}` });
}
function koQuestion(difficulty) {
  return base({ skill:"ko", difficulty, type:"choice", prompt:"刚刚提子后，能不能立刻在同一位置提回、重复刚才的棋形？", options:["可以","不可以"], answer:"不可以", explanation:"不可以。这是简单劫规则；要先在别处下一手，避免无限重复。", signature:"ko-rule" });
}

function questionSnapshot(question) { return JSON.parse(JSON.stringify(question)); }
function answerText(answer) { return Array.isArray(answer) ? answer.join("、") : String(answer); }
function isAtariPosition(question) { if (!question.board?.highlights?.[0]) return false; const board = createBoard(question.board.size, question.board.stones); const [x,y] = question.board.highlights[0]; return checkAtari(board, x, y); }
