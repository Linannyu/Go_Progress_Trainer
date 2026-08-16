const pick = list => list[Math.floor(Math.random() * list.length)];
const id = () => `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const difficultyFor = mastery => mastery >= 70 ? "hard" : mastery >= 35 ? "medium" : "easy";
const boardStones = board => board.flatMap((row, y) => row.flatMap((color, x) => color ? [[x, y, color]] : []));
const shuffled = list => [...list].sort(() => Math.random() - .5);
const randomInt = max => Math.floor(Math.random() * max);
const normalizedDifficulty = value => ({ simple:"easy", normal:"medium", challenge:"hard" }[value] || value || "easy");

function validPosition(board) {
  const seen = new Set();
  for (let y = 0; y < board.length; y += 1) for (let x = 0; x < board.length; x += 1) {
    if (!board[y][x] || seen.has(keyOf(x,y))) continue;
    const group = getGroup(board, x, y);
    group.forEach(([gx,gy]) => seen.add(keyOf(gx,gy)));
    if (!countLiberties(board, group)) return false;
  }
  return true;
}

function randomAnchorForShape(size, shape) {
  const maxX = Math.max(...shape.map(([x]) => x)), maxY = Math.max(...shape.map(([,y]) => y));
  return [randomInt(size - maxX), randomInt(size - maxY)];
}

function libertyPosition(difficulty = "easy") {
  difficulty = normalizedDifficulty(difficulty);
  const size = 5, board = createBoard(size);
  let shape, anchor;
  if (difficulty === "easy") {
    shape = [[0,0]];
    const locations = [[0,0],[4,0],[0,4],[4,4],[0,2],[4,2],[2,0],[2,4],[2,2],[1,3]];
    anchor = pick(locations);
  } else {
    shape = difficulty === "hard"
      ? pick([[[0,0],[1,0],[0,1]], [[0,0],[1,0],[2,0],[1,1]], [[0,0],[0,1],[1,1]]])
      : pick([[[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,0],[2,0]]]);
    anchor = randomAnchorForShape(size, shape);
  }
  shape.forEach(([dx,dy]) => { board[anchor[1]+dy][anchor[0]+dx] = "b"; });
  const group = getGroup(board, ...anchor);
  if (difficulty !== "easy") {
    const liberties = shuffled(getLiberties(board, group));
    const blockers = difficulty === "hard" ? Math.min(liberties.length - 1, 2 + randomInt(2)) : Math.min(liberties.length - 1, randomInt(2));
    liberties.slice(0, blockers).forEach(([x,y]) => { board[y][x] = "w"; });
    if (difficulty === "hard") {
      const empties = [];
      for (let y=0;y<size;y++) for(let x=0;x<size;x++) if(!board[y][x] && !neighbors(board,x,y).some(([nx,ny])=>board[ny][nx]==="b")) empties.push([x,y]);
      shuffled(empties).slice(0,2).forEach(([x,y]) => { board[y][x] = Math.random()>.5?"b":"w"; });
    }
  }
  const refreshed = getGroup(board, ...anchor);
  if (!refreshed.length || !countLiberties(board, refreshed) || !validPosition(board)) return libertyPosition(difficulty);
  return { size, board, target: anchor, group: refreshed, liberties: getLiberties(board, refreshed) };
}

function atariFromGroup(size, group, color = "b", openPoint = null) {
  const board = createBoard(size), enemy = otherColor(color);
  group.forEach(([x,y]) => { board[y][x] = color; });
  const liberties = getLiberties(board, group);
  const answer = openPoint || pick(liberties);
  liberties.filter(([x,y]) => x !== answer[0] || y !== answer[1]).forEach(([x,y]) => { board[y][x] = enemy; });
  return { size, board, target: group[0], group, answer, color, enemy };
}

function atariPosition(color = "b", difficulty = "easy") {
  difficulty = normalizedDifficulty(difficulty);
  for (let attempt=0; attempt<60; attempt += 1) {
    const size = difficulty === "hard" ? 7 : 5;
    const shape = difficulty === "easy" ? [[0,0]] : difficulty === "medium"
      ? pick([[[0,0],[1,0]],[[0,0],[0,1]]])
      : pick([[[0,0],[1,0],[0,1]],[[0,0],[1,0],[2,0]],[[0,0],[0,1],[1,1]]]);
    const [ax,ay] = randomAnchorForShape(size, shape), group = shape.map(([dx,dy])=>[ax+dx,ay+dy]);
    const position = atariFromGroup(size, group, color);
    if (!validPosition(position.board)) continue;
    if (difficulty !== "easy") {
      const empties=[];
      for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!position.board[y][x]&&Math.abs(x-ax)+Math.abs(y-ay)>3)empties.push([x,y]);
      shuffled(empties).slice(0,difficulty==="hard"?4:2).forEach(([x,y],i)=>{position.board[y][x]=i%2?color:otherColor(color);});
      if(!validPosition(position.board))continue;
    }
    return position;
  }
  return atariFromGroup(5, [[2,2]], color, [3,2]);
}

function transformPosition(position) {
  const rotation = randomInt(4), mirror = Math.random() > .5, size = position.size;
  const point = value => transformTacticalPoint(value, size, rotation, mirror);
  return {
    ...position,
    board: createBoard(size, boardStones(position.board).map(([x,y,color])=>[...point([x,y]),color])),
    target: point(position.target),
    group: position.group?.map(point),
    answer: point(position.answer)
  };
}

function defenseMoves(position, minimumLiberties = 2) {
  const moves=[];
  for(let y=0;y<position.size;y++)for(let x=0;x<position.size;x++){
    const result=playMove(position.board,x,y,position.color || "b");
    if(!result.legal || result.board[position.target[1]]?.[position.target[0]] !== (position.color||"b"))continue;
    const group=getGroup(result.board,...position.target), liberties=countLiberties(result.board,group);
    if(liberties>=minimumLiberties)moves.push({point:[x,y],liberties,captured:result.captured.length});
  }
  return moves;
}

function escapePosition(type = "A") {
  let position;
  if (type === "A") position = atariFromGroup(5, [[2,2]], "b", [3,2]);
  if (type === "B") position = atariFromGroup(5, [[1,2],[2,2]], "b", [3,2]);
  if (type === "C") position = atariFromGroup(6, [[2,2],[3,2],[2,3]], "b", [4,2]);
  if (type === "D") position = atariFromGroup(5, [[0,2]], "b", [0,3]);
  if (type === "E") position = atariFromGroup(5, [[0,0]], "b", [1,0]);
  if (type === "F") {
    position = atariFromGroup(5, [[2,2]], "b", [3,2]);
    [[3,1],[3,3]].forEach(([x,y])=>{position.board[y][x]="w";});
  }
  if (type === "G") {
    position = atariFromGroup(6, [[2,2]], "b", [3,2]);
    position.board[2][4] = "b";
  }
  if (type === "H") {
    const size=5, board=createBoard(size, [
      [2,2,"b"], [2,1,"w"], [1,2,"w"], [2,3,"w"],
      [4,1,"w"], [4,2,"w"], [4,0,"b"], [3,1,"b"], [4,3,"b"]
    ]);
    position={size,board,target:[2,2],group:[[2,2]],answer:[3,2],color:"b",enemy:"w"};
  }
  return transformPosition(position);
}

function generateQuestion(skill, mastery = 0, difficultyOverride = null) {
  const difficulty = normalizedDifficulty(difficultyOverride || difficultyFor(mastery));
  if (skill === "intro") return introQuestion(difficulty);
  if (skill === "liberty") return Math.random() < .48 ? countLibertiesQuestion(difficulty) : selectLibertiesQuestion(difficulty);
  if (skill === "group") return groupQuestion(difficulty);
  if (skill === "atari") return atariQuestion(skill, difficulty);
  if (["capture", "hunt", "whole-capture"].includes(skill)) return captureQuestion(skill, difficulty);
  if (skill === "escape") return escapeQuestion(difficulty);
  if (skill === "chase") return chaseQuestion(difficulty);
  if (skill === "suicide") return suicideQuestion(difficulty);
  if (skill === "ko") return koQuestion(difficulty);
  return countLibertiesQuestion(difficulty);
}

function base(question) { return { id:id(), createdAt:new Date().toISOString(), questionType:question.questionType || question.type, ...question }; }
function introQuestion(difficulty) {
  const list = [
    ["围棋棋子应该下在哪里？",["格子中央","交叉点","棋盘外"],"交叉点","棋子下在横线和竖线的交叉点。"],
    ["围棋开局时，哪一方先下？",["白棋","黑棋","同时下"],"黑棋","围棋采用黑先白后。"],
    ["完全初学时，最推荐哪种棋盘？",["19×19","13×13","9×9"],"9×9","局面较小的 9×9 最适合理解规则。"],
    ["黑棋下完一手后，轮到谁？",["黑棋","白棋","双方同时"],"白棋","双方每次只下一手，轮流行棋。"]
  ]; const [prompt,options,answer,explanation]=pick(list);
  return base({skill:"intro",difficulty,type:"choice",prompt,options:shuffled(options),answer,explanation,signature:`intro-${prompt}`});
}
function countLibertiesQuestion(difficulty) {
  const position=libertyPosition(difficulty);
  return base({skill:"liberty",difficulty,type:"count",questionType:"count-liberties",prompt:"这块黑棋共有几口气？",answer:countLiberties(position.board,position.group),explanation:"只数整块黑棋上下左右相邻的空交叉点；斜线不算。",board:{size:position.size,stones:boardStones(position.board),highlights:position.group},signature:`count-${boardStones(position.board).map(s=>s.join("")).join("-")}`});
}
function selectLibertiesQuestion(difficulty) {
  const position=libertyPosition(difficulty),answer=getLiberties(position.board,position.group).map(([x,y])=>keyOf(x,y));
  return base({skill:"liberty",difficulty,type:"multi",questionType:"select-liberties",prompt:"请点击这块黑棋所有的气，然后提交答案。",answer,explanation:"气只在上下左右；相连的黑棋共享全部气。",board:{size:position.size,stones:boardStones(position.board),highlights:position.group},signature:`multi-${boardStones(position.board).map(s=>s.join("")).join("-")}`});
}
function groupQuestion(difficulty) {
  const size=difficulty==="hard"?7:5,connected=Math.random()>.5,[x,y]=[1+randomInt(size-2),1+randomInt(size-2)];
  const second=connected?pick([[x+1,y],[x,y+1],[x-1,y],[x,y-1]]):pick([[x+1,y+1],[x-1,y+1]]);
  const stones=[[x,y,"b"],[...second,"b"]];
  if(difficulty==="hard")[[0,0,"w"],[size-1,size-1,"b"],[0,size-1,"w"]].forEach(stone=>stones.push(stone));
  return base({skill:"group",difficulty,type:"choice",questionType:"identify-group",prompt:"高亮的两颗黑棋属于同一块棋（Group）吗？",options:shuffled(["是","否"]),answer:connected?"是":"否",explanation:connected?"上下左右相连的同色棋属于同一块棋。":"斜线相邻不算连接。",board:{size,stones,highlights:[[x,y],second]},signature:`group-${connected}-${second[0]-x},${second[1]-y}-${x},${y}`});
}
function atariQuestion(skill,difficulty) {
  const position=atariPosition("b",difficulty),group=getGroup(position.board,...position.target),answer=getLiberties(position.board,group)[0];
  return base({skill,difficulty,type:"click",questionType:"find-atari-liberty",toPlay:"w",prompt:difficulty==="hard"?"找出高亮黑棋的最后一口气。棋盘上还有其他干扰棋。":"这块黑棋正在被打吃。请点击它最后一口气。",answer:keyOf(...answer),acceptedAnswers:[keyOf(...answer)],explanation:"占住最后一口气后，高亮的黑棋会被提走。",board:{size:position.size,stones:boardStones(position.board),highlights:group},signature:`atari-${boardStones(position.board).map(s=>s.join("")).join("-")}-${keyOf(...answer)}`});
}
function captureQuestion(skill,difficulty) {
  const requested=skill==="whole-capture"?"hard":difficulty,position=atariPosition("b",requested),target=getGroup(position.board,...position.target),answer=getLiberties(position.board,target)[0];
  return base({skill,difficulty,type:"click",questionType:"capture-point",toPlay:"w",prompt:skill==="whole-capture"?"轮到白棋。请提掉整块相连的黑棋。":"轮到白棋。请判断哪一手能真正提掉高亮黑棋。",answer:keyOf(...answer),acceptedAnswers:[keyOf(...answer)],explanation:`这一步占住最后一口气，会提掉 ${target.length} 颗黑棋。`,board:{size:position.size,stones:boardStones(position.board),highlights:target},signature:`capture-${boardStones(position.board).map(s=>s.join("")).join("-")}-${keyOf(...answer)}`});
}
function escapeQuestion(difficulty) {
  const types=difficulty==="easy"?["A","D","E"]:difficulty==="medium"?["A","B","C","D","E","G"]:["B","C","F","G","H"],scenarioType=pick(types),position=escapePosition(scenarioType);
  const target=getGroup(position.board,...position.target),isFalse=scenarioType==="F";
  const moves=isFalse?[{point:position.answer,liberties:1,captured:0}]:defenseMoves(position,2);
  const accepted=moves.map(move=>keyOf(...move.point));
  if(!accepted.length)return escapeQuestion(difficulty);
  const answer=accepted.includes(keyOf(...position.answer))?keyOf(...position.answer):accepted[0];
  const descriptions={A:"单颗棋延伸",B:"两颗连接棋逃跑",C:"不规则棋块逃跑",D:"边上逃跑",E:"角上逃跑",F:"危险延伸",G:"连接自己的棋",H:"通过提子获得新气"};
  return base({skill:"escape",difficulty,type:"click",questionType:`escape-${scenarioType.toLowerCase()}`,scenarioType,toPlay:"b",prompt:isFalse?"这块棋被打吃。请下在唯一能延伸的位置，再观察它是否真的安全。":`${descriptions[scenarioType]}：请选择能让高亮黑棋脱离打吃的一手。`,answer,acceptedAnswers:accepted,escapeOutcome:isFalse?"still-atari":"safe",explanation:isFalse?"虽然延伸了，但整块棋仍然只有 1 口气，依旧很危险。":scenarioType==="H"?"这一步同时提掉对方棋，空出的交叉点变成新的气。":"规则引擎重新计算后，这块棋已经有至少 2 口气。",board:{size:position.size,stones:boardStones(position.board),highlights:target},signature:`escape-${scenarioType}-${boardStones(position.board).map(s=>s.join("")).join("-")}-${accepted.join("|")}`});
}
function chaseQuestion(difficulty) {
  const sequence=createChaseSequence(difficulty),moves=sequence.attackingMoves().map(([x,y])=>keyOf(x,y));
  return base({skill:"chase",difficulty,type:"chase-interactive",questionType:"multi-move-chase",prompt:"连续追击：先找到能打吃高亮黑棋的一手。对方会自动选择合理逃跑。",answer:moves[0],acceptedAnswers:moves,explanation:"每一步都必须继续打吃目标棋，直到吃掉它或让它逃脱。",board:{size:sequence.size,stones:boardStones(sequence.board),highlights:sequence.targetGroup()},tactical:{targetPoint:sequence.targetPoint,targetColor:"b",attacker:"w",targetSteps:sequence.targetSteps},signature:`chase-${boardStones(sequence.board).map(s=>s.join("")).join("-")}`});
}
function suicideQuestion(difficulty) {
  const size=5,[x,y]=[1+randomInt(3),1+randomInt(3)],stones=[[x,y-1,"w"],[x-1,y,"w"],[x+1,y,"w"],[x,y+1,"w"]];
  return base({skill:"suicide",difficulty,type:"choice",questionType:"suicide-rule",prompt:"黑棋直接下在高亮点，而且不能吃掉任何白棋。这手合法吗？",options:shuffled(["合法","不合法"]),answer:"不合法",explanation:"落子后黑棋没有气，又没有提掉白棋，这是普通自杀。",board:{size,stones,highlights:[[x,y]]},signature:`suicide-${x},${y}`});
}
function koQuestion(difficulty) {
  const sequence=new KoSequence();
  return base({skill:"ko",difficulty,type:"ko-interactive",questionType:"ko-sequence",prompt:sequence.prompt(),answer:keyOf(...sequence.expectedPoint()),explanation:"立即恢复上一局面会违反简单劫；隔一回合后才可以提回。",board:{size:sequence.size,stones:boardStones(sequence.board),highlights:[sequence.expectedPoint()]},signature:`ko-sequence-${Math.random().toString(36).slice(2,7)}`});
}

function questionSnapshot(question) { return JSON.parse(JSON.stringify(question)); }
function answerText(answer) { return Array.isArray(answer) ? answer.join("、") : String(answer); }
function isAtariPosition(question) { if(!question.board?.highlights?.[0])return false;const board=createBoard(question.board.size,question.board.stones),[x,y]=question.board.highlights[0];return checkAtari(board,x,y); }
function mistakeKeyFor(question) { return `${question.skill}|${question.questionType||question.type}|${question.difficulty}`; }
function classifyError(question,answer) {
  if(question.skill==="liberty") {
    if(question.type==="count")return Number(answer)>Number(question.answer)?"counted-diagonal":"missed-group-liberty";
    return Array.isArray(answer)&&answer.length>question.answer.length?"duplicate-liberty-count":"missed-group-liberty";
  }
  if(question.skill==="atari")return "failed-to-detect-one-liberty";
  if(["capture","hunt","whole-capture"].includes(question.skill))return "wrong-capture-point";
  if(question.skill==="escape")return question.scenarioType==="G"?"missed-connection":question.scenarioType==="H"?"missed-capture-defense":"failed-to-extend";
  if(question.skill==="chase")return "lost-chase";
  return "needs-review";
}
