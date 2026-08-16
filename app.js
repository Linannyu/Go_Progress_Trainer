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
let playGameState = null;
let studyTimer = createActiveStudyTimer();
let currentQuestionAttempts = 0;
let currentHintLevel = 0;
let chaseSequence = null;
let koSequence = null;
let sessionMode = "adaptive";
let chosenDifficulty = "auto";
let mobileMenuOpen = false;
const app = document.querySelector("#app");
const practiceable = () => skills.filter(skill => skill.practiceable && levelUnlocked(state, skill.level));
const icon = name => ({ home:"⌂", path:"⌘", learn:"◒", practice:"✦", play:"◎", mistakes:"↻", progress:"▥", ai:"⌁" }[name] || "•");
const save = () => saveState(state);
const term = word => `<span class="term" tabindex="0" data-tip="${glossary[word] || ""}">${word}</span>`;
const minutes = seconds => { const total=Math.max(0,Math.floor(seconds||0));if(total<60)return total?`${total} 秒`:"刚开始";const h=Math.floor(total/3600),m=Math.floor(total%3600/60);return h?`${h} 小时${m?` ${m} 分钟`:""}`:`${m} 分钟`; };
const today = () => getLocalDateKey();

function noteStudy() { activateStudy(state,studyTimer);save(); }
function proficiency(skillId) { return masteryRecord(state, skillId).masteryScore; }
function masteryBar(score) { return `<div class="mastery-bar"><i style="width:${score}%"></i></div>`; }
function levelStatus(level) { const access=levelAccess(state,level);if(access==="locked")return "🔒 Locked";const list=skills.filter(skill=>skill.level===level),average=list.length?list.reduce((sum,skill)=>sum+proficiency(skill.id),0)/list.length:0;if(average>=95)return "⭐ Mastered";if(average>=80)return "✅ Skilled";return access==="preview"?"👀 Preview":"▶ Available"; }
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
  const commonError=commonErrorType(state),errorAdvice={"counted-diagonal":"你最近容易把斜线误认为气，建议复习数气。","failed-to-extend":"你最近常错过逃跑点，建议继续练习逃跑。","escaped-into-atari":"延伸后仍需重新数气，别逃进新的打吃。"}[commonError];
  const message = errorAdvice || (rec.days >= 7 && score ? `你已经 ${Math.floor(rec.days)} 天没有练习 ${skill.title}，建议复习一下。` : score >= 80 ? `你对 ${skill.title} 已经比较熟悉，试试下一个 Skill。` : score ? `继续练习 ${skill.title}，把理解变成直觉。` : `推荐下一步：学习 ${skill.title}。`);
  const todaySeconds=state.dailyStudySeconds?.[today()]||0;
  return `<main class="page dashboard"><section class="hero"><div><p class="eyebrow">YOUR LONG-TERM GO JOURNEY</p><h1>围棋会一直陪你进步。</h1><p>${message}</p><div class="hero-actions"><button class="button primary" data-action="quick-practice" data-skill="${skill.id}">Quick Practice <span>→</span></button><button class="button ghost" data-view="path">查看学习路径</button></div></div><div class="progress-orbit"><div><strong>L${state.profile.level}</strong><span>Beginner</span></div></div></section><section class="stats-grid">${stat(`Level ${state.profile.level}`,"当前棋力阶段", masteryLabel(Math.max(...skills.filter(s=>levelUnlocked(state,s.level)).map(s=>proficiency(s.id)),0)))}${stat(minutes(todaySeconds),"今日学习时间",`累计 ${minutes(state.studyTimeSeconds)}`)}${stat(totalQuestions(state),"已完成题目",`正确率 ${totalAccuracy(state)}%`)}${stat(`${state.streak} 次`,"连续学习",`最长 ${state.longestStreak} 次`)}</section><section class="recommend-card"><div><p class="eyebrow">RECOMMENDED NEXT STEP</p><h2>${skill.title}</h2><p>${skill.description}</p>${masteryBar(score)}<small>Mastery ${score}% · ${masteryLabel(score)}</small></div><div class="recommend-actions"><button class="button primary" data-action="learn-skill" data-skill="${skill.id}">开始学习</button><button class="button ghost" data-action="quick-practice" data-skill="${skill.id}">随机练习</button><button class="button ghost" data-action="start-adaptive">Adaptive Training</button></div></section><section class="section-heading"><div><p class="eyebrow">RECENT LEARNING</p><h2>继续你的学习路径</h2></div><button class="text-button" data-view="path">全部路径 →</button></section><section class="dash-skills">${practiceable().slice(0,6).map(skillCard).join("")}</section></main>`;
}

function skillCard(skill) { const score = proficiency(skill.id); return `<article class="skill-card"><div><span class="skill-level">LEVEL ${skill.level}</span><h3>${skill.title}</h3><p>${skill.description}</p></div>${masteryBar(score)}<footer><span>${masteryLabel(score)}</span><b>${score}%</b></footer><button data-action="learn-skill" data-skill="${skill.id}">学习 →</button></article>`; }
function path() {
  return `<main class="page"><section class="page-title"><p class="eyebrow">LEARNING PATH</p><h1>学习路径</h1><p>教学完成与熟练度分开。完成课程可预览下一阶段，平均 60% 后系统会正式推荐；不会被单个 39% 完全卡住。</p></section><section class="level-path">${levels.map(level => { const access=levelAccess(state,level.id),unlocked=access!=="locked",levelSkills=skills.filter(skill=>skill.level===level.id);return `<article class="level-node ${access}"><header><span>LEVEL ${level.id}</span><b class="node-status">${levelStatus(level.id)}</b></header><h2>${level.title}</h2><p>${level.description}</p><div class="path-skills">${levelSkills.map(skill=>{const score=proficiency(skill.id),learned=state.lessonProgress[skill.id]?.practiceCompleted||state.lessonProgress[skill.id]?.completed;return `<button ${unlocked?"":"disabled"} class="path-skill ${score>=95?"mastered":""}" data-action="learn-skill" data-skill="${skill.id}"><i>${score>=95?"★":learned?"✓":skill.practiceable?"◌":"·"}</i><span>${skill.title}<small>${skill.practiceable?`${learned?"Lesson Completed · ":""}${score}% ${masteryLabel(score)}`:"后续开放"}</small></span></button>`}).join("")}</div></article>`;}).join("")}</section></main>`;
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
  const lessonDone=state.lessonProgress[skill.id]?.practiceCompleted,plan=guidedPracticePlans[skill.id]||{count:1,summary:"正确完成一次关键操作。"};
  return `<section class="tutorial-copy"><article class="learning-card knowledge"><div class="card-label"><span>01</span>新知识</div><h2>${title}</h2><p>${t.opening}</p></article>${lessonVisual(skill)}<section class="learn-points">${t.points.map((point,i)=>`<article><span>0${i+1}</span><p>${point}</p></article>`).join("")}</section>${skill.id==="intro" ? introQuiz(t) : `<section class="practice-cta"><div><p class="eyebrow">${lessonDone?"OPTIONAL PRACTICE":"MINIMUM USEFUL PRACTICE"}</p><h2>${lessonDone?"已经学会，可按需继续练习":plan.count===1?"正确完成一次就进入下一节":`完成 ${plan.count} 个不同练习`}</h2><p>${lessonDone?"课程不会要求重复相同操作；随机练习可以由你自行决定做多久。":`${plan.summary} 相同操作不会为了凑题数而重复。`}</p></div><button class="button primary" data-action="${lessonDone?"quick-practice":"start-lesson-session"}" data-skill="${skill.id}">${lessonDone?"继续随机练习":plan.count===1?"开始关键操作":`开始 ${plan.count} 个练习`} →</button></section>`}</section>`;
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
function learn() { const skill=skillById[selectedSkill] || skillById.intro,access=levelAccess(state,skill.level),unlocked=access!=="locked",score=proficiency(skill.id),learned=state.lessonProgress[skill.id]?.practiceCompleted||state.lessonProgress[skill.id]?.completed; return `<main class="page learn-page"><section class="learn-heading"><div><p class="eyebrow">LEVEL ${skill.level} · ${access.toUpperCase()}${learned?" · LESSON COMPLETED ✓":""}</p><h1>${skill.title}</h1><p>${skill.description}</p></div><div class="mastery-summary"><strong>${score}%</strong>${masteryBar(score)}<span>Mastery · ${masteryLabel(score)}</span></div></section><section class="skill-picker">${skills.filter(s=>levelUnlocked(state,s.level)).map(s=>`<button class="${selectedSkill===s.id?"active":""}" data-action="learn-skill" data-skill="${s.id}">${s.title}<small>${proficiency(s.id)}%</small></button>`).join("")}</section>${unlocked?tutorialCopy(skill):`<section class="future-card"><h2>先完成前一阶段的核心教学</h2><p>系统会根据课程完成情况和平均熟练度提供 Preview，不会因单个知识点差 1% 完全卡住。</p></section>`}</main>`; }

function practice() {
  const available = practiceable(), lessonSession=state.activeSession?.type==="lesson";
  if (!currentQuestion) makeQuestion(state.activeSession?.skill || (selectedSkill && skillById[selectedSkill]?.practiceable ? selectedSkill : recommendedSkill(state).skill.id));
  const q=currentQuestion,plan=guidedPracticePlans[q.skill]||{count:1,summary:"正确完成一次关键操作。"};
  return `<main class="page practice-page"><section class="practice-top"><div><p class="eyebrow">${lessonSession?"GUIDED SKILL PRACTICE":"LONG-TERM PRACTICE"}</p><h1>${lessonSession?`${skillById[q.skill].title} · ${plan.count} 个关键练习`:"随机与自适应练习"}</h1><p>${lessonSession?`${plan.summary} 不重复相同操作。`:"棋形动态生成，答案由 rules.js 计算。可选择难度，也可以让 Adaptive Training 自动加强薄弱项。"}</p></div>${lessonSession?"":`<div class="practice-controls"><div class="difficulty-picker"><span>难度</span>${["auto","easy","medium","hard"].map(value=>`<button class="${chosenDifficulty===value?"active":""}" data-action="set-difficulty" data-difficulty="${value}">${{auto:"自动",easy:"Easy",medium:"Medium",hard:"Hard"}[value]}</button>`).join("")}</div><div class="topic-picker">${available.map(skill=>`<button class="${q.skill===skill.id?"active":""}" data-action="new-topic" data-skill="${skill.id}">${skill.title}</button>`).join("")}</div></div>`}</section>${sessionPanel()}<section class="practice-question">${questionCard(q)}</section></main>`;
}
function sessionProgressText(session) { const infinite=session.count==="infinite"||session.count===Infinity,total=infinite?"∞":session.count;if(session.type==="lesson")return session.completed>=session.count?`已掌握 ${session.completed}/${total} 个关键操作`:`当前操作 ${session.completed+1}/${total} · 已掌握 ${session.completed}`;return !infinite&&session.completed>=session.count?`已完成 ${session.completed}/${total} · ${session.correct} 题首次答对`:`第 ${session.completed+1}/${total} 题 · ${session.correct} 题首次答对`; }
function sessionPanel() { const s=state.activeSession;if(s){const percent=s.count==="infinite"||s.count===Infinity?0:Math.min(100,s.completed/s.count*100);return `<section class="session-panel active ${s.type==="lesson"?"lesson-session":""}"><div><span>${s.type==="lesson"?"SKILL CHECKPOINT · 不重复操作":`${(s.mode||"focused").toUpperCase()} TRAINING SESSION`}</span><b id="session-progress-text">${sessionProgressText(s)}</b><div class="session-progress-track"><i id="session-progress-bar" style="width:${percent}%"></i></div></div><button class="button ghost" data-action="end-session">结束本次练习</button></section>`;}return `<section class="session-panel session-builder"><div><span>START TRAINING SESSION</span><b>Focused · Mixed · Adaptive · Mistakes</b></div><div class="session-mode-picker">${["focused","mixed","adaptive","mistakes"].map(mode=>`<button class="${sessionMode===mode?"active":""}" data-action="set-session-mode" data-mode="${mode}">${mode[0].toUpperCase()+mode.slice(1)}</button>`).join("")}</div><div class="session-length-picker"><button data-action="start-session" data-count="10">10 题</button><button data-action="start-session" data-count="20">20 题</button><button data-action="start-session" data-count="50">50 题</button><button data-action="start-session" data-count="infinite">无限</button></div></section>`; }
function questionCard(q) {
  let interaction=""; if(q.type==="choice") interaction=`<div class="answer-options">${q.options.map(o=>`<button class="answer-button" data-action="practice-answer" data-answer="${o}">${o}</button>`).join("")}</div>`;
  if(q.type==="count") interaction=`<div class="count-answer"><label>你的答案 <input id="practice-count" type="number" inputmode="numeric" placeholder="输入数字" /></label><button class="button small primary" data-action="practice-count">提交</button></div>`;
  if(q.type==="click") interaction=`<div class="answer-board-shell"><div class="answer-board live-question-board" id="practice-board"></div><p class="micro-copy">直接点击你认为正确的交叉点。</p></div>`;
  if(q.type==="multi") interaction=`<div class="answer-board-shell"><div class="answer-board live-question-board" id="practice-board"></div><div class="multi-row"><span id="point-count">已选择 0 个位置</span><button class="button small primary" data-action="practice-multi">提交答案</button></div></div>`;
  if(["chase-interactive","ko-interactive"].includes(q.type)) interaction=`<div class="answer-board-shell tactical-shell"><div class="answer-board live-question-board" id="practice-board"></div><div class="tactical-progress"><span id="tactical-progress">${q.type==="chase-interactive"?"追击进度 0 / 2":"Ko Demo 1 / 2"}</span><small id="tactical-message">直接点击高亮交叉点开始。</small></div></div>`;
  const developerAnswer=state.settings.developerMode&&state.settings.showAnswers?`<small class="dev-answer">Developer answer: ${answerText(q.answer)}</small>`:"";
  return `<article class="practice-card"><header><span class="question-type">${q.difficulty.toUpperCase()}</span><span>${skillById[q.skill]?.title || q.skill}</span><button class="skip-button" data-action="next-question">跳过 →</button></header><h2 id="question-prompt">${q.prompt}</h2>${q.board&&!["click","multi","chase-interactive","ko-interactive"].includes(q.type)?`<div class="question-board-static" id="practice-static"></div>`:""}${interaction}${developerAnswer}<div class="hint-row"><button class="text-button" data-action="show-hint">Hint ${Math.min(3,currentHintLevel+1)} · 渐进提示</button></div><div class="feedback" id="practice-feedback"></div></article>`;
}

function play() { const game=playGameState||{toPlay:"b",captures:{b:0,w:0},moveNumber:0,gameOver:false};return `<main class="page"><section class="page-title"><p class="eyebrow">LOCAL TWO-PLAYER PLAY</p><h1>${playSize}×${playSize} 实战练习</h1><p>Pass、落子、提子、Undo、Redo 都保存在同一份完整对局状态中。</p></section><section class="play-layout"><article class="learning-card lab-board-card"><div class="lab-head"><div><b><span id="play-move-number">Move ${game.moveNumber}</span> · <span id="play-turn">${game.toPlay==="b"?"Black to play":"White to play"}</span></b><small id="play-message">${game.gameOver?"Both players passed. Game finished.":"每一步都先看看自己的气。"}</small><small id="play-score">Black Captures: ${game.captures.b} · White Captures: ${game.captures.w}</small></div><div class="board-toolbar"><label>棋盘 <select data-action="play-size"><option value="9" ${playSize===9?"selected":""}>9×9</option><option value="13" ${playSize===13?"selected":""}>13×13</option><option value="19" ${playSize===19?"selected":""}>19×19</option></select></label><button data-action="play-undo">↶ 撤销</button><button data-action="play-redo">↷ 重做</button><button data-action="play-pass">Pass</button><button data-action="export-sgf">Export SGF</button><button data-action="play-restart">Restart</button></div></div><div class="board-wrap lab-board" id="play-board"></div></article><aside class="rule-checklist"><h2>实战提醒</h2><div>✓ Pass 可以撤销与重做</div><div>✓ 提子数跟随历史恢复</div><div>✓ 连续两次 Pass 结束对局</div><div>✓ 普通自杀与简单劫检查</div><hr /><p><b>Scoring system coming later.</b><br />当前不会假装给出准确终局胜负。AI 对手也仍是未来预留。</p></aside></section></main>`; }

function mistakes() { const entries=Object.values(state.mistakes);return `<main class="page"><section class="page-title row-title"><div><p class="eyebrow">MISTAKES / 错题本</p><h1>知道自己具体错在哪里</h1><p>按 Skill、题型、难度与错误类型归类；连续答对 3 次后标记 Mastered Mistake，但不会立刻删除。</p></div>${entries.length?`<button class="button primary" data-action="practice-mistake">Practice Mistake →</button>`:""}</section>${entries.length?`<section class="mistake-list">${entries.map(m=>`<article class="mistake-row"><div class="mistake-icon">${m.correctStreak>=3?"★":"!"}</div><div><span class="eyebrow">${skillById[m.skill||m.question?.skill]?.title || m.skill} · ${m.questionType||m.question?.type} · ${m.difficulty||"easy"}</span><h3>${m.question?.prompt||"历史错题"}</h3><p>错误类型：<b>${m.errorType||"needs-review"}</b>　最近答案：<b>${m.lastAnswer}</b></p></div><aside><b>${m.correctStreak>=3?"Mastered Mistake":`${m.wrongCount} 次错误`}</b><small>${new Date(m.lastAt).toLocaleDateString("zh-CN")}</small></aside></article>`).join("")}</section>`:`<section class="empty-state"><span>✓</span><h2>还没有错题</h2><p>答错的随机题会自动保存在这里。先去做一题练习吧。</p><button class="button ghost" data-view="practice">开始练习</button></section>`}</main>`; }

function nextLearningSkill(skillId) { const index=skills.findIndex(skill=>skill.id===skillId); return skills.slice(index+1).find(skill=>skill.practiceable&&levelUnlocked(state,skill.level)) || null; }
function sessionReport(last) {
  if(!last)return "";
  const duration=Math.max(0,last.activeSeconds??Math.round((new Date(last.endedAt).getTime()-new Date(last.startedAt).getTime())/1000));
  if(last.type==="lesson") {
    const skill=skillById[last.skill], next=nextLearningSkill(last.skill), masteryGain=Math.max(0,(last.masteryAfter||0)-(last.masteryBefore||0));
    return `<section class="session-report lesson-result"><p class="eyebrow">SKILL PRACTICE COMPLETE</p><h2>${skill.title} · 关键操作已学会</h2><div class="lesson-result-stats"><span><b>${last.accuracy}%</b>练习正确率</span><span><b>+${masteryGain}%</b>熟练度提升</span><span><b>${last.masteryAfter}%</b>当前熟练度</span></div><p>训练用时 ${minutes(duration)}。课程不会重复相同操作；你可以进入下一节，也可以自行选择随机练习。</p><div class="session-report-actions"><button class="button primary" data-action="quick-practice" data-skill="${last.skill}">继续随机练习</button>${next?`<button class="button ghost" data-action="learn-skill" data-skill="${next.id}">下一知识点：${next.title} →</button>`:`<button class="button ghost" data-view="path">返回学习路径 →</button>`}</div></section>`;
  }
  const deltas=Object.entries(last.masteryDeltas||{}).sort((a,b)=>b[1]-a[1]),strongest=last.strongestSkill?skillById[last.strongestSkill]?.title:"—",weakest=last.weakestSkill?skillById[last.weakestSkill]?.title:"—";
  return `<section class="session-report"><p class="eyebrow">SESSION COMPLETE · ${(last.mode||"focused").toUpperCase()}</p><h2>${last.correct} / ${last.completed} · 正确率 ${last.accuracy}%</h2><div class="lesson-result-stats"><span><b>${minutes(last.activeSeconds||duration)}</b>有效学习时间</span><span><b>${strongest}</b>最强知识点</span><span><b>${weakest}</b>最弱知识点</span></div><p>Mastery 变化：${deltas.length?deltas.map(([id,value])=>`${skillById[id]?.title||id} ${value>=0?"+":""}${value}`).join(" · "):"本次没有变化"}。最常见错误：${last.commonError||"无"}。</p><p>推荐下一步：${recommendedSkill(state).skill.title}。</p><button class="button ghost" data-action="start-adaptive">继续 Adaptive Training →</button></section>`;
}
function progress() { const last=state.trainingSessions.at(-1),todaySeconds=state.dailyStudySeconds?.[today()]||0;return `<main class="page"><section class="page-title"><p class="eyebrow">PROGRESS</p><h1>你的长期进度</h1><p>Lesson Completed 只表示学过；Mastery 需要在变化的棋形中长期积累。</p></section>${sessionReport(last)}<section class="stats-grid big">${stat(totalQuestions(state),"总练习次数",`正确 ${totalCorrect(state)} 次`)}${stat(`${totalAccuracy(state)}%`,"正确率",`最近练习会影响推荐`)}${stat(minutes(state.studyTimeSeconds),"总学习时间",`今天 ${minutes(todaySeconds)}`)}${stat(`${state.streak} 次`,"当前连续学习",`最长 ${state.longestStreak} 次`)}</section><section class="topic-stats"><div class="section-heading"><div><p class="eyebrow">SKILL MASTERY</p><h2>每个知识点的熟练度</h2></div><span>教学完成与熟练度分开保存</span></div>${skills.filter(s=>s.level<=2).map(s=>`<div class="topic-row"><b>${s.title}</b><div class="topic-track"><i style="width:${proficiency(s.id)}%"></i></div><span>${proficiency(s.id)}%</span><small>${state.lessonProgress[s.id]?.practiceCompleted||state.lessonProgress[s.id]?.completed?"Lesson Completed ✓ · ":""}${masteryLabel(proficiency(s.id))} · ${skillAccuracy(state,s.id)}% 正确</small></div>`).join("")}</section></main>`; }

function ai() { return `<main class="page ai-page"><section class="page-title"><p class="eyebrow">DEMO ANALYSIS · NOT REAL KATAGO</p><h1>学会看懂 AI 的建议</h1><p>当前只提供明确标注的 Demo Analysis，并未连接 KataGo，也不会把模拟结果冒充真实 AI 分析。</p></section><section class="ai-tools"><label class="upload-tile"><input type="file" accept=".sgf" data-action="sgf-upload" /><span>↥</span><b>SGF Upload</b><small>上传棋谱（解析接口预留）</small></label><label class="upload-tile"><span>⌁</span><b>Paste SGF</b><textarea placeholder="(;GM[1]FF[4]...)" aria-label="粘贴 SGF"></textarea></label><div class="upload-tile"><span>▧</span><b>Future KataGo</b><small>真实引擎尚未连接</small></div></section><section class="ai-demo"><div><span class="ai-spark">✦</span><p class="eyebrow">BEGINNER-FRIENDLY DEMO ANALYSIS</p><h2>不要只看胜率变化</h2><p>演示如何把复杂建议翻译成下一盘就能用的简单原则。</p><button class="button primary" data-action="analyze">Run Demo Analysis →</button></div><div class="analysis-result" id="analysis-result"><span>模拟复盘会出现在这里</span></div></section></main>`; }

function profile() { const achievements=[["move","First Move","第一次合法落子"],["liberty","First Liberty","完成第一道气题"],["capture","First Capture","第一次提子"],["q100","100 Questions","完成 100 题"],["q500","500 Questions","完成 500 题"],["q1000","1000 Questions","完成 1000 题"],["libertyMaster","Liberty Mastered","气达到 95%"],["atariMaster","Atari Mastered","打吃达到 95%"],["game","First 9×9 Game","首次实战"],["sgf","First SGF Review","首次 SGF 复盘"]]; return `<main class="page profile-page"><section class="profile-hero"><div class="avatar">碁</div><div><p class="eyebrow">YOUR PROFILE</p><h1>${state.profile.displayName}</h1><p>Level ${state.profile.level} · 累计 ${minutes(state.studyTimeSeconds)} · 连续学习 ${state.streak} 次</p></div></section><section class="achievements"><div class="section-heading"><div><p class="eyebrow">ACHIEVEMENTS</p><h2>成就</h2></div><span>${state.achievements.length}/${achievements.length} 已解锁</span></div><div class="achievement-grid">${achievements.map(([id,name,desc])=>`<article class="achievement ${state.achievements.includes(id)?"unlocked":""}"><span>${state.achievements.includes(id)?"★":"◌"}</span><b>${name}</b><small>${desc}</small></article>`).join("")}</div></section><section class="developer-card"><div><p class="eyebrow">DEVELOPER MODE</p><h2>测试学习系统</h2><p>用于测试解锁、随机题目和熟练度，不影响围棋规则引擎。</p></div><div><button class="button ghost" data-action="dev-toggle">${state.settings.developerMode?"关闭":"开启"} Developer Mode</button>${state.settings.developerMode?`<button class="button ghost" data-action="dev-unlock">Unlock All Levels</button><button class="button ghost" data-action="dev-add">Add Mastery +10</button><button class="button ghost" data-action="dev-answer">${state.settings.showAnswers?"隐藏":"显示"}随机题答案</button><button class="button danger" data-action="dev-reset">Reset Mastery</button>`:""}</div></section><section class="settings-card"><div><p class="eyebrow">LOCAL DATA</p><h2>学习数据</h2><p>所有进度只保存在浏览器 localStorage 中。</p></div><button class="button danger" data-action="reset-all">Reset Progress</button></section></main>`; }

function render() { if (state.activeSession?.count === null) state.activeSession.count = "infinite"; syncLevel(); app.innerHTML = view==="welcome"?welcome():`${nav()}${({dashboard,path,learn,practice,play,mistakes,progress,ai,profile}[view]||dashboard)()}`; if(view==="learn")mountLessonVisual(); if(view==="practice") mountQuestionBoard(); if(view==="play") mountPlayBoard(); }
function makeQuestion(skillId) {
  const training=state.activeSession?.type==="training"?state.activeSession:null;
  if(training?.mode==="adaptive")skillId=adaptiveSkill(state).id;
  if(training?.mode==="mixed")skillId=pick(practiceable()).id;
  if(training?.mode==="mistakes"){
    const candidates=Object.values(state.mistakes||{}).filter(item=>item.question);
    if(candidates.length){currentQuestion=questionSnapshot(pick(candidates).question);skillId=currentQuestion.skill;}
  }
  selectedSkill=skillId;
  const session=state.activeSession?.type==="lesson"&&state.activeSession.skill===skillId?state.activeSession:null;
  if(session&&!session.seenSignatures)session.seenSignatures=[];
  const seen=session?.seenSignatures||[];
  let generated=currentQuestion&&training?.mode==="mistakes"?currentQuestion:null;
  const difficulty=training?.difficulty&&training.difficulty!=="auto"?training.difficulty:chosenDifficulty!=="auto"?chosenDifficulty:null;
  if(!generated)for(let attempt=0;attempt<40;attempt++){generated=generateQuestion(skillId,proficiency(skillId),difficulty);if(!seen.includes(generated.signature))break;}
  currentQuestion=generated;
  if(session&&!session.seenSignatures.includes(generated.signature)){session.seenSignatures.push(generated.signature);save();}
  currentQuestionResolved=false;currentQuestionCounted=false;currentQuestionAttempts=0;currentHintLevel=0;selectedPoints=new Set();practiceBoard=null;chaseSequence=null;koSequence=null;
}
function mountLessonVisual() { const el=document.querySelector("#lesson-visual-board"),visual=tutorialVisuals[selectedSkill];if(!el||!visual)return;new GoBoard(el,{size:visual.size,stones:visual.stones,highlights:visual.highlights,labels:visual.labels,locked:true}); }
function mountQuestionBoard() {
  const q=currentQuestion;if(!q?.board)return;
  const staticEl=document.querySelector("#practice-static");if(staticEl)new GoBoard(staticEl,{...q.board,locked:true});
  const el=document.querySelector("#practice-board");if(!el)return;
  practiceBoard=new GoBoard(el,{...q.board,locked:true});
  if(q.type==="chase-interactive")chaseSequence=new TacticalSequence({size:q.board.size,board:createBoard(q.board.size,q.board.stones),targetPoint:q.tactical.targetPoint,targetColor:q.tactical.targetColor,attacker:q.tactical.attacker,targetSteps:q.tactical.targetSteps});
  if(q.type==="ko-interactive")koSequence=new KoSequence();
  el.querySelectorAll(".intersection").forEach(point=>point.addEventListener("click",()=>{
    const coordinate=point.dataset.coordinate,[x,y]=coordinate.split(",").map(Number);
    noteStudy();
    if(q.type==="click")grade(q,coordinate);
    else if(q.type==="chase-interactive")handleChaseMove(q,x,y);
    else if(q.type==="ko-interactive")handleKoMove(q,x,y);
    else {selectedPoints.has(coordinate)?selectedPoints.delete(coordinate):selectedPoints.add(coordinate);point.classList.toggle("answer-selected",selectedPoints.has(coordinate));document.querySelector("#point-count").textContent=`已选择 ${selectedPoints.size} 个位置`;}
  }));
}
function updateTacticalBoard(board,lastMove,highlights=[]) { if(!practiceBoard)return;practiceBoard.board=cloneBoard(board);practiceBoard.lastMove=lastMove;practiceBoard.highlights=highlights;practiceBoard.draw();mountTacticalClickListeners(); }
function mountTacticalClickListeners(){const q=currentQuestion,el=document.querySelector("#practice-board");if(!el||!["chase-interactive","ko-interactive"].includes(q?.type))return;el.querySelectorAll(".intersection").forEach(point=>point.addEventListener("click",()=>{const [x,y]=point.dataset.coordinate.split(",").map(Number);noteStudy();q.type==="chase-interactive"?handleChaseMove(q,x,y):handleKoMove(q,x,y);}));}
function handleChaseMove(q,x,y){const result=chaseSequence.playAttack(x,y),message=document.querySelector("#tactical-message"),progress=document.querySelector("#tactical-progress");if(!result.ok){if(message)message.textContent=`❌ ${result.message}`;grade(q,"invalid-chase");return;}if(message)message.textContent=result.message;if(progress)progress.textContent=`追击进度 ${chaseSequence.attackStep} / ${chaseSequence.targetSteps}`;updateTacticalBoard(chaseSequence.board,chaseSequence.lastMove,chaseSequence.targetGroup());if(result.status!=="active"){q.explanation=result.message;grade(q,q.answer);}}
function handleKoMove(q,x,y){const result=koSequence.play(x,y),message=document.querySelector("#tactical-message"),progress=document.querySelector("#tactical-progress"),prompt=document.querySelector("#question-prompt");if(!result.ok){if(message)message.textContent=`❌ ${result.message}`;return;}if(message)message.textContent=result.message;if(progress)progress.textContent=koSequence.stage<2?"Ko Demo 1 / 2":"Ko Demo 2 / 2";if(prompt)prompt.textContent=koSequence.prompt();updateTacticalBoard(koSequence.board,koSequence.lastMove,koSequence.stage<4?[koSequence.expectedPoint()]:[]);if(result.complete)grade(q,q.answer);}
function updatePlayStatus(result={}){if(!playBoard)return;playGameState=playBoard.snapshot();const msg=document.querySelector("#play-message"),turn=document.querySelector("#play-turn"),score=document.querySelector("#play-score"),move=document.querySelector("#play-move-number");if(result.legal===false){if(msg)msg.textContent="Illegal move：已有棋、普通自杀，或违反简单劫。";return;}if(move)move.textContent=`Move ${playBoard.moveNumber}`;if(turn)turn.textContent=playBoard.toPlay==="b"?"Black to play":"White to play";if(score)score.textContent=`Black Captures: ${playBoard.captures.b} · White Captures: ${playBoard.captures.w}`;if(msg){if(playBoard.gameOver)msg.textContent="Both players passed. Game finished. Scoring system coming later.";else if(result.type==="pass")msg.textContent="Pass 已记录，可用 Undo / Redo 恢复。";else if(result.type==="undo")msg.textContent="已撤销，对局状态与提子数同步恢复。";else if(result.type==="redo")msg.textContent="已重做，对局状态与提子数同步恢复。";else if(result.type==="move")msg.textContent=result.captured?.length?`提掉了 ${result.captured.length} 颗棋！`:"已落子，继续看每一块棋的气。";else msg.textContent="黑棋先下。每一步都先看看自己的气。";}}
function mountPlayBoard(){const el=document.querySelector("#play-board");if(!el)return;const options=playGameState&&playGameState.board?.length===playSize?{size:playSize,...playGameState}:{size:playSize};playBoard=new GoBoard(el,{...options,onMove:result=>{noteStudy();updatePlayStatus(result);if(result.type==="move")unlockAchievement("move");}});playGameState=playBoard.snapshot();updatePlayStatus();}

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
  const correct=Array.isArray(q.answer)?Array.isArray(normalized)&&q.answer.length===normalized.length&&q.answer.every(a=>normalized.includes(a)):(q.acceptedAnswers?.includes(normalized)||normalized===q.answer);
  const lessonMode=state.activeSession?.type==="lesson"&&state.activeSession.skill===q.skill;
  const firstAttempt=isCurrent&&!currentQuestionCounted;
  noteStudy();currentQuestionAttempts+=1;
  const change=applyPracticeResult(state,q,correct,{mode:lessonMode?"lesson":"practice",masteryGain:lessonMode?state.activeSession.masteryPerCorrect:undefined});
  const h=state.questionHistory[q.id]||{attempts:0,correct:0};
  state.questionHistory[q.id]={...h,attempts:h.attempts+1,correct:h.correct+(correct?1:0),lastCorrect:correct,lastAt:new Date().toISOString()};
  const mistakeKey=mistakeKeyFor(q),existingMistake=state.mistakes[mistakeKey]||state.mistakes[q.id];
  if(!correct){const m=existingMistake||{question:questionSnapshot(q),wrongCount:0,correctStreak:0};state.mistakes[mistakeKey]={...m,skill:q.skill,questionType:q.questionType||q.type,errorType:classifyError(q,normalized),difficulty:q.difficulty,question:questionSnapshot(q),wrongCount:(m.wrongCount||0)+1,correctStreak:0,lastAnswer:answerText(normalized),lastAt:new Date().toISOString()};if(mistakeKey!==q.id)delete state.mistakes[q.id];}
  else if(existingMistake){state.mistakes[mistakeKey]={...existingMistake,correctStreak:(existingMistake.correctStreak||0)+1,lastAnswer:answerText(normalized),lastAt:new Date().toISOString()};if(mistakeKey!==q.id)delete state.mistakes[q.id];}
  if(state.activeSession){
    state.activeSession.skillResults ||= {};
    state.activeSession.skillResults[q.skill] ||= {attempts:0,correct:0};
    if(lessonMode){state.activeSession.attempts=(state.activeSession.attempts||0)+1;state.activeSession.skillResults[q.skill].attempts++;if(correct&&isCurrent&&!currentQuestionCounted){state.activeSession.completed++;state.activeSession.correct++;state.activeSession.skills[q.skill]=(state.activeSession.skills[q.skill]||0)+1;state.activeSession.skillResults[q.skill].correct++;currentQuestionCounted=true;}}
    else if(firstAttempt){state.activeSession.completed++;state.activeSession.attempts=(state.activeSession.attempts||0)+1;state.activeSession.skillResults[q.skill].attempts++;if(correct){state.activeSession.correct++;state.activeSession.skillResults[q.skill].correct++;}state.activeSession.skills[q.skill]=(state.activeSession.skills[q.skill]||0)+1;currentQuestionCounted=true;}
  }
  const unlockedLevels=levels.filter(level=>levelUnlocked(state,level.id)).map(level=>level.id);state.profile.level=Math.max(...unlockedLevels);save();refreshSessionProgress();
  if(q.skill==="liberty"&&correct)unlockAchievement("liberty");
  if(["atari","chase","capture","hunt","whole-capture"].includes(q.skill)&&correct)unlockAchievement("capture");
  if(proficiency("liberty")>=95)unlockAchievement("libertyMaster");if(proficiency("atari")>=95)unlockAchievement("atariMaster");
  [[100,"q100"],[500,"q500"],[1000,"q1000"]].forEach(([n,id])=>{if(totalQuestions(state)>=n)unlockAchievement(id);});
  if(isCurrent&&correct)currentQuestionResolved=true;
  const sessionComplete=state.activeSession&&state.activeSession.count!=="infinite"&&state.activeSession.count!==Infinity&&state.activeSession.completed>=state.activeSession.count;
  const primaryLabel=sessionComplete?"完成并查看结果":correct?"下一题":"换一题";
  const feedback=document.querySelector("#practice-feedback")||document.querySelector(`#feedback-${q.id}`);
  const feedbackActions=isCurrent?`<div class="feedback-actions"><button class="button primary" data-action="next-question">${primaryLabel} <span>→</span></button><button class="button ghost" data-action="show-hint">${currentHintLevel>=2?"Show Answer":"下一级提示"}</button><button class="button ghost" data-action="learn-skill" data-skill="${q.skill}">查看讲解</button>${!correct?`<span>可以在当前题修改答案后重试</span>`:""}</div>`:"";
  const wrongHint=currentQuestionAttempts===1?"先自己再看一次：只计算上下左右。":currentQuestionAttempts===2?"注意高亮的是整块棋，不要漏掉共享的气。":"可以使用 Show Answer 查看所有正确位置。";
  if(feedback)feedback.innerHTML=(correct?`<div class="feedback-message correct"><b>✓ 正确！</b><span>${q.explanation} 熟练度 ${change.delta>=0?"+":""}${change.delta}。</span></div>`:`<div class="feedback-message wrong"><b>❌ 再想一下。</b><span>${wrongHint}</span></div>`)+feedbackActions;
  if(correct&&q.type==="click"&&["atari","capture","hunt","whole-capture"].includes(q.skill)&&practiceBoard){const [x,y]=normalized.split(",").map(Number);practiceBoard.animateMove(x,y,q.toPlay||"w");}
  return correct;
}
function showHint(){const q=currentQuestion;if(!q)return;currentHintLevel=Math.min(3,currentHintLevel+1);const feedback=document.querySelector("#practice-feedback");let text=currentHintLevel===1?"Hint 1：先锁定高亮棋块，只看与它上下左右相邻的位置。":currentHintLevel===2?"Hint 2：把整块相连棋当成一个整体，重新数它的气。":"Show Answer：正确位置已经在棋盘上亮起。";if(currentHintLevel===2&&practiceBoard){q.board.highlights.forEach(([x,y])=>document.querySelector(`#practice-board [data-coordinate="${keyOf(x,y)}"]`)?.classList.add("hint-group"));}if(currentHintLevel===3&&practiceBoard){let answers=q.acceptedAnswers||q.answer;if(q.type==="count"){const board=createBoard(q.board.size,q.board.stones),group=getGroup(board,...q.board.highlights[0]);answers=getLiberties(board,group).map(([x,y])=>keyOf(x,y));}if(!Array.isArray(answers))answers=[answers];answers.forEach(key=>document.querySelector(`#practice-board [data-coordinate="${key}"]`)?.classList.add("hint-answer"));if(q.type==="count")text+=` 这块棋共有 ${q.answer} 口气。`;}if(feedback)feedback.innerHTML=`<div class="feedback-message hint"><b>${currentHintLevel<3?`Hint ${currentHintLevel}`:"Show Answer"}</b><span>${text}</span></div>`;}
function gradeFixed(button) {
  const q={id:button.dataset.id,skill:"intro",difficulty:"simple",signature:button.dataset.id,type:"choice",answer:button.dataset.correct,explanation:button.dataset.explanation};
  const correct=grade(q,button.dataset.answer), card=button.closest(".question-card");
  card.querySelectorAll(".answer-button").forEach(b=>{if(b.dataset.answer===q.answer)b.classList.add("is-correct");if(b===button&&!correct)b.classList.add("is-wrong");if(correct)b.disabled=true;});
  if (!correct) return;
  card.classList.add("completed");
  if (!card.querySelector(".answered-badge")) card.querySelector("header").insertAdjacentHTML("beforeend",`<span class="answered-badge">✓ 已完成</span>`);
  const completed=introCompletedIds();
  state.lessonProgress.intro={correctIds:completed,completed:completed.length>=tutorials.intro.questions.length,completedAt:completed.length>=tutorials.intro.questions.length ? new Date().toISOString() : null};
  if (state.lessonProgress.intro.completed) masteryRecord(state,"intro").masteryScore=Math.max(20,masteryRecord(state,"intro").masteryScore);
  save();
  const footer=document.querySelector("#intro-progress");
  if(footer){footer.innerHTML=introProgressContent(completed.length);if(state.lessonProgress.intro.completed)footer.scrollIntoView?.({behavior:"smooth",block:"nearest"});}
}
function startLessonSession(skillId) {
  const plan=guidedPracticePlans[skillId]||{count:1},masteryBefore=proficiency(skillId),masteryPerCorrect=Math.ceil(Math.max(0,20-masteryBefore)/plan.count);
  state.lessonProgress[skillId]={...(state.lessonProgress[skillId]||{}),lessonViewed:true,lastViewedAt:new Date().toISOString()};
  state.activeSession={type:"lesson",skill:skillId,count:plan.count,completed:0,correct:0,attempts:0,skills:{},skillResults:{},seenSignatures:[],masteryBefore,masteryPerCorrect,studyTimeBefore:state.studyTimeSeconds,startedAt:new Date().toISOString()};
  save();makeQuestion(skillId);view="practice";render();
}
function startTrainingSession(count) {
  const skillId=selectedSkill&&skillById[selectedSkill]?.practiceable?selectedSkill:recommendedSkill(state).skill.id;
  const masteryBefore=Object.fromEntries(practiceable().map(skill=>[skill.id,proficiency(skill.id)]));
  state.activeSession={type:"training",mode:sessionMode,skill:skillId,difficulty:chosenDifficulty,count:count==="infinite"?Infinity:Number(count),completed:0,correct:0,attempts:0,skills:{},skillResults:{},masteryBefore,studyTimeBefore:state.studyTimeSeconds,startedAt:new Date().toISOString()};
  save();makeQuestion(skillId);view="practice";render();
}
function endSession() {
  const s=state.activeSession;if(!s)return;
  commitActiveStudy(state,studyTimer);
  const masteryAfter=s.type==="lesson"?proficiency(s.skill):Object.fromEntries(practiceable().map(skill=>[skill.id,proficiency(skill.id)]));
  const masteryDeltas=s.type==="training"?Object.fromEntries(Object.entries(masteryAfter).map(([id,value])=>[id,value-(s.masteryBefore?.[id]||0)])):{};
  const ranked=Object.entries(s.skillResults||{}).map(([id,result])=>({id,accuracy:result.attempts?result.correct/result.attempts:0})).sort((a,b)=>b.accuracy-a.accuracy);
  const record={...s,endedAt:new Date().toISOString(),accuracy:(s.completed||s.attempts)?Math.round(s.correct/(s.type==="lesson"?(s.attempts||1):(s.completed||1))*100):0,masteryAfter,masteryDeltas,strongestSkill:ranked[0]?.id||null,weakestSkill:ranked.at(-1)?.id||null,commonError:commonErrorType(state),activeSeconds:Math.max(0,state.studyTimeSeconds-(s.studyTimeBefore??state.studyTimeSeconds))};
  state.trainingSessions.push(record);
  if(s.type==="lesson"&&s.skill){const previous=state.lessonProgress[s.skill]||{},finished=s.completed>=s.count;state.lessonProgress[s.skill]={...previous,practiceCompleted:previous.practiceCompleted||finished,sessionsCompleted:(previous.sessionsCompleted||0)+(finished?1:0),lastSessionAt:record.endedAt,lastAccuracy:record.accuracy};}
  state.activeSession=null;currentQuestion=null;save();view="progress";render();
}

app.addEventListener("click",event=>{
  const target=event.target.closest("[data-action],[data-view]");if(!target||target.disabled)return;
  const action=target.dataset.action,targetView=target.dataset.view;
  if(action!=="toggle-nav")noteStudy();
  if(action==="toggle-nav"){mobileMenuOpen=!mobileMenuOpen;render();return;}
  if(action==="continue-intro"){
    const completed=introCompletedIds();if(completed.length<tutorials.intro.questions.length)return;
    state.lessonProgress.intro={correctIds:completed,completed:true,completedAt:state.lessonProgress.intro?.completedAt||new Date().toISOString()};
    masteryRecord(state,"intro").masteryScore=Math.max(20,masteryRecord(state,"intro").masteryScore);selectedSkill="liberty";state.profile.currentSkill="liberty";state.profile.level=Math.max(state.profile.level,1);save();view="learn";render();return;
  }
  if(targetView){event.preventDefault();mobileMenuOpen=false;view=targetView;if(view==="learn")selectedSkill=state.profile.currentSkill||"intro";render();return;}
  if(action==="start"){state.profile.hasStarted=true;noteStudy();view="dashboard";render();return;}
  if(action==="learn-skill"){selectedSkill=target.dataset.skill;state.profile.currentSkill=selectedSkill;save();view="learn";render();return;}
  if(action==="start-lesson-session")return startLessonSession(target.dataset.skill);
  if(action==="quick-practice"){state.activeSession=null;save();makeQuestion(target.dataset.skill);view="practice";render();return;}
  if(action==="new-topic"){makeQuestion(target.dataset.skill);view="practice";render();return;}
  if(action==="set-difficulty"){chosenDifficulty=target.dataset.difficulty;makeQuestion(currentQuestion?.skill||selectedSkill);render();return;}
  if(action==="set-session-mode"){sessionMode=target.dataset.mode;render();return;}
  if(action==="start-adaptive"){sessionMode="adaptive";chosenDifficulty="auto";return startTrainingSession("10");}
  if(action==="next-question"){
    const s=state.activeSession;
    if(s&&s.count!=="infinite"&&s.count!==Infinity&&s.completed>=s.count)return endSession();
    makeQuestion(currentQuestion?.skill||selectedSkill);render();return;
  }
  if(action==="practice-answer")return grade(currentQuestion,target.dataset.answer);
  if(action==="practice-count")return grade(currentQuestion,document.querySelector("#practice-count").value);
  if(action==="practice-multi")return grade(currentQuestion,[...selectedPoints]);
  if(action==="show-hint")return showHint();
  if(action==="fixed-answer")return gradeFixed(target);
  if(action==="start-session")return startTrainingSession(target.dataset.count);
  if(action==="end-session")return endSession();
  if(action==="practice-mistake"){
    const candidates=Object.values(state.mistakes);
    if(candidates.length){state.activeSession=null;currentQuestion=questionSnapshot(candidates[Math.floor(Math.random()*candidates.length)].question);selectedSkill=currentQuestion.skill;currentQuestionResolved=false;currentQuestionCounted=false;practiceBoard=null;view="practice";render();}
    return;
  }
  if(action==="play-undo")return playBoard?.undo();if(action==="play-redo")return playBoard?.redo();if(action==="play-pass")return playBoard?.pass();if(action==="play-restart"){playGameState=null;render();return;}
  if(action==="export-sgf"&&playBoard){const sgf=exportSGF(playBoard.size,playBoard.moveHistory);if(typeof Blob!=="undefined"&&typeof URL!=="undefined"&&URL.createObjectURL){const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([sgf],{type:"application/x-go-sgf"}));link.download=`go-progress-${playBoard.size}x${playBoard.size}.sgf`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),500);}return;}
  if(action==="analyze"){document.querySelector("#analysis-result").innerHTML=`<span class="analysis-tag">SIMULATED REVIEW</span><h3>Move 18</h3><dl><div><dt>Your move</dt><dd>D6</dd></div><div><dt>Suggested</dt><dd>E5</dd></div><div><dt>Estimated mistake</dt><dd class="negative">−12%</dd></div></dl><p><b>新手解释：</b>D6 附近的黑棋只剩 1 口气。如果不处理，白棋下一步能吃掉它。E5 会让黑棋连接并获得更多气。<em>记住：先保护只有 1 气的棋，再考虑别处。</em></p>`;return;}
  if(action==="dev-toggle"){state.settings.developerMode=!state.settings.developerMode;save();render();return;}if(action==="dev-unlock"){state.settings.unlockAllLevels=true;save();render();return;}if(action==="dev-add"){Object.values(skillById).forEach(s=>masteryRecord(state,s.id).masteryScore=Math.min(100,masteryRecord(state,s.id).masteryScore+10));save();render();return;}if(action==="dev-answer"){state.settings.showAnswers=!state.settings.showAnswers;save();render();return;}if(action==="dev-reset"){if(confirm("确定重置所有 Skill 熟练度吗？")){state.skillMastery={};save();render();}return;}if(action==="reset-all"){if(confirm("确定清除所有学习数据吗？")){state=resetState();view="welcome";selectedSkill="intro";currentQuestion=null;currentQuestionResolved=false;currentQuestionCounted=false;render();}return;}
});
app.addEventListener("change",event=>{if(event.target.matches("[data-action='sgf-upload']")){unlockAchievement("sgf");}if(event.target.matches("[data-action='play-size']")){playSize=Number(event.target.value);playGameState=null;render();}});
document.addEventListener?.("visibilitychange",()=>{if(document.visibilityState==="hidden"){pauseStudy(state,studyTimer);save();}});
window.addEventListener("beforeunload",()=>{pauseStudy(state,studyTimer);save();});
if(typeof setInterval==="function")setInterval(()=>{if(commitActiveStudy(state,studyTimer)>0)save();},15000);
render();
