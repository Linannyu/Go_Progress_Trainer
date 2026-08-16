let state = loadState();
let view = state.profile.hasStarted ? "dashboard" : "welcome";
let selectedSkill = state.profile.currentSkill || "intro";
let currentQuestion = null;
let currentQuestionResolved = false;
let currentQuestionCounted = false;
let selectedPoints = new Set();
let practiceBoard = null;
let playBoard = null;
let playSize = 9;
let playCaptures = { b: 0, w: 0 };
let activeSince = Date.now();
let mobileMenuOpen = false;
const app = document.querySelector("#app");
const practiceable = () => skills.filter(skill => skill.practiceable && levelUnlocked(state, skill.level));
const icon = name => ({ home:"⌂", path:"⌘", learn:"◒", practice:"✦", play:"◎", mistakes:"↻", progress:"▥", ai:"⌁" }[name] || "•");
const save = () => saveState(state);
const term = word => `<span class="term" tabindex="0" data-tip="${glossary[word] || ""}">${word}</span>`;
const minutes = seconds => seconds < 60 ? "刚开始" : `${Math.floor(seconds / 60)} 分钟`;
const today = () => new Date().toISOString().slice(0, 10);

function noteStudy() { touchStudy(state); addStudySeconds(state, Math.max(1, Math.round((Date.now() - activeSince) / 1000))); activeSince = Date.now(); save(); }
function proficiency(skillId) { return masteryRecord(state, skillId).masteryScore; }
function masteryBar(score) { return `<div class="mastery-bar"><i style="width:${score}%"></i></div>`; }
function levelStatus(level) { if (!levelUnlocked(state, level)) return "锁定"; const list = skills.filter(skill => skill.level === level); return list.length && list.every(skill => proficiency(skill.id) >= 95) ? "Mastered" : list.some(skill => proficiency(skill.id) > 0) ? "学习中" : "已解锁"; }
function syncLevel() { state.profile.level = Math.max(...levels.filter(level => levelUnlocked(state, level.id)).map(level => level.id)); }

function unlockAchievement(id) {
  if (state.achievements.includes(id)) return;
  state.achievements.push(id); save();
  const names = { move:"First Move · 完成第一次落子", liberty:"First Liberty · 完成第一道气题", capture:"First Capture · 完成第一次提子", q100:"100 Questions · 完成 100 题", q500:"500 Questions · 完成 500 题", q1000:"1000 Questions · 完成 1000 题", libertyMaster:"Liberty Mastered · 气熟练度达到 95", atariMaster:"Atari Mastered · 打吃熟练度达到 95", game:"First 9×9 Game · 完成第一盘练习棋", sgf:"First SGF Review · 首次查看 SGF 复盘" };
  const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = `🏅 成就解锁：${names[id]}`; document.body.append(toast); setTimeout(() => toast.remove(), 3000);
}

function nav() {
  const links = [["dashboard","home","首页"],["path","path","学习路径"],["learn","learn","学习"],["practice","practice","练习"],["play","play","实战"],["mistakes","mistakes","错题本"],["progress","progress","进度"],["ai","ai","AI Review"]];
  return `<header class="topbar ${mobileMenuOpen ? "menu-open" : ""}"><a class="brand" href="#" data-view="dashboard"><span class="brand-mark" aria-hidden="true"></span><span>GO PROGRESS<small>LEARN · PRACTICE · GROW</small></span></a><nav id="main-navigation" aria-label="主要导航">${links.map(([name,ic,label]) => `<button class="nav-link ${view===name ? "active" : ""}" data-view="${name}"><b>${icon(ic)}</b>${label}</button>`).join("")}</nav><button class="mobile-menu-toggle" type="button" data-action="toggle-nav" aria-controls="main-navigation" aria-expanded="${mobileMenuOpen}" aria-label="${mobileMenuOpen ? "关闭" : "打开"}导航菜单"><i></i><i></i><i></i></button><button class="profile-pill" data-view="profile"><span>Level ${state.profile.level}</span><b>♨ ${state.streak}</b><i>◉</i></button></header>`;
}

function welcome() {
  return `<main class="welcome"><div class="welcome-grid"></div><section class="welcome-copy"><p class="eyebrow">GO PROGRESS TRAINER · 中英双语 / BILINGUAL</p><h1>欢迎开始学习围棋。</h1><p class="lead">没有倒计时，也没有毕业线。从完全不会开始，按自己的节奏长期练习、复习和成长。</p><button class="button primary huge" data-action="start">开始 Level 0 <span>→</span></button><div class="welcome-stats"><div><strong>16</strong><span>Learning Levels</span></div><div><strong>∞</strong><span>Random Practice</span></div><div><strong>本地</strong><span>Progress Saved</span></div><div><strong>AI</strong><span>Review Ready</span></div></div><p class="vibe-credit">Vibe coded with Codex · 由 Codex 通过 Vibe Coding 完成</p></section><aside class="welcome-board-card"><div class="mini-board">${Array.from({length:81},(_,i)=>`<i class="${[31,40,49,41,48].includes(i)?(i===40?"black":"white"):""}"></i>`).join("")}</div><p><b>从交叉点开始</b><br />每一次正确理解，都变成你的棋感。</p></aside></main>`;
}

function stat(value, label, note) { return `<article class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`; }
function dashboard() {
  const rec = recommendedSkill(state), skill = rec.skill, score = proficiency(skill.id);
  const message = rec.days >= 7 && score ? `你已经 ${Math.floor(rec.days)} 天没有练习 ${skill.title}，建议复习一下。` : score >= 80 ? `你对 ${skill.title} 已经比较熟悉，试试下一个 Skill。` : score ? `继续练习 ${skill.title}，把理解变成直觉。` : `推荐下一步：学习 ${skill.title}。`;
  return `<main class="page dashboard"><section class="hero"><div><p class="eyebrow">YOUR LONG-TERM GO JOURNEY</p><h1>围棋会一直陪你进步。</h1><p>${message}</p><div class="hero-actions"><button class="button primary" data-action="quick-practice" data-skill="${skill.id}">Quick Practice <span>→</span></button><button class="button ghost" data-view="path">查看学习路径</button></div></div><div class="progress-orbit"><div><strong>L${state.profile.level}</strong><span>Beginner</span></div></div></section><section class="stats-grid">${stat(`Level ${state.profile.level}`,"当前棋力阶段", masteryLabel(Math.max(...skills.filter(s=>levelUnlocked(state,s.level)).map(s=>proficiency(s.id)),0)))}${stat(minutes(state.studyTimeSeconds),"累计学习时间",`今天已学习 ${state.lastStudyDate===today() ? "✓" : "还未记录"}`)}${stat(totalQuestions(state),"已完成题目",`正确率 ${totalAccuracy(state)}%`)}${stat(`${state.streak} 次`,"连续学习",`最长 ${state.longestStreak} 次`)}</section><section class="recommend-card"><div><p class="eyebrow">RECOMMENDED NEXT STEP</p><h2>${skill.title}</h2><p>${skill.description}</p>${masteryBar(score)}<small>Mastery ${score}% · ${masteryLabel(score)}</small></div><div class="recommend-actions"><button class="button primary" data-action="learn-skill" data-skill="${skill.id}">开始学习</button><button class="button ghost" data-action="quick-practice" data-skill="${skill.id}">随机练习</button></div></section><section class="section-heading"><div><p class="eyebrow">RECENT LEARNING</p><h2>继续你的学习路径</h2></div><button class="text-button" data-view="path">全部路径 →</button></section><section class="dash-skills">${practiceable().slice(0,6).map(skillCard).join("")}</section></main>`;
}

function skillCard(skill) { const score = proficiency(skill.id); return `<article class="skill-card"><div><span class="skill-level">LEVEL ${skill.level}</span><h3>${skill.title}</h3><p>${skill.description}</p></div>${masteryBar(score)}<footer><span>${masteryLabel(score)}</span><b>${score}%</b></footer><button data-action="learn-skill" data-skill="${skill.id}">学习 →</button></article>`; }
function path() {
  return `<main class="page"><section class="page-title"><p class="eyebrow">LEARNING PATH</p><h1>学习路径</h1><p>不是按日期推进。达到基本理解后会解锁下一阶段；之后仍可以回来无限练习和复习。</p></section><section class="level-path">${levels.map(level => { const unlocked = levelUnlocked(state,level.id), levelSkills = skills.filter(skill=>skill.level===level.id); const status=levelStatus(level.id); return `<article class="level-node ${unlocked?"":"locked"}"><header><span>LEVEL ${level.id}</span><b class="node-status">${status}</b></header><h2>${level.title}</h2><p>${level.description}</p><div class="path-skills">${levelSkills.map(skill=>{const score=proficiency(skill.id); return `<button ${unlocked?"":"disabled"} class="path-skill ${score>=95?"mastered":""}" data-action="learn-skill" data-skill="${skill.id}"><i>${score>=95?"✓":skill.practiceable?"◌":"·"}</i><span>${skill.title}<small>${skill.practiceable?`${score}% · ${masteryLabel(score)}`:"后续开放"}</small></span></button>`}).join("")}</div></article>`; }).join("")}</section></main>`;
}

function lessonVisual(skill) {
  const visual=tutorialVisuals[skill.id];
  if(!visual)return "";
  return `<section class="lesson-visual"><div class="lesson-visual-copy"><p class="eyebrow">SEE IT ON THE BOARD · 看图理解</p><h2>${visual.title}</h2><p>${visual.caption}</p><ul>${visual.notes.map(note=>`<li>${note}</li>`).join("")}</ul></div><div class="lesson-visual-board" id="lesson-visual-board" aria-label="${skill.title} 棋盘示意"></div></section>`;
}
function tutorialCopy(skill) {
  const t = tutorials[skill.id];
  if (!t) return `<section class="future-card"><span>◌</span><h2>${skill.title}</h2><p>这个 Level 已经出现在长期路线中。完成 Level 0–2 后，可以在同一套 Skill、Mastery、错题与复习系统上继续扩展它的随机题目。</p></section>`;
  const glossaryKey = {liberty:"Liberty",group:"Group",atari:"Atari",capture:"Capture"}[skill.id];
  const title = glossaryKey ? skill.title.replace(glossaryKey, term(glossaryKey)) : skill.title;
  const lessonDone=state.lessonProgress[skill.id]?.practiceCompleted;
  return `<section class="tutorial-copy"><article class="learning-card knowledge"><div class="card-label"><span>01</span>新知识</div><h2>${title}</h2><p>${t.opening}</p></article>${lessonVisual(skill)}<section class="learn-points">${t.points.map((point,i)=>`<article><span>0${i+1}</span><p>${point}</p></article>`).join("")}</section>${skill.id==="intro" ? introQuiz(t) : `<section class="practice-cta"><div><p class="eyebrow">${lessonDone?"KEEP PRACTICING":"10-QUESTION CHECKPOINT"}</p><h2>${lessonDone?"继续巩固这个知识点":"用 10 道题完成本节学习"}</h2><p>每答对一道，课程熟练度增加 10%。完成后可选择继续练习，或进入下一个知识点。</p></div><button class="button primary" data-action="start-lesson-session" data-skill="${skill.id}">${lessonDone?"再练 10 题":"开始 10 题练习"} →</button></section>`}</section>`;
}
function introCompletedIds() {
  const saved = state.lessonProgress.intro?.correctIds || [];
  const history = tutorials.intro.questions.map((_, i) => `intro-check-${i + 1}`).filter(id => state.questionHistory[id]?.correct > 0);
  return [...new Set([...saved, ...history])];
}
function introProgressContent(count) {
  const complete = count >= tutorials.intro.questions.length;
  return `<div><p class="eyebrow">LEVEL 0 PROGRESS</p><strong>${count}/${tutorials.intro.questions.length} ${complete ? "已完成" : "已答对"}</strong><p>${complete ? "你已经掌握落子前最重要的基础，可以进入气（Liberty）。" : "每道题答对后会自动保存；全部完成即可进入 Level 1。"}</p></div>${complete ? `<button class="button primary huge" data-action="continue-intro">进入 Level 1：气 Liberty <span>→</span></button>` : `<span class="intro-progress-hint">还需答对 ${tutorials.intro.questions.length - count} 题</span>`}`;
}
function balancedOptions(options, index) {
  const shift = index % options.length;
  return [...options.slice(shift), ...options.slice(0, shift)];
}
function introQuiz(tutorial) {
  const completed = new Set(introCompletedIds());
  return `<section class="intro-quiz"><div class="section-heading"><div><p class="eyebrow">LEVEL 0 CHECKPOINT</p><h2>10 道入门互动练习</h2></div><span>全部真实判题</span></div>${tutorial.questions.map(([prompt,options,answer,explanation],i)=> { const id=`intro-check-${i+1}`, done=completed.has(id), shownOptions=balancedOptions(options,i); return `<article class="question-card ${done ? "completed" : ""}"><header><span class="question-number">${String(i+1).padStart(2,"0")}</span><span class="question-type">入门题</span>${done ? `<span class="answered-badge">✓ 已完成</span>` : ""}</header><h3>${prompt}</h3><div class="answer-options">${shownOptions.map(option=>`<button class="answer-button ${done && option===answer ? "is-correct" : ""}" ${done ? "disabled" : ""} data-action="fixed-answer" data-id="${id}" data-answer="${option}" data-correct="${answer}" data-explanation="${explanation}">${option}</button>`).join("")}</div><div class="feedback" id="feedback-${id}">${done ? `<div class="feedback-message correct"><b>✓ 已保存</b><span>${explanation}</span></div>` : ""}</div></article>`; }).join("")}<section class="intro-progress-footer" id="intro-progress">${introProgressContent(completed.size)}</section></section>`;
}
function learn() { const skill=skillById[selectedSkill] || skillById.intro; const unlocked=levelUnlocked(state,skill.level); const score=proficiency(skill.id); return `<main class="page learn-page"><section class="learn-heading"><div><p class="eyebrow">LEVEL ${skill.level} · ${unlocked?"AVAILABLE":"LOCKED"}</p><h1>${skill.title}</h1><p>${skill.description}</p></div><div class="mastery-summary"><strong>${score}%</strong>${masteryBar(score)}<span>${masteryLabel(score)}</span></div></section><section class="skill-picker">${skills.filter(s=>levelUnlocked(state,s.level)).map(s=>`<button class="${selectedSkill===s.id?"active":""}" data-action="learn-skill" data-skill="${s.id}">${s.title}<small>${proficiency(s.id)}%</small></button>`).join("")}</section>${unlocked?tutorialCopy(skill):`<section class="future-card"><h2>先完成前一个 Level</h2><p>达到前一个 Level 中每个 Skill 的 40% 基本理解，即可解锁这里。</p></section>`}</main>`; }

function practice() {
  const available = practiceable(), lessonSession=state.activeSession?.type==="lesson";
  if (!currentQuestion) makeQuestion(state.activeSession?.skill || (selectedSkill && skillById[selectedSkill]?.practiceable ? selectedSkill : recommendedSkill(state).skill.id));
  const q=currentQuestion;
  return `<main class="page practice-page"><section class="practice-top"><div><p class="eyebrow">${lessonSession?"GUIDED SKILL PRACTICE":"INFINITE PRACTICE"}</p><h1>${lessonSession?`${skillById[q.skill].title} · 10 题练习`:"随机练习"}</h1><p>${lessonSession?"完成本节的 10 个随机棋形；答对一道，熟练度增加 10%。":"棋形会改变，答案由规则引擎计算。你可以随时选择知识点继续巩固。"}</p></div>${lessonSession?"":`<div class="topic-picker">${available.map(skill=>`<button class="${q.skill===skill.id?"active":""}" data-action="new-topic" data-skill="${skill.id}">${skill.title}</button>`).join("")}</div>`}</section>${sessionPanel()}<section class="practice-question">${questionCard(q)}</section></main>`;
}
function sessionProgressText(session) { const infinite=session.count==="infinite"||session.count===Infinity,total=infinite?"∞":session.count; return !infinite&&session.completed>=session.count?`已完成 ${session.completed}/${total} · ${session.correct} 题首次答对`:`第 ${session.completed+1}/${total} 题 · ${session.correct} 题首次答对`; }
function sessionPanel() { const s=state.activeSession; if (s) { const percent=s.count==="infinite"||s.count===Infinity?0:Math.min(100,s.completed/s.count*100); return `<section class="session-panel active ${s.type==="lesson"?"lesson-session":""}"><div><span>${s.type==="lesson"?"10-QUESTION SKILL CHECKPOINT":"TRAINING SESSION"}</span><b id="session-progress-text">${sessionProgressText(s)}</b><div class="session-progress-track"><i id="session-progress-bar" style="width:${percent}%"></i></div></div><button class="button ghost" data-action="end-session">结束本次练习</button></section>`; } return `<section class="session-panel"><div><span>START TRAINING SESSION</span><b>自由选择训练长度，结束后获得报告</b></div><div><button data-action="start-session" data-count="10">10 题</button><button data-action="start-session" data-count="20">20 题</button><button data-action="start-session" data-count="50">50 题</button><button data-action="start-session" data-count="infinite">无限</button></div></section>`; }
function questionCard(q) {
  let interaction=""; if(q.type==="choice") interaction=`<div class="answer-options">${q.options.map(o=>`<button class="answer-button" data-action="practice-answer" data-answer="${o}">${o}</button>`).join("")}</div>`;
  if(q.type==="count") interaction=`<div class="count-answer"><label>你的答案 <input id="practice-count" type="number" inputmode="numeric" placeholder="输入数字" /></label><button class="button small primary" data-action="practice-count">提交</button></div>`;
  if(q.type==="click") interaction=`<div class="answer-board-shell"><div class="answer-board live-question-board" id="practice-board"></div><p class="micro-copy">直接点击你认为正确的交叉点。</p></div>`;
  if(q.type==="multi") interaction=`<div class="answer-board-shell"><div class="answer-board live-question-board" id="practice-board"></div><div class="multi-row"><span id="point-count">已选择 0 个位置</span><button class="button small primary" data-action="practice-multi">提交答案</button></div></div>`;
  const developerAnswer=state.settings.developerMode&&state.settings.showAnswers?`<small class="dev-answer">Developer answer: ${answerText(q.answer)}</small>`:"";
  return `<article class="practice-card"><header><span class="question-type">${q.difficulty.toUpperCase()}</span><span>${skillById[q.skill]?.title || q.skill}</span><button class="skip-button" data-action="next-question">跳过 →</button></header><h2>${q.prompt}</h2>${q.board&&!["click","multi"].includes(q.type)?`<div class="question-board-static" id="practice-static"></div>`:""}${interaction}${developerAnswer}<div class="feedback" id="practice-feedback"></div></article>`;
}

function play() { return `<main class="page"><section class="page-title"><p class="eyebrow">LOCAL TWO-PLAYER PLAY</p><h1>${playSize}×${playSize} 实战练习</h1><p>两个人在同一设备上轮流下。棋盘会检查气、提子、普通自杀和简单劫。</p></section><section class="play-layout"><article class="learning-card lab-board-card"><div class="lab-head"><div><b>轮到：<span id="play-turn">黑棋</span></b><small id="play-message">黑棋先下。每一步都先看看自己的气。</small><small id="play-score">黑棋提子 ${playCaptures.b} · 白棋提子 ${playCaptures.w}</small></div><div class="board-toolbar"><label>棋盘 <select data-action="play-size"><option value="9" ${playSize===9?"selected":""}>9×9</option><option value="13" ${playSize===13?"selected":""}>13×13</option><option value="19" ${playSize===19?"selected":""}>19×19</option></select></label><button data-action="play-undo">↶ 撤销</button><button data-action="play-redo">↷ 重做</button><button data-action="play-pass">Pass</button><button data-action="play-restart">Restart</button></div></div><div class="board-wrap lab-board" id="play-board"></div></article><aside class="rule-checklist"><h2>实战提醒</h2><div>✓ 黑白轮流落子</div><div>✓ 没有气的棋会被提走</div><div>✓ 不能下普通自杀</div><div>✓ 不可立即重复劫形</div><hr /><p>未来会在这里加入 AI 对手；目前可以用它和朋友在本地对弈。</p></aside></section></main>`; }

function mistakes() { const entries=Object.values(state.mistakes); return `<main class="page"><section class="page-title row-title"><div><p class="eyebrow">MISTAKES / 错题本</p><h1>把不熟的地方练熟</h1><p>错题会保留。连续答对 3 次会显示 Mastered Mistake。</p></div>${entries.length?`<button class="button primary" data-action="practice-mistake">Practice Mistake →</button>`:""}</section>${entries.length?`<section class="mistake-list">${entries.map(m=>`<article class="mistake-row"><div class="mistake-icon">${m.correctStreak>=3?"★":"!"}</div><div><span class="eyebrow">${skillById[m.question.skill]?.title || m.question.skill} · ${m.question.type}</span><h3>${m.question.prompt}</h3><p>最近答案：<b>${m.lastAnswer}</b>　正确答案：<b>${answerText(m.question.answer)}</b></p></div><aside><b>${m.correctStreak>=3?"Mastered Mistake":`${m.wrongCount} 次错误`}</b><small>${new Date(m.lastAt).toLocaleDateString("zh-CN")}</small></aside></article>`).join("")}</section>`:`<section class="empty-state"><span>✓</span><h2>还没有错题</h2><p>答错的随机题会自动保存在这里。先去做一题练习吧。</p><button class="button ghost" data-view="practice">开始练习</button></section>`}</main>`; }

function nextLearningSkill(skillId) { const index=skills.findIndex(skill=>skill.id===skillId); return skills.slice(index+1).find(skill=>skill.practiceable&&levelUnlocked(state,skill.level)) || null; }
function sessionReport(last) {
  if(!last)return "";
  const duration=Math.max(1,Math.round((new Date(last.endedAt).getTime()-new Date(last.startedAt).getTime())/1000));
  if(last.type==="lesson") {
    const skill=skillById[last.skill], next=nextLearningSkill(last.skill), masteryGain=Math.max(0,(last.masteryAfter||0)-(last.masteryBefore||0));
    return `<section class="session-report lesson-result"><p class="eyebrow">SKILL PRACTICE COMPLETE</p><h2>${skill.title} · ${last.completed} 道练习完成</h2><div class="lesson-result-stats"><span><b>${last.accuracy}%</b>首次正确率</span><span><b>+${masteryGain}%</b>熟练度提升</span><span><b>${last.masteryAfter}%</b>当前熟练度</span></div><p>训练用时 ${minutes(duration)}。你可以继续练习这个知识点，也可以进入下一节。</p><div class="session-report-actions"><button class="button primary" data-action="start-lesson-session" data-skill="${last.skill}">继续练习 10 题</button>${next?`<button class="button ghost" data-action="learn-skill" data-skill="${next.id}">下一知识点：${next.title} →</button>`:`<button class="button ghost" data-view="path">返回学习路径 →</button>`}</div></section>`;
  }
  return `<section class="session-report"><p class="eyebrow">LATEST TRAINING SESSION</p><h2>${last.completed} 题 · 正确率 ${last.accuracy}%</h2><p>训练用时 ${minutes(duration)}。推荐下一步：${recommendedSkill(state).skill.title}。</p><button class="button ghost" data-action="quick-practice" data-skill="${recommendedSkill(state).skill.id}">继续训练 →</button></section>`;
}
function progress() { const last=state.trainingSessions.at(-1); return `<main class="page"><section class="page-title"><p class="eyebrow">PROGRESS</p><h1>你的长期进度</h1><p>课程练习每节 10 题；完成后仍可无限巩固，不受日期限制。</p></section>${sessionReport(last)}<section class="stats-grid big">${stat(totalQuestions(state),"总练习次数",`正确 ${totalCorrect(state)} 次`)}${stat(`${totalAccuracy(state)}%`,"正确率",`最近练习会影响推荐`)}${stat(minutes(state.studyTimeSeconds),"总学习时间",`累计 ${state.totalStudyDays} 个学习日`)}${stat(`${state.streak} 次`,"当前连续学习",`最长 ${state.longestStreak} 次`)}</section><section class="topic-stats"><div class="section-heading"><div><p class="eyebrow">SKILL MASTERY</p><h2>每个知识点的熟练度</h2></div><span>完成 10 题课程练习即可快速建立熟练度</span></div>${skills.filter(s=>s.level<=2).map(s=>`<div class="topic-row"><b>${s.title}</b><div class="topic-track"><i style="width:${proficiency(s.id)}%"></i></div><span>${proficiency(s.id)}%</span><small>${masteryLabel(proficiency(s.id))} · ${skillAccuracy(state,s.id)}% 正确</small></div>`).join("")}</section></main>`; }

function ai() { return `<main class="page ai-page"><section class="page-title"><p class="eyebrow">AI REVIEW · READY FOR KATAGO LATER</p><h1>学会看懂 AI 的建议</h1><p>AI 不应该只告诉你胜率。它应该解释哪块棋危险、还有几口气、为什么推荐这个位置。</p></section><section class="ai-tools"><label class="upload-tile"><input type="file" accept=".sgf" data-action="sgf-upload" /><span>↥</span><b>SGF Upload</b><small>上传棋谱（接口预留）</small></label><label class="upload-tile"><span>⌁</span><b>Paste SGF</b><textarea placeholder="(;GM[1]FF[4]...)" aria-label="粘贴 SGF"></textarea></label><div class="upload-tile"><span>▧</span><b>Board Screenshot</b><small>棋盘截图占位区域</small></div></section><section class="ai-demo"><div><span class="ai-spark">✦</span><p class="eyebrow">BEGINNER-FRIENDLY DEMO</p><h2>不要只看胜率变化</h2><p>好的复盘会把复杂建议翻译成你下一盘就能用的简单原则。</p><button class="button primary" data-action="analyze">Demo Analysis →</button></div><div class="analysis-result" id="analysis-result"><span>模拟复盘会出现在这里</span></div></section></main>`; }

function profile() { const achievements=[["move","First Move","第一次合法落子"],["liberty","First Liberty","完成第一道气题"],["capture","First Capture","第一次提子"],["q100","100 Questions","完成 100 题"],["q500","500 Questions","完成 500 题"],["q1000","1000 Questions","完成 1000 题"],["libertyMaster","Liberty Mastered","气达到 95%"],["atariMaster","Atari Mastered","打吃达到 95%"],["game","First 9×9 Game","首次实战"],["sgf","First SGF Review","首次 SGF 复盘"]]; return `<main class="page profile-page"><section class="profile-hero"><div class="avatar">碁</div><div><p class="eyebrow">YOUR PROFILE</p><h1>${state.profile.displayName}</h1><p>Level ${state.profile.level} · 累计 ${minutes(state.studyTimeSeconds)} · 连续学习 ${state.streak} 次</p></div></section><section class="achievements"><div class="section-heading"><div><p class="eyebrow">ACHIEVEMENTS</p><h2>成就</h2></div><span>${state.achievements.length}/${achievements.length} 已解锁</span></div><div class="achievement-grid">${achievements.map(([id,name,desc])=>`<article class="achievement ${state.achievements.includes(id)?"unlocked":""}"><span>${state.achievements.includes(id)?"★":"◌"}</span><b>${name}</b><small>${desc}</small></article>`).join("")}</div></section><section class="developer-card"><div><p class="eyebrow">DEVELOPER MODE</p><h2>测试学习系统</h2><p>用于测试解锁、随机题目和熟练度，不影响围棋规则引擎。</p></div><div><button class="button ghost" data-action="dev-toggle">${state.settings.developerMode?"关闭":"开启"} Developer Mode</button>${state.settings.developerMode?`<button class="button ghost" data-action="dev-unlock">Unlock All Levels</button><button class="button ghost" data-action="dev-add">Add Mastery +10</button><button class="button ghost" data-action="dev-answer">${state.settings.showAnswers?"隐藏":"显示"}随机题答案</button><button class="button danger" data-action="dev-reset">Reset Mastery</button>`:""}</div></section><section class="settings-card"><div><p class="eyebrow">LOCAL DATA</p><h2>学习数据</h2><p>所有进度只保存在浏览器 localStorage 中。</p></div><button class="button danger" data-action="reset-all">Reset Progress</button></section></main>`; }

function render() { if (state.activeSession?.count === null) state.activeSession.count = "infinite"; syncLevel(); app.innerHTML = view==="welcome"?welcome():`${nav()}${({dashboard,path,learn,practice,play,mistakes,progress,ai,profile}[view]||dashboard)()}`; if(view==="learn")mountLessonVisual(); if(view==="practice") mountQuestionBoard(); if(view==="play") mountPlayBoard(); }
function makeQuestion(skillId) { selectedSkill=skillId; currentQuestion=generateQuestion(skillId,proficiency(skillId)); currentQuestionResolved=false; currentQuestionCounted=false; selectedPoints=new Set(); practiceBoard=null; }
function mountLessonVisual() { const el=document.querySelector("#lesson-visual-board"),visual=tutorialVisuals[selectedSkill];if(!el||!visual)return;new GoBoard(el,{size:visual.size,stones:visual.stones,highlights:visual.highlights,labels:visual.labels,locked:true}); }
function mountQuestionBoard() { const q=currentQuestion; if(!q?.board) return; const staticEl=document.querySelector("#practice-static"); if(staticEl) new GoBoard(staticEl,{...q.board,locked:true}); const el=document.querySelector("#practice-board"); if(!el) return; practiceBoard=new GoBoard(el,{...q.board,locked:true}); el.querySelectorAll(".intersection").forEach(point=>point.addEventListener("click",()=>{const coordinate=point.dataset.coordinate; if(q.type==="click") grade(q,coordinate); else { selectedPoints.has(coordinate)?selectedPoints.delete(coordinate):selectedPoints.add(coordinate); point.classList.toggle("answer-selected",selectedPoints.has(coordinate)); document.querySelector("#point-count").textContent=`已选择 ${selectedPoints.size} 个位置`; }})); }
function mountPlayBoard() { const el=document.querySelector("#play-board"); if(!el) return; playBoard=new GoBoard(el,{size:playSize,onMove:result=>{const msg=document.querySelector("#play-message"),turn=document.querySelector("#play-turn"),score=document.querySelector("#play-score"); if(!result.legal){msg.textContent="这个位置不合法：已有棋、普通自杀，或违反简单劫。";return;} if(result.pass) msg.textContent="已虚手。现在轮到对方。"; else {if(result.captured.length){const mover=playBoard.toPlay==="b"?"w":"b";playCaptures[mover]+=result.captured.length;if(score)score.textContent=`黑棋提子 ${playCaptures.b} · 白棋提子 ${playCaptures.w}`;}msg.textContent=result.captured.length?`提掉了 ${result.captured.length} 颗棋！`:"已落子，继续看每一块棋的气。";unlockAchievement("move");} turn.textContent=playBoard.toPlay==="b"?"黑棋":"白棋";}}); }

function refreshSessionProgress() {
  const session=state.activeSession;if(!session)return;
  const text=document.querySelector("#session-progress-text"), bar=document.querySelector("#session-progress-bar");
  if(text)text.textContent=sessionProgressText(session);
  if(bar&&session.count!=="infinite"&&session.count!==Infinity)bar.style.width=`${Math.min(100,session.completed/session.count*100)}%`;
}
function grade(q, answer) {
  const isCurrent=q.id===currentQuestion?.id;
  if(isCurrent&&currentQuestionResolved)return true;
  const normalized=q.type==="count"?Number(answer):answer;
  const correct=Array.isArray(q.answer)?Array.isArray(normalized)&&q.answer.length===normalized.length&&q.answer.every(a=>normalized.includes(a)):normalized===q.answer;
  const lessonMode=state.activeSession?.type==="lesson"&&state.activeSession.skill===q.skill;
  const firstAttempt=isCurrent&&!currentQuestionCounted;
  noteStudy();
  const change=applyPracticeResult(state,q,correct,{mode:lessonMode?"lesson":"practice"});
  const h=state.questionHistory[q.id]||{attempts:0,correct:0};
  state.questionHistory[q.id]={...h,attempts:h.attempts+1,correct:h.correct+(correct?1:0),lastCorrect:correct,lastAt:new Date().toISOString()};
  if(!correct){const m=state.mistakes[q.id]||{question:questionSnapshot(q),wrongCount:0,correctStreak:0};state.mistakes[q.id]={...m,question:questionSnapshot(q),wrongCount:m.wrongCount+1,correctStreak:0,lastAnswer:answerText(normalized),lastAt:new Date().toISOString()};}
  else if(state.mistakes[q.id])state.mistakes[q.id]={...state.mistakes[q.id],correctStreak:(state.mistakes[q.id].correctStreak||0)+1,lastAnswer:answerText(normalized),lastAt:new Date().toISOString()};
  if(state.activeSession&&firstAttempt){state.activeSession.completed++;if(correct)state.activeSession.correct++;state.activeSession.skills[q.skill]=(state.activeSession.skills[q.skill]||0)+1;currentQuestionCounted=true;}
  const unlockedLevels=levels.filter(level=>levelUnlocked(state,level.id)).map(level=>level.id);state.profile.level=Math.max(...unlockedLevels);save();refreshSessionProgress();
  if(q.skill==="liberty"&&correct)unlockAchievement("liberty");
  if(["atari","chase","capture","hunt","whole-capture"].includes(q.skill)&&correct)unlockAchievement("capture");
  if(proficiency("liberty")>=95)unlockAchievement("libertyMaster");if(proficiency("atari")>=95)unlockAchievement("atariMaster");
  [[100,"q100"],[500,"q500"],[1000,"q1000"]].forEach(([n,id])=>{if(totalQuestions(state)>=n)unlockAchievement(id);});
  if(isCurrent&&correct)currentQuestionResolved=true;
  const sessionComplete=state.activeSession&&state.activeSession.count!=="infinite"&&state.activeSession.count!==Infinity&&state.activeSession.completed>=state.activeSession.count;
  const primaryLabel=sessionComplete?"完成并查看结果":correct?"下一题":"换一题";
  const feedback=document.querySelector("#practice-feedback")||document.querySelector(`#feedback-${q.id}`);
  const feedbackActions=isCurrent?`<div class="feedback-actions"><button class="button primary" data-action="next-question">${primaryLabel} <span>→</span></button><button class="button ghost" data-action="learn-skill" data-skill="${q.skill}">查看讲解</button>${!correct?`<span>也可以在当前题修改答案后重试</span>`:""}</div>`:"";
  if(feedback)feedback.innerHTML=(correct?`<div class="feedback-message correct"><b>✓ 正确！</b><span>${q.explanation} 熟练度 ${change.delta>=0?"+":""}${change.delta}。</span></div>`:`<div class="feedback-message wrong"><b>再想一下。</b><span>${q.type==="count"?"只看上下左右的空交叉点，不计算斜线。":"看一看这块棋上下左右还有哪些空点。"}</span></div>`)+feedbackActions;
  if(correct&&q.type==="click"&&["atari","chase","capture","hunt","whole-capture"].includes(q.skill)&&practiceBoard){const [x,y]=normalized.split(",").map(Number);practiceBoard.animateMove(x,y,q.toPlay||"w");}
  return correct;
}
function gradeFixed(button) {
  const q={id:button.dataset.id,skill:"intro",difficulty:"simple",signature:button.dataset.id,type:"choice",answer:button.dataset.correct,explanation:button.dataset.explanation};
  const correct=grade(q,button.dataset.answer), card=button.closest(".question-card");
  card.querySelectorAll(".answer-button").forEach(b=>{if(b.dataset.answer===q.answer)b.classList.add("is-correct");if(b===button&&!correct)b.classList.add("is-wrong");if(correct)b.disabled=true;});
  if (!correct) return;
  card.classList.add("completed");
  if (!card.querySelector(".answered-badge")) card.querySelector("header").insertAdjacentHTML("beforeend",`<span class="answered-badge">✓ 已完成</span>`);
  const completed=introCompletedIds();
  state.lessonProgress.intro={correctIds:completed,completed:completed.length>=tutorials.intro.questions.length,completedAt:completed.length>=tutorials.intro.questions.length ? new Date().toISOString() : null};
  if (state.lessonProgress.intro.completed) masteryRecord(state,"intro").masteryScore=Math.max(40,masteryRecord(state,"intro").masteryScore);
  save();
  const footer=document.querySelector("#intro-progress");
  if(footer){footer.innerHTML=introProgressContent(completed.length);if(state.lessonProgress.intro.completed)footer.scrollIntoView?.({behavior:"smooth",block:"nearest"});}
}
function startLessonSession(skillId) {
  state.activeSession={type:"lesson",skill:skillId,count:10,completed:0,correct:0,skills:{},masteryBefore:proficiency(skillId),startedAt:new Date().toISOString()};
  save();makeQuestion(skillId);view="practice";render();
}
function startTrainingSession(count) {
  const skillId=recommendedSkill(state).skill.id;
  state.activeSession={type:"training",skill:skillId,count:count==="infinite"?Infinity:Number(count),completed:0,correct:0,skills:{},startedAt:new Date().toISOString()};
  save();makeQuestion(skillId);view="practice";render();
}
function endSession() {
  const s=state.activeSession;if(!s)return;
  const record={...s,endedAt:new Date().toISOString(),accuracy:s.completed?Math.round(s.correct/s.completed*100):0,masteryAfter:s.skill?proficiency(s.skill):null};
  state.trainingSessions.push(record);
  if(s.type==="lesson"&&s.skill){const previous=state.lessonProgress[s.skill]||{};state.lessonProgress[s.skill]={...previous,practiceCompleted:previous.practiceCompleted||s.completed>=10,sessionsCompleted:(previous.sessionsCompleted||0)+(s.completed>=10?1:0),lastSessionAt:record.endedAt,lastAccuracy:record.accuracy};}
  state.activeSession=null;currentQuestion=null;save();view="progress";render();
}

app.addEventListener("click",event=>{const button=event.target.closest("[data-action]");if(button?.dataset.action==="play-restart")playCaptures={b:0,w:0};},true);
app.addEventListener("click",event=>{
  const target=event.target.closest("[data-action],[data-view]");if(!target||target.disabled)return;
  const action=target.dataset.action,targetView=target.dataset.view;
  if(action==="toggle-nav"){mobileMenuOpen=!mobileMenuOpen;render();return;}
  if(action==="continue-intro"){
    const completed=introCompletedIds();if(completed.length<tutorials.intro.questions.length)return;
    state.lessonProgress.intro={correctIds:completed,completed:true,completedAt:state.lessonProgress.intro?.completedAt||new Date().toISOString()};
    masteryRecord(state,"intro").masteryScore=Math.max(40,masteryRecord(state,"intro").masteryScore);selectedSkill="liberty";state.profile.currentSkill="liberty";state.profile.level=Math.max(state.profile.level,1);save();view="learn";render();return;
  }
  if(targetView){event.preventDefault();mobileMenuOpen=false;view=targetView;if(view==="learn")selectedSkill=state.profile.currentSkill||"intro";render();return;}
  if(action==="start"){state.profile.hasStarted=true;noteStudy();view="dashboard";render();return;}
  if(action==="learn-skill"){selectedSkill=target.dataset.skill;state.profile.currentSkill=selectedSkill;save();view="learn";render();return;}
  if(action==="start-lesson-session")return startLessonSession(target.dataset.skill);
  if(action==="quick-practice"){state.activeSession=null;save();makeQuestion(target.dataset.skill);view="practice";render();return;}
  if(action==="new-topic"){makeQuestion(target.dataset.skill);view="practice";render();return;}
  if(action==="next-question"){
    const s=state.activeSession;
    if(s&&s.count!=="infinite"&&s.count!==Infinity&&s.completed>=s.count)return endSession();
    makeQuestion(currentQuestion?.skill||selectedSkill);render();return;
  }
  if(action==="practice-answer")return grade(currentQuestion,target.dataset.answer);
  if(action==="practice-count")return grade(currentQuestion,document.querySelector("#practice-count").value);
  if(action==="practice-multi")return grade(currentQuestion,[...selectedPoints]);
  if(action==="fixed-answer")return gradeFixed(target);
  if(action==="start-session")return startTrainingSession(target.dataset.count);
  if(action==="end-session")return endSession();
  if(action==="practice-mistake"){
    const candidates=Object.values(state.mistakes);
    if(candidates.length){state.activeSession=null;currentQuestion=questionSnapshot(candidates[Math.floor(Math.random()*candidates.length)].question);selectedSkill=currentQuestion.skill;currentQuestionResolved=false;currentQuestionCounted=false;practiceBoard=null;view="practice";render();}
    return;
  }
  if(action==="play-undo")return playBoard?.undo();if(action==="play-redo")return playBoard?.redo();if(action==="play-pass")return playBoard?.pass();if(action==="play-restart"){render();return;}
  if(action==="analyze"){document.querySelector("#analysis-result").innerHTML=`<span class="analysis-tag">SIMULATED REVIEW</span><h3>Move 18</h3><dl><div><dt>Your move</dt><dd>D6</dd></div><div><dt>Suggested</dt><dd>E5</dd></div><div><dt>Estimated mistake</dt><dd class="negative">−12%</dd></div></dl><p><b>新手解释：</b>D6 附近的黑棋只剩 1 口气。如果不处理，白棋下一步能吃掉它。E5 会让黑棋连接并获得更多气。<em>记住：先保护只有 1 气的棋，再考虑别处。</em></p>`;return;}
  if(action==="dev-toggle"){state.settings.developerMode=!state.settings.developerMode;save();render();return;}if(action==="dev-unlock"){state.settings.unlockAllLevels=true;save();render();return;}if(action==="dev-add"){Object.values(skillById).forEach(s=>masteryRecord(state,s.id).masteryScore=Math.min(100,masteryRecord(state,s.id).masteryScore+10));save();render();return;}if(action==="dev-answer"){state.settings.showAnswers=!state.settings.showAnswers;save();render();return;}if(action==="dev-reset"){if(confirm("确定重置所有 Skill 熟练度吗？")){state.skillMastery={};save();render();}return;}if(action==="reset-all"){if(confirm("确定清除所有学习数据吗？")){state=resetState();view="welcome";selectedSkill="intro";currentQuestion=null;currentQuestionResolved=false;currentQuestionCounted=false;render();}return;}
});
app.addEventListener("change",event=>{if(event.target.matches("[data-action='sgf-upload']")){unlockAchievement("sgf");}if(event.target.matches("[data-action='play-size']")){playSize=Number(event.target.value);render();}});
window.addEventListener("beforeunload",()=>{if(state.profile.hasStarted)noteStudy();});
render();
