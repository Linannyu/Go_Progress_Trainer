#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scripts = ["lessons.js", "rules.js", "storage.js", "progress.js", "practice.js", "board.js", "app.js"];
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function source(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function run(code, context) {
  return vm.runInContext(code, context, { timeout: 10_000 });
}

function coreContext() {
  const context = vm.createContext({ console });
  for (const file of scripts.slice(0, 5)) run(source(file), context);
  return context;
}

function testSyntaxAndLoadingOrder() {
  for (const file of scripts) {
    new vm.Script(source(file), { filename: file });
    checks += 1;
  }

  const html = source("index.html");
  const loaded = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(loaded, scripts, "classic scripts must load in dependency order");
  checks += 1;
  check(!/<script[^>]+type=["']module/.test(html), "file:// startup must not depend on ES modules");
}

function testBoardGeometry() {
  const css = source("style.css");
  check(css.includes("grid-template-rows: repeat(var(--size), minmax(0, 1fr))"), "board rows must be fixed equal tracks");
  check(css.includes("grid-template-columns: repeat(var(--size), minmax(0,1fr))"), "board columns must be fixed equal tracks");
  check(css.includes(".go-board::before"), "grid lines must use a clipped inner layer");
  check(css.includes("inset: calc(50% / var(--size))"), "grid lines must stop at the outer intersections");
  check(css.includes("calc(100% / (var(--size) - 1))"), "clipped grid needs exactly N-1 spaces between N lines");
  check(css.includes(".stone.b") && css.includes(".stone.w"), "both stone materials must have dedicated rendering");
  check(css.includes(".stone::before") && css.includes("filter: blur(.7px)"), "stones need a soft specular highlight instead of a flat fill");
  check(css.includes("stone-capture") && css.includes(".being-captured"), "captured stones need a visible removal animation");

  // Reproduce the final CSS sizing formula over phone, tablet and desktop widths.
  for (const lab of [false, true]) {
    for (const parentWidth of [180, 220, 350, 438, 625, 900]) {
      const effectiveParent = lab ? Math.min(parentWidth, 625) : parentWidth;
      const boardOuter = lab ? effectiveParent - 18 : Math.min(effectiveParent - 18, 420);
      // The reference-style edge is a painted 1px outline, not a thick layout
      // border. The first/last grid lines sit half a cell inside the wood slab.
      const boardInner = boardOuter;
      const labelInner = Math.min(effectiveParent - 18, lab ? 625 : 420);
      check(Math.abs(boardInner - labelInner) < 0.001, `labels and intersections diverge at width ${parentWidth}`);
      for (const size of [9, 13, 19]) {
        const gridStart = boardInner / (2 * size);
        const gridEnd = boardInner - gridStart;
        check(gridStart > 0 && gridEnd < boardInner, `${size}x${size} grid must leave a clean wooden margin`);
        for (let point = 0; point < size; point += 1) {
          const clickCenter = (point + 0.5) * boardInner / size;
          const lineCenter = gridStart + point * (gridEnd - gridStart) / (size - 1);
          check(Math.abs(clickCenter - lineCenter) < 0.001, `${size}x${size} point ${point} is off-center`);
        }
      }
    }
  }

  const boardSource = source("board.js");
  check(boardSource.includes("ABCDEFGHJKLMNOPQRST"), "Go coordinates must skip I");
  check(boardSource.includes("size: this.size"), "board reset must retain board size");
  check(boardSource.includes("animateMove") && boardSource.includes("result.captured"), "practice board needs a staged move-and-capture animation");
  const context = vm.createContext({ console });
  run(source("rules.js"), context);
  run(boardSource, context);
  const stars = JSON.parse(run(`JSON.stringify({
    nine:[...starPointKeys(9)], thirteen:[...starPointKeys(13)], nineteen:[...starPointKeys(19)]
  })`, context));
  check(stars.nine.length === 5 && stars.nine.includes("4,4"), "9x9 needs four corner stars and tengen");
  check(stars.thirteen.length === 5 && stars.thirteen.includes("6,6"), "13x13 needs four corner stars and tengen");
  check(stars.nineteen.length === 9 && stars.nineteen.includes("9,9"), "19x19 needs nine standard star points");
}

function testRules() {
  const context = coreContext();
  const result = JSON.parse(run(`JSON.stringify((() => {
    const liberties = stones => {
      const b = createBoard(9, stones);
      return countLiberties(b, getGroup(b, stones[0][0], stones[0][1]));
    };
    const diagonal = createBoard(5, [[1,1,"b"],[2,2,"b"]]);

    const singleCapture = createBoard(5, [[2,2,"b"],[2,1,"w"],[1,2,"w"],[2,3,"w"]]);
    const singleResult = playMove(singleCapture, 3, 2, "w");

    const groupCapture = createBoard(5, [
      [1,2,"b"],[2,2,"b"],
      [1,1,"w"],[2,1,"w"],[0,2,"w"],[1,3,"w"],[2,3,"w"]
    ]);
    const groupResult = playMove(groupCapture, 3, 2, "w");

    const suicide = createBoard(5, [[2,1,"w"],[1,2,"w"],[3,2,"w"],[2,3,"w"]]);

    // A complete simple-ko shape: black captures at (2,1); immediate white
    // recapture at (1,1) would reproduce the previous board exactly.
    const beforeKo = createBoard(5, [
      [1,1,"w"],[3,1,"w"],[2,0,"w"],[2,2,"w"],
      [0,1,"b"],[1,0,"b"],[1,2,"b"]
    ]);
    const koCapture = playMove(beforeKo, 2, 1, "b");
    const koRecapture = playMove(koCapture.board, 1, 1, "w", beforeKo);

    return {
      center: liberties([[4,4,"b"]]),
      edge: liberties([[0,4,"b"]]),
      corner: liberties([[0,0,"b"]]),
      pair: liberties([[3,4,"b"],[4,4,"b"]]),
      diagonalGroupSize: getGroup(diagonal, 1, 1).length,
      atari: checkAtari(singleCapture, 2, 2),
      singleLegal: singleResult.legal,
      singleCaptured: singleResult.captured.length,
      singleRemoved: singleResult.board[2][2] === null,
      groupCaptured: groupResult.captured.length,
      suicideLegal: isLegalMove(suicide, 2, 2, "b"),
      occupiedLegal: isLegalMove(singleCapture, 2, 2, "w"),
      koCaptureLegal: koCapture.legal,
      koRecaptureLegal: koRecapture.legal
    };
  })())`, context));

  assert.deepEqual(result, {
    center: 4, edge: 3, corner: 2, pair: 6, diagonalGroupSize: 1,
    atari: true, singleLegal: true, singleCaptured: 1, singleRemoved: true,
    groupCaptured: 2, suicideLegal: false, occupiedLegal: false,
    koCaptureLegal: true, koRecaptureLegal: false
  });
  checks += Object.keys(result).length;
}

function testRandomQuestions() {
  const context = coreContext();
  const result = JSON.parse(run(`JSON.stringify((() => {
    const skillsToTest = ["intro","liberty","group","atari","capture","suicide","ko","escape","hunt","whole-capture","chase"];
    const totals = {};
    const fail = (message, q) => { throw new Error(message + " :: " + JSON.stringify(q)); };
    const sameSet = (a, b) => a.length === b.length && a.every(item => b.includes(item));

    for (let round = 0; round < 4; round += 1) {
      for (const skill of skillsToTest) {
        for (let i = 0; i < 100; i += 1) {
          const mastery = [0, 45, 80][i % 3];
          const q = generateQuestion(skill, mastery);
          totals[skill] = (totals[skill] || 0) + 1;
          if (!q.id || q.skill !== skill || !q.signature) fail("invalid question metadata", q);
          if (skill === "intro" || skill === "ko") {
            if (!q.options.includes(q.answer)) fail("choice answer missing from options", q);
            continue;
          }

          const board = createBoard(q.board.size, q.board.stones);
          if (skill === "liberty") {
            const group = getGroup(board, ...q.board.highlights[0]);
            if (q.type === "count" && q.answer !== countLiberties(board, group)) fail("wrong liberty count", q);
            if (q.type === "multi") {
              const actual = getLiberties(board, group).map(([x,y]) => keyOf(x,y));
              if (!sameSet(q.answer, actual)) fail("wrong liberty point set", q);
            }
          } else if (skill === "group") {
            const [first, second] = q.board.highlights;
            const connected = getGroup(board, ...first).some(([x,y]) => x === second[0] && y === second[1]);
            if (q.answer !== (connected ? "是" : "否")) fail("wrong group answer", q);
          } else if (skill === "atari" || skill === "chase") {
            const group = getGroup(board, ...q.board.highlights[0]);
            const liberties = getLiberties(board, group);
            if (liberties.length !== 1 || q.answer !== keyOf(...liberties[0])) fail("invalid atari answer", q);
            const [x,y] = q.answer.split(",").map(Number);
            const move = playMove(board, x, y, q.toPlay || "w");
            if (!move.legal || move.captured.length !== 1) fail("atari click must demonstrate the capture", q);
          } else if (["capture","hunt","whole-capture"].includes(skill)) {
            const [x,y] = q.answer.split(",").map(Number);
            const move = playMove(board, x, y, q.toPlay || "w");
            if (!move.legal || move.captured.length < 1) fail("capture answer does not capture", q);
            if (skill === "whole-capture" && move.captured.length < 2) fail("whole-capture must remove a group", q);
          } else if (skill === "escape") {
            const target = q.board.highlights[0];
            if (!checkAtari(board, ...target)) fail("escape target is not in atari", q);
            const [x,y] = q.answer.split(",").map(Number);
            const move = playMove(board, x, y, "b");
            const escaped = move.legal && countLiberties(move.board, getGroup(move.board, ...target)) > 1;
            if (!escaped) fail("escape answer does not gain liberties", q);
          } else if (skill === "suicide") {
            const [x,y] = q.board.highlights[0];
            if (isLegalMove(board, x, y, "b") || q.answer !== "不合法") fail("suicide answer is inconsistent", q);
          }
        }
      }
    }
    return { totals, total: Object.values(totals).reduce((sum, value) => sum + value, 0) };
  })())`, context));

  check(result.total === 4400, "random generator must survive four complete stress rounds");
  for (const count of Object.values(result.totals)) check(count === 400, "every skill needs the same stress coverage");
}

function testMasteryAndUnlocks() {
  const context = coreContext();
  const result = JSON.parse(run(`JSON.stringify((() => {
    const state = defaultState();
    const q = signature => ({ skill:"intro", difficulty:"simple", signature });
    const first = applyPracticeResult(state, q("shape-a"), true);
    const repeat = applyPracticeResult(state, q("shape-a"), true);
    const third = applyPracticeResult(state, q("shape-b"), true);
    const wrong = applyPracticeResult(state, q("shape-c"), false);
    const lessonState = defaultState();
    const lessonCorrect = applyPracticeResult(lessonState, q("guided-a"), true, {mode:"lesson",masteryGain:10});
    const lessonSingle = applyPracticeResult(lessonState, q("guided-b"), true, {mode:"lesson",masteryGain:40});
    const lessonWrong = applyPracticeResult(lessonState, q("guided-b"), false, {mode:"lesson"});
    const level1Before = levelUnlocked(state, 1);
    masteryRecord(state, "intro").masteryScore = 40;
    const level1After = levelUnlocked(state, 1);
    const level2Before = levelUnlocked(state, 2);
    Object.values(skillById).filter(skill => skill.level === 1).forEach(skill => {
      masteryRecord(state, skill.id).masteryScore = 40;
    });
    const level2After = levelUnlocked(state, 2);
    return {
      firstDelta:first.delta, repeatDelta:repeat.delta, thirdDelta:third.delta,
      wrongDelta:wrong.delta, lessonDelta:lessonCorrect.delta,
      lessonSingleDelta:lessonSingle.delta, lessonWrongDelta:lessonWrong.delta,
      score:masteryRecord(state,"intro").masteryScore,
      level1Before, level1After, level2Before, level2After
    };
  })())`, context));

  check(result.firstDelta === 2, "first simple success should gain 2 mastery");
  check(result.repeatDelta === 0, "repeating a recent shape must not grind mastery");
  check(result.thirdDelta === 3, "three-correct streak should add its bonus on a new shape");
  check(result.wrongDelta === -1, "wrong answers should reduce mastery by one");
  check(result.lessonDelta === 10 && result.lessonSingleDelta === 40, "guided mastery gain must adapt to the number of distinct operations");
  check(result.lessonWrongDelta === 0, "guided lesson mistakes should not reduce mastery");
  check(!result.level1Before && result.level1After, "Level 1 should unlock at 40 intro mastery");
  check(!result.level2Before && result.level2After, "Level 2 should require every Level 1 skill at 40");
}

function testLessonVisuals() {
  const context = coreContext();
  const result = JSON.parse(run(`JSON.stringify((() => {
    const required=Object.values(skillById).filter(skill=>skill.level<=2).map(skill=>skill.id);
    const guided=required.filter(id=>id!=="intro").map(id=>({id,...guidedPracticePlans[id]}));
    return {required,guided,visuals:required.map(id=>{
      const visual=tutorialVisuals[id];
      if(!visual)throw new Error("missing lesson visual: "+id);
      const points=[...visual.stones.map(stone=>stone.slice(0,2)),...visual.highlights];
      if(points.some(([x,y])=>x<0||y<0||x>=visual.size||y>=visual.size))throw new Error("visual point out of bounds: "+id);
      return {id,size:visual.size,stones:visual.stones.length,highlights:visual.highlights.length,notes:visual.notes.length};
    })};
  })())`, context));
  check(result.visuals.length === result.required.length, "every Level 0-2 skill needs a visual board explanation");
  check(result.guided.every(plan=>plan.count>=1&&plan.summary), "every guided Level 1-2 skill needs a bounded practice plan");
  check(result.guided.find(plan=>plan.id==="liberty").count === 4, "Liberty should keep four genuinely different exercises");
  check(result.guided.find(plan=>plan.id==="group").count === 3, "Group should cover horizontal, vertical and diagonal cases");
  check(result.guided.filter(plan=>!["liberty","group"].includes(plan.id)).every(plan=>plan.count===1), "single-operation skills must not repeat the same task");
  for (const visual of result.visuals) {
    check([5,9].includes(visual.size), `${visual.id} lesson visual needs a supported teaching-board size`);
    check(visual.highlights > 0 && visual.notes >= 2, `${visual.id} lesson visual needs highlights and explanation notes`);
  }
}

function fakeBrowser(storageMap) {
  const listeners = { click: [], change: [] };
  const feedback = { innerHTML: "" };
  const app = {
    innerHTML: "",
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); }
  };
  const localStorage = {
    getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
    setItem(key, value) { storageMap.set(key, String(value)); },
    removeItem(key) { storageMap.delete(key); }
  };
  const document = {
    body: { append() {} },
    querySelector(selector) { if(selector === "#app")return app;if(selector === "#practice-feedback")return feedback;return null; },
    createElement() { return { className:"", textContent:"", remove() {} }; }
  };
  const context = vm.createContext({
    console, document, localStorage,
    window: { addEventListener() {} },
    confirm: () => true,
    setTimeout: () => 0,
    clearTimeout: () => {}
  });
  for (const file of scripts) run(source(file), context);
  return { context, app, feedback, listeners };
}

function click(browser, dataset) {
  const target = {
    dataset,
    disabled: false,
    closest() { return this; }
  };
  const event = { target, preventDefault() {} };
  for (const handler of browser.listeners.click) handler(event);
}

function testApplicationFlowAndPersistence() {
  const storage = new Map();
  const first = fakeBrowser(storage);
  check(first.app.innerHTML.includes("欢迎开始学习围棋"), "first visit should render welcome screen");

  click(first, { action:"start" });
  check(first.app.innerHTML.includes("围棋会一直陪你进步"), "Start must open the dashboard");
  const answerPositions = JSON.parse(run(`JSON.stringify(tutorials.intro.questions.map((question,index)=>balancedOptions(question[1],index).indexOf(question[2])))`, first.context));
  const positionCounts = [0,1,2].map(position => answerPositions.filter(value => value === position).length);
  check(positionCounts.every(count => count >= 3), "Level 0 correct answers must be balanced across all three option positions");
  click(first, { action:"toggle-nav" });
  check(first.app.innerHTML.includes("topbar menu-open"), "mobile navigation button must expand the menu");
  check(first.app.innerHTML.includes('aria-expanded="true"'), "expanded mobile menu must expose its accessible state");

  const pages = [
    ["path", "学习路径"], ["learn", "认识围棋"], ["practice", "随机练习"],
    ["play", "实战练习"], ["mistakes", "错题本"], ["progress", "长期进度"],
    ["ai", "AI REVIEW"], ["profile", "YOUR PROFILE"]
  ];
  for (const [view, marker] of pages) {
    click(first, { view });
    check(first.app.innerHTML.includes(marker), `${view} page failed to render`);
    check(!first.app.innerHTML.includes("topbar menu-open"), `${view} navigation must close the mobile menu`);
    if(view === "learn")check(first.app.innerHTML.includes("lesson-visual-board"), "lesson page must include a visual teaching board");
  }

  run(`state.lessonProgress.intro={correctIds:Array.from({length:10},(_,i)=>"intro-check-"+(i+1))};selectedSkill="intro";view="learn";render()`, first.context);
  check(first.app.innerHTML.includes("10/10 已完成"), "Level 0 must show a visible completion state after all ten answers");
  check(first.app.innerHTML.includes('data-action="continue-intro"'), "Level 0 must provide a continue button");
  click(first, { action:"continue-intro" });
  check(run("selectedSkill", first.context) === "liberty", "continue button must open the Liberty skill");
  check(run('masteryRecord(state,"intro").masteryScore', first.context) >= 40, "finishing Level 0 must unlock Level 1");
  check(first.app.innerHTML.includes("LEVEL 1 · AVAILABLE"), "Liberty lesson must be available after Level 0 completion");

  check(first.app.innerHTML.includes('data-action="start-lesson-session"'), "skill lesson must start a bounded checkpoint");
  click(first, { action:"start-lesson-session", skill:"liberty" });
  check(run("state.activeSession.type", first.context) === "lesson", "lesson CTA must start guided lesson mode");
  check(run("state.activeSession.count", first.context) === 4, "Liberty must contain only four distinct exercises");
  check(first.app.innerHTML.includes("4 个关键练习"), "guided practice heading must show its real bounded count");
  const libertySignatures = new Set();
  for (let index = 0; index < 4; index += 1) {
    const answeredQuestionId = run("currentQuestion.id", first.context);
    libertySignatures.add(run("currentQuestion.signature", first.context));
    run("grade(currentQuestion,currentQuestion.answer)", first.context);
    check(run("currentQuestionResolved", first.context) === true, `guided question ${index + 1} must resolve after a correct answer`);
    check(run("state.activeSession.completed", first.context) === index + 1, `guided question ${index + 1} must advance progress once`);
    if (index === 0) {
      run("grade(currentQuestion,currentQuestion.answer)", first.context);
      check(run("state.activeSession.completed", first.context) === 1, "double-clicking a solved question must not advance progress twice");
    }
    if (index < 3) {
      click(first, { action:"next-question" });
      check(run("currentQuestion.id", first.context) !== answeredQuestionId, "next-question button must generate a different question instance");
      check(run("currentQuestionResolved", first.context) === false, "new question must reset its resolved state");
    }
  }
  check(libertySignatures.size === 4, "guided Liberty exercises must not repeat a position");
  check(first.feedback.innerHTML.includes("完成并查看结果"), "the final distinct exercise must provide a visible completion action");
  check(run('masteryRecord(state,"liberty").masteryScore', first.context) === 40, "bounded guided practice should establish basic understanding rather than fake mastery");
  click(first, { action:"next-question" });
  check(first.app.innerHTML.includes("SKILL PRACTICE COMPLETE"), "completed guided lesson must show a result card");
  check(first.app.innerHTML.includes("继续随机练习"), "result card must let the learner opt into more practice");
  check(first.app.innerHTML.includes("下一知识点"), "result card must offer the next learning skill");
  check(run("state.lessonProgress.liberty.practiceCompleted", first.context) === true, "guided lesson completion must be saved");

  click(first, { action:"learn-skill", skill:"atari" });
  check(first.app.innerHTML.includes("正确完成一次就进入下一节"), "single-operation lessons must clearly require only one success");
  click(first, { action:"start-lesson-session", skill:"atari" });
  check(run("state.activeSession.count", first.context) === 1, "Atari must require one key operation only");
  run('grade(currentQuestion,"not-the-answer")', first.context);
  check(run("state.activeSession.completed", first.context) === 0, "a wrong attempt must not complete a one-operation lesson");
  run("grade(currentQuestion,currentQuestion.answer)", first.context);
  check(run("state.activeSession.completed", first.context) === 1, "one correct Atari operation must complete the lesson");
  check(run('masteryRecord(state,"atari").masteryScore', first.context) === 40, "one-operation lesson must establish basic understanding");
  click(first, { action:"next-question" });
  check(first.app.innerHTML.includes("打吃 Atari · 关键操作已学会"), "one-operation lesson must show a concise completion report");
  check(run("state.lessonProgress.atari.practiceCompleted", first.context) === true, "single-operation completion must be saved");
  check(storage.has("go-progress-trainer-v2"), "progress must be written to localStorage");

  const second = fakeBrowser(storage);
  check(second.app.innerHTML.includes("围棋会一直陪你进步"), "refresh must resume at dashboard");
  check(run("state.profile.hasStarted", second.context) === true, "started state must survive refresh");
  check(run("totalQuestions(state)", second.context) === 6, "question history must survive refresh");
  check(run("state.trainingSessions.length", second.context) === 2, "session reports must survive refresh");
  check(run("state.lessonProgress.intro.completed", second.context) === true, "Level 0 completion must survive refresh");
  check(run("state.lessonProgress.liberty.practiceCompleted", second.context) === true, "guided skill completion must survive refresh");
  check(run("state.lessonProgress.atari.practiceCompleted", second.context) === true, "single-operation completion must survive refresh");
}

function main() {
  testSyntaxAndLoadingOrder();
  testBoardGeometry();
  testRules();
  testRandomQuestions();
  testMasteryAndUnlocks();
  testLessonVisuals();
  testApplicationFlowAndPersistence();
  console.log(`PASS — ${checks} assertions, 4,400 generated questions, 9/13/19 board geometry, rules, UI flow and refresh persistence.`);
}

main();
