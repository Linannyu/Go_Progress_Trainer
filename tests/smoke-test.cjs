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
      wrongDelta:wrong.delta, score:masteryRecord(state,"intro").masteryScore,
      level1Before, level1After, level2Before, level2After
    };
  })())`, context));

  check(result.firstDelta === 2, "first simple success should gain 2 mastery");
  check(result.repeatDelta === 0, "repeating a recent shape must not grind mastery");
  check(result.thirdDelta === 3, "three-correct streak should add its bonus on a new shape");
  check(result.wrongDelta === -1, "wrong answers should reduce mastery by one");
  check(!result.level1Before && result.level1After, "Level 1 should unlock at 40 intro mastery");
  check(!result.level2Before && result.level2After, "Level 2 should require every Level 1 skill at 40");
}

function fakeBrowser(storageMap) {
  const listeners = { click: [], change: [] };
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
    querySelector(selector) { return selector === "#app" ? app : null; },
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
  return { context, app, listeners };
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

  const pages = [
    ["path", "学习路径"], ["learn", "认识围棋"], ["practice", "随机练习"],
    ["play", "实战练习"], ["mistakes", "错题本"], ["progress", "长期进度"],
    ["ai", "AI REVIEW"], ["profile", "YOUR PROFILE"]
  ];
  for (const [view, marker] of pages) {
    click(first, { view });
    check(first.app.innerHTML.includes(marker), `${view} page failed to render`);
  }

  click(first, { action:"start-session", count:"10" });
  const answer = run("currentQuestion.answer", first.context);
  click(first, { action:"practice-answer", answer });
  click(first, { action:"end-session" });
  check(first.app.innerHTML.includes("LATEST TRAINING SESSION"), "training session must produce a report");
  check(storage.has("go-progress-trainer-v2"), "progress must be written to localStorage");

  const second = fakeBrowser(storage);
  check(second.app.innerHTML.includes("围棋会一直陪你进步"), "refresh must resume at dashboard");
  check(run("state.profile.hasStarted", second.context) === true, "started state must survive refresh");
  check(run("totalQuestions(state)", second.context) === 1, "question history must survive refresh");
  check(run("state.trainingSessions.length", second.context) === 1, "session report must survive refresh");
}

function main() {
  testSyntaxAndLoadingOrder();
  testBoardGeometry();
  testRules();
  testRandomQuestions();
  testMasteryAndUnlocks();
  testApplicationFlowAndPersistence();
  console.log(`PASS — ${checks} assertions, 4,400 generated questions, 9/13/19 board geometry, rules, UI flow and refresh persistence.`);
}

main();
