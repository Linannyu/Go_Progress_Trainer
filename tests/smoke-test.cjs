#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scripts = ["lessons.js","rules.js","storage.js","progress.js","tactics.js","practice.js","board.js","app.js"];
let checks = 0, generated = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const source = file => fs.readFileSync(path.join(root,file),"utf8");
const run = (code,context) => vm.runInContext(code,context,{timeout:20_000});
function coreContext(){const context=vm.createContext({console});for(const file of scripts.slice(0,6))run(source(file),context);return context;}

function testSyntaxAndLoading(){
  scripts.forEach(file=>{new vm.Script(source(file),{filename:file});checks+=1;});
  const loaded=[...source("index.html").matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(loaded,scripts);checks+=1;
  check(!source("index.html").includes('type="module"'),"file:// startup must stay build-free");
}

function testLocalDatesAndActiveTimer(){
  const context=coreContext();
  const result=JSON.parse(run(`JSON.stringify((()=>{
    const state=defaultState();
    const late=new Date(2026,7,16,23,45,0),next=new Date(2026,7,17,0,5,0);
    touchStudy(state,late);const first={key:state.lastStudyDate,streak:state.streak};touchStudy(state,next);const second={key:state.lastStudyDate,streak:state.streak};
    const timer=createActiveStudyTimer(0);activateStudy(state,timer,0);commitActiveStudy(state,timer,60000);
    activateStudy(state,timer,60000);commitActiveStudy(state,timer,60000+60*60*1000);
    const migrated=migrateState({studyTimeSeconds:321,profile:{hasStarted:true},skillMastery:{liberty:{masteryScore:17}}});
    return {format:/^\\d{4}-\\d{2}-\\d{2}$/.test(getLocalDateKey(late)),first,second,study:state.studyTimeSeconds,daily:Object.values(state.dailyStudySeconds).reduce((a,b)=>a+b,0),timerActive:timer.active,migrated:{version:migrated.storageVersion,time:migrated.studyTimeSeconds,started:migrated.profile.hasStarted,mastery:migrated.skillMastery.liberty.masteryScore}};
  })())`,context));
  check(result.format,"local date key needs YYYY-MM-DD");
  check(result.first.key!==result.second.key&&result.second.streak===2,"local midnight must advance streak exactly once");
  check(result.study===240&&result.daily===240&&!result.timerActive,"one active minute plus idle-capped three minutes should be recorded");
  assert.deepEqual(result.migrated,{version:3,time:321,started:true,mastery:17});checks+=4;
  check(!/toISOString\(\)\.slice\(0,\s*10\)/.test(source("storage.js")+source("app.js")),"daily logic must not use UTC ISO keys");
  check(source("app.js").includes("visibilitychange")&&source("storage.js").includes("ACTIVE_STUDY_TIMEOUT_MS"),"visibility pause and 3-minute idle cap are required");
}

function testRulesKoAndHistory(){
  const context=vm.createContext({console});run(source("rules.js"),context);run(source("board.js"),context);
  const result=JSON.parse(run(`JSON.stringify((()=>{
    const make=(stones=[],toPlay="b")=>{const board=Object.create(GoBoard.prototype);Object.assign(board,{size:5,board:createBoard(5,stones),previousBoard:null,toPlay,lastMove:null,captures:{b:0,w:0},moveNumber:0,passCount:0,gameOver:false,moveHistory:[],history:[],future:[],locked:false,highlights:[],labels:{},draw(){},onMove(){}});return board;};
    const pass=make();pass.pass();const afterPass={toPlay:pass.toPlay,moves:pass.moveNumber,history:pass.moveHistory};pass.undo();const passUndo={toPlay:pass.toPlay,moves:pass.moveNumber};pass.redo();const passRedo={toPlay:pass.toPlay,moves:pass.moveNumber};pass.pass();const twoPass={over:pass.gameOver,passes:pass.passCount};pass.undo();const twoPassUndo={over:pass.gameOver,passes:pass.passCount};
    const capture=make([[2,2,"b"],[2,1,"w"],[1,2,"w"],[2,3,"w"]],"w");capture.handleClick(3,2);const captured={count:capture.captures.w,empty:capture.board[2][2]===null,moves:capture.moveNumber};capture.undo();const captureUndo={count:capture.captures.w,stone:capture.board[2][2]};capture.redo();const captureRedo={count:capture.captures.w,empty:capture.board[2][2]===null};
    const beforeKo=createBoard(5,[[1,1,"w"],[3,1,"w"],[2,0,"w"],[2,2,"w"],[0,1,"b"],[1,0,"b"],[1,2,"b"]]);const koCapture=playMove(beforeKo,2,1,"b"),koReturn=playMove(koCapture.board,1,1,"w",beforeKo);
    return {afterPass,passUndo,passRedo,twoPass,twoPassUndo,captured,captureUndo,captureRedo,koLegal:koCapture.legal,recaptureLegal:koReturn.legal,sgf:exportSGF(5,capture.moveHistory)};
  })())`,context));
  check(result.afterPass.toPlay==="w"&&result.afterPass.moves===1&&result.afterPass.history[0].pass,"Pass must be a real move");
  assert.deepEqual(result.passUndo,{toPlay:"b",moves:0});checks+=2;
  assert.deepEqual(result.passRedo,{toPlay:"w",moves:1});checks+=2;
  check(result.twoPass.over&&result.twoPass.passes===2&&!result.twoPassUndo.over&&result.twoPassUndo.passes===1,"two passes and undo must restore game status");
  assert.deepEqual(result.captured,{count:1,empty:true,moves:1});checks+=3;
  assert.deepEqual(result.captureUndo,{count:0,stone:"b"});checks+=2;
  assert.deepEqual(result.captureRedo,{count:1,empty:true});checks+=2;
  check(result.koLegal&&!result.recaptureLegal,"immediate Ko recapture must be illegal");
  check(result.sgf.includes("SZ[5]")&&result.sgf.includes(";W[dc]"),"basic SGF export must contain board size and move");
}

function testDynamicQuestions(){
  const context=coreContext();
  const result=JSON.parse(run(`JSON.stringify((()=>{
    const totals={liberty:0,atari:0,capture:0,escape:0,group:0},escapeTypes={},difficulties=new Set();
    const fail=(message,q)=>{throw new Error(message+" :: "+JSON.stringify(q));};
    const validateBoard=board=>{const seen=new Set();for(let y=0;y<board.length;y++)for(let x=0;x<board.length;x++){if(!board[y][x]||seen.has(keyOf(x,y)))continue;const group=getGroup(board,x,y);group.forEach(([gx,gy])=>seen.add(keyOf(gx,gy)));if(!countLiberties(board,group))return false;}return true;};
    const validate=(skill,count)=>{for(let i=0;i<count;i++){
      const difficulty=["easy","medium","hard"][i%3],q=generateQuestion(skill,0,difficulty);totals[skill]++;difficulties.add(q.difficulty);if(!q.id||q.skill!==skill||!q.signature)fail("metadata",q);
      if(!q.board)continue;const board=createBoard(q.board.size,q.board.stones);if(!validateBoard(board))fail("illegal static board",q);
      if(skill==="liberty"){const group=getGroup(board,...q.board.highlights[0]),actual=getLiberties(board,group).map(([x,y])=>keyOf(x,y));if(q.type==="count"&&q.answer!==actual.length)fail("liberty count",q);if(q.type==="multi"&&(q.answer.length!==actual.length||!q.answer.every(a=>actual.includes(a))))fail("liberty points",q);}
      if(skill==="group"){const [a,b]=q.board.highlights,connected=getGroup(board,...a).some(([x,y])=>x===b[0]&&y===b[1]);if(q.answer!==(connected?"是":"否"))fail("group",q);}
      if(skill==="atari"){const group=getGroup(board,...q.board.highlights[0]),libs=getLiberties(board,group);if(libs.length!==1||q.answer!==keyOf(...libs[0]))fail("atari answer",q);const [x,y]=libs[0],move=playMove(board,x,y,q.toPlay);if(!move.legal||move.captured.length<group.length)fail("atari capture",q);}
      if(skill==="capture"){const [x,y]=q.answer.split(",").map(Number),move=playMove(board,x,y,q.toPlay);if(!move.legal||!move.captured.length)fail("capture",q);}
      if(skill==="escape"){escapeTypes[q.scenarioType]=(escapeTypes[q.scenarioType]||0)+1;const target=q.board.highlights[0];if(!checkAtari(board,...target))fail("escape target not atari",q);for(const key of q.acceptedAnswers){const [x,y]=key.split(",").map(Number),move=playMove(board,x,y,"b");if(!move.legal)fail("illegal escape",q);const group=getGroup(move.board,...target),libs=countLiberties(move.board,group);if(q.escapeOutcome==="still-atari"?libs!==1:libs<2)fail("escape outcome",q);}}
    }};
    validate("liberty",1000);validate("atari",1000);validate("capture",1000);validate("escape",500);validate("group",500);
    // Force coverage of all eight escape families, including connection/capture defense.
    for(const type of "ABCDEFGH"){const p=escapePosition(type),qBoard=createBoard(p.size,boardStones(p.board)),target=getGroup(qBoard,...p.target);if(countLiberties(qBoard,target)!==1)throw new Error("escape type not atari: "+type);escapeTypes[type]=(escapeTypes[type]||0)+1;}
    return {totals,escapeTypes,difficulties:[...difficulties]};
  })())`,context));
  generated+=Object.values(result.totals).reduce((a,b)=>a+b,0);
  assert.deepEqual(result.totals,{liberty:1000,atari:1000,capture:1000,escape:500,group:500});checks+=5;
  check("ABCDEFGH".split("").every(type=>result.escapeTypes[type]>0),"Escape A-H all need valid positions");
  assert.deepEqual(result.difficulties.sort(),["easy","hard","medium"]);checks+=3;
}

function testTacticalSequences(){
  const context=coreContext();
  const result=JSON.parse(run(`JSON.stringify((()=>{
    let chaseCompleted=0,minTurns=99,maxTurns=0;
    for(let i=0;i<300;i++){const sequence=createChaseSequence(["easy","medium","hard"][i%3]);let guard=0;while(sequence.status==="active"&&guard++<6){const moves=sequence.attackingMoves();if(!moves.length)throw new Error("chase has no continuation");const result=sequence.playAttack(...moves[0]);if(!result.ok)throw new Error("valid chase rejected");}if(sequence.status==="active")throw new Error("chase did not end");chaseCompleted++;minTurns=Math.min(minTurns,sequence.attackStep);maxTurns=Math.max(maxTurns,sequence.attackStep);}
    const ko=new KoSequence(),s0=ko.play(...ko.points.capture),s1=ko.play(...ko.points.recapture),s2=ko.play(...ko.points.threat),s3=ko.play(...ko.points.recapture);
    return {chaseCompleted,minTurns,maxTurns,ko:{stages:[s0.ok,s1.koBlocked,s2.ok,s3.complete],stage:ko.stage}};
  })())`,context));
  generated+=300;
  check(result.chaseCompleted===300&&result.minTurns>=2&&result.maxTurns<=5,"Chase must end in 2-5 attacker turns");
  assert.deepEqual(result.ko,{stages:[true,true,true,true],stage:4});checks+=5;
}

function testMasteryAccessAdaptive(){
  const context=coreContext();
  const result=JSON.parse(run(`JSON.stringify((()=>{
    const state=defaultState(),q={skill:"liberty",difficulty:"easy",signature:"one"};
    const lesson=applyPracticeResult(state,q,true,{mode:"lesson",masteryGain:20});
    state.lessonProgress.intro={completed:true};masteryRecord(state,"intro").masteryScore=20;
    const accessPreview=levelAccess(state,1);
    masteryRecord(state,"intro").masteryScore=60;const accessAvailable=levelAccess(state,1);
    const adaptiveState=defaultState();adaptiveState.settings.unlockAllLevels=true;Object.values(skillById).filter(skill=>skill.practiceable).forEach(skill=>masteryRecord(adaptiveState,skill.id).masteryScore=80);masteryRecord(adaptiveState,"escape").masteryScore=5;masteryRecord(adaptiveState,"capture").masteryScore=50;masteryRecord(adaptiveState,"liberty").masteryScore=95;masteryRecord(adaptiveState,"capture").lastPracticed=new Date().toISOString();masteryRecord(adaptiveState,"capture").lastPracticedDate=getLocalDateKey();
    return {lesson,accessPreview,accessAvailable,weak:adaptiveSkill(adaptiveState,()=>.1).id,recent:adaptiveSkill(adaptiveState,()=>.6).id,review:adaptiveSkill(adaptiveState,()=>.9).id,defaultCall:adaptiveSkill(adaptiveState).id};
  })())`,context));
  check(result.lesson.after===20,"one guided operation should introduce a skill, not grant 40% mastery");
  check(result.accessPreview==="preview"&&result.accessAvailable==="available","level access needs Preview at lesson completion and Available at 60+");
  check(result.weak==="escape"&&result.recent==="capture","adaptive mix should prioritize weakest and recent skills");
  check(result.review,"adaptive review branch must always return a skill");
  check(result.defaultCall,"adaptive default RNG must remain callable in the browser");
}

function fakeBrowser(storageMap){
  const listeners={click:[],change:[]},documentListeners={},feedback={innerHTML:""};
  const app={innerHTML:"",addEventListener(type,handler){(listeners[type]||=[]).push(handler);}};
  const localStorage={getItem:key=>storageMap.has(key)?storageMap.get(key):null,setItem:(key,value)=>storageMap.set(key,String(value)),removeItem:key=>storageMap.delete(key)};
  const document={visibilityState:"visible",body:{append(){}},addEventListener(type,handler){(documentListeners[type]||=[]).push(handler);},querySelector(selector){if(selector==="#app")return app;if(selector==="#practice-feedback")return feedback;return null;},createElement(){return {className:"",textContent:"",style:{},click(){},remove(){},set href(v){this._href=v;},get href(){return this._href;}};}};
  const context=vm.createContext({console,document,localStorage,window:{addEventListener(){}},confirm:()=>true,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},Blob:undefined,URL:undefined});
  scripts.forEach(file=>run(source(file),context));return {context,app,feedback,listeners,documentListeners};
}
function click(browser,dataset){const target={dataset,disabled:false,closest(){return this;}};for(const handler of browser.listeners.click)handler({target,preventDefault(){}});}
function testApplicationFlow(){
  const storage=new Map(),browser=fakeBrowser(storage);
  check(browser.app.innerHTML.includes("欢迎开始学习围棋"),"welcome screen must render");
  click(browser,{action:"start"});check(browser.app.innerHTML.includes("今日学习时间"),"dashboard needs today's active time");
  run('state.lessonProgress.intro={completed:true};masteryRecord(state,"intro").masteryScore=20;save()',browser.context);
  click(browser,{view:"path"});check(browser.app.innerHTML.includes("Preview"),"Learning Path needs soft access states");
  click(browser,{view:"practice"});check(browser.app.innerHTML.includes("Adaptive")&&browser.app.innerHTML.includes("Hard"),"practice page needs adaptive mode and difficulty controls");
  click(browser,{view:"play"});check(browser.app.innerHTML.includes("Move 0")&&browser.app.innerHTML.includes("Export SGF")&&browser.app.innerHTML.includes("Scoring system coming later"),"Play UI needs full-state indicators and honest scoring notice");
  click(browser,{view:"ai"});check(browser.app.innerHTML.includes("NOT REAL KATAGO"),"AI review must be clearly marked as demo");
  check(storage.has("go-progress-trainer-v2"),"existing storage key must remain compatible");
}

function main(){
  testSyntaxAndLoading();testLocalDatesAndActiveTimer();testRulesKoAndHistory();
  // Three full rounds catch generator regressions that a lucky seed can hide.
  for(let round=0;round<3;round++)testDynamicQuestions();
  testTacticalSequences();testMasteryAccessAdaptive();testApplicationFlow();
  console.log(`PASS — ${checks} assertions, ${generated.toLocaleString()} generated/played positions, local dates, active timer, full history, Escape A-H, Chase, Ko, UI and persistence.`);
}
main();
