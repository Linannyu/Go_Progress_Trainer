const masteryLabels = [
  [0, 19, "刚接触"], [20, 39, "学习中"], [40, 59, "基本理解"],
  [60, 79, "熟悉"], [80, 94, "熟练"], [95, 100, "Mastered"]
];

function masteryRecord(state, skillId) {
  if (!state.skillMastery[skillId]) state.skillMastery[skillId] = {
    masteryScore: 0, correctStreak: 0, wrongCount: 0, attempts: 0, correct: 0,
    lastPracticed: null, lastPracticedDate: null, recentSignatures: []
  };
  return state.skillMastery[skillId];
}

function masteryLabel(score = 0) { return masteryLabels.find(([min, max]) => score >= min && score <= max)?.[2] || "刚接触"; }
function skillAccuracy(state, skillId) {
  const record = masteryRecord(state, skillId);
  return record.attempts ? Math.round(record.correct / record.attempts * 100) : 0;
}

/** Update mastery. Lesson completion and long-term mastery remain separate. */
function applyPracticeResult(state, question, correct, options = {}) {
  const record = masteryRecord(state, question.skill);
  const oldScore = record.masteryScore;
  const lessonMode = options.mode === "lesson";
  const practicedAt = new Date();
  record.attempts += 1; record.lastPracticed = practicedAt.toISOString(); record.lastPracticedDate = getLocalDateKey(practicedAt);
  const repeated = record.recentSignatures.includes(question.signature);
  if (correct) {
    record.correct += 1; record.correctStreak += 1;
    const base = ["hard", "challenge"].includes(question.difficulty) ? 5 : ["medium", "normal"].includes(question.difficulty) ? 3 : 2;
    const streakBonus = record.correctStreak >= 3 ? 1 : 0;
    // The same template/position cannot be used to grind a Skill to 100.
    // A position already seen in the recent window earns no mastery, so users
    // cannot fill a Skill by immediately repeating the same question.
    const guidedGain = Math.max(0, Number(options.masteryGain ?? 10));
    const gain = lessonMode ? guidedGain : repeated ? 0 : base + streakBonus;
    record.masteryScore = Math.min(100, record.masteryScore + gain);
    record.recentSignatures = [...record.recentSignatures, question.signature].slice(-12);
  } else {
    record.wrongCount += 1; record.correctStreak = 0;
    if (!lessonMode) record.masteryScore = Math.max(0, record.masteryScore - 1);
  }
  return { before: oldScore, after: record.masteryScore, delta: record.masteryScore - oldScore, label: masteryLabel(record.masteryScore) };
}

/**
 * Course progress and practice mastery are deliberately independent:
 * - lessonProgress decides what can be learned next.
 * - skillMastery only decides what should be practised or reviewed.
 * Keep these helpers free of masteryRecord() calls so a 1% or 100% score can
 * never change course access.
 */
function isLessonCompleted(state, skillId) {
  const lesson = state.lessonProgress?.[skillId];
  return Boolean(lesson?.completed || lesson?.practiceCompleted);
}

function requiredLevelSkills(level) {
  return Object.values(skillById).filter(skill => skill.level === level && skill.practiceable);
}

function isLevelCompleted(state, level) {
  const required = requiredLevelSkills(level);
  return required.length > 0 && required.every(skill => isLessonCompleted(state, skill.id));
}

function canAccessLevel(state, level) {
  if (state.settings.unlockAllLevels || level === 0) return true;
  return isLevelCompleted(state, level - 1);
}

function levelAccess(state, level) {
  return canAccessLevel(state, level) ? "available" : "locked";
}

function levelUnlocked(state, level) {
  return canAccessLevel(state, level);
}

function canAccessSkill(state, skillId) {
  const skill = skillById[skillId];
  if (!skill) return false;
  if (state.settings.unlockAllLevels || isLessonCompleted(state, skillId)) return true;
  if (!canAccessLevel(state, skill.level)) return false;
  // Future placeholder lessons are visible as soon as their Level is reached.
  if (!skill.practiceable) return true;
  const sequence = requiredLevelSkills(skill.level);
  const index = sequence.findIndex(item => item.id === skillId);
  return index >= 0 && sequence.slice(0, index).every(item => isLessonCompleted(state, item.id));
}

function nextLesson(state) {
  return Object.values(skillById).find(skill => skill.practiceable && canAccessSkill(state, skill.id) && !isLessonCompleted(state, skill.id)) || null;
}

function lessonStats(state) {
  const implemented = Object.values(skillById).filter(skill => skill.practiceable);
  const completed = implemented.filter(skill => isLessonCompleted(state, skill.id)).length;
  const available = implemented.filter(skill => !isLessonCompleted(state, skill.id) && canAccessSkill(state, skill.id)).length;
  return { completed, available, notStarted: implemented.length - completed - available, total: implemented.length };
}

function localDayDistance(fromKey, toKey = getLocalDateKey()) {
  if (!fromKey) return 99;
  const asNoon = key => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day, 12).getTime(); };
  return Math.max(0, Math.round((asNoon(toKey) - asNoon(fromKey)) / 86400000));
}

function recommendedSkill(state) {
  const implemented = Object.values(skillById).filter(skill => skill.practiceable);
  const learned = implemented.filter(skill => isLessonCompleted(state, skill.id));
  const candidates = learned.length ? learned : implemented.filter(skill => canAccessSkill(state, skill.id));
  const overdue = candidates.map(skill => {
    const record = masteryRecord(state, skill.id);
    const days = localDayDistance(record.lastPracticedDate || (record.lastPracticed ? getLocalDateKey(record.lastPracticed) : null));
    let priority = 100 - record.masteryScore;
    if (days >= 7) priority += 28;
    if (record.attempts && skillAccuracy(state, skill.id) < 60) priority += 18;
    if (record.masteryScore > 90) priority -= 25;
    return { skill, priority, days };
  });
  return overdue.sort((a, b) => b.priority - a.priority)[0] || { skill: skillById.intro, priority: 0, days: 0 };
}

/** Adaptive mix: 50% weakest, 30% most recently learned, 20% review. */
function adaptiveSkill(state, random = Math.random) {
  const implemented = Object.values(skillById).filter(skill => skill.practiceable);
  const learned = implemented.filter(skill => isLessonCompleted(state, skill.id));
  const candidates = learned.length ? learned : implemented.filter(skill => canAccessSkill(state, skill.id));
  if (!candidates.length) return skillById.intro;
  const byWeakness = [...candidates].sort((a, b) => masteryRecord(state, a.id).masteryScore - masteryRecord(state, b.id).masteryScore);
  const practiced = [...candidates].filter(skill => masteryRecord(state, skill.id).lastPracticed).sort((a, b) => new Date(masteryRecord(state, b.id).lastPracticed) - new Date(masteryRecord(state, a.id).lastPracticed));
  const review = [...candidates].sort((a, b) => localDayDistance(masteryRecord(state, b.id).lastPracticedDate) - localDayDistance(masteryRecord(state, a.id).lastPracticedDate));
  const roll = random();
  if (roll < .5) return byWeakness[0];
  if (roll < .8) return practiced[0] || byWeakness[0];
  return review[0] || byWeakness[0];
}

function commonErrorType(state) {
  const counts = {};
  Object.values(state.mistakes || {}).forEach(mistake => { const type = mistake.errorType || "needs-review"; counts[type] = (counts[type] || 0) + (mistake.wrongCount || 1); });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function totalQuestions(state) { return Object.values(state.questionHistory).reduce((sum, q) => sum + q.attempts, 0); }
function totalCorrect(state) { return Object.values(state.questionHistory).reduce((sum, q) => sum + q.correct, 0); }
function totalAccuracy(state) { const total = totalQuestions(state); return total ? Math.round(totalCorrect(state) / total * 100) : 0; }
