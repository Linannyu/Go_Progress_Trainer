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

function levelUnlocked(state, level) {
  return levelAccess(state, level) !== "locked";
}

function levelAccess(state, level) {
  if (state.settings.unlockAllLevels || level === 0) return "available";
  const previous = level - 1;
  const prevSkills = Object.values(skillById).filter(skill => skill.level === previous);
  if (!prevSkills.length) return "locked";
  const average = prevSkills.reduce((sum, skill) => sum + masteryRecord(state, skill.id).masteryScore, 0) / prevSkills.length;
  const lessonsComplete = prevSkills.every(skill => state.lessonProgress[skill.id]?.practiceCompleted || state.lessonProgress[skill.id]?.completed);
  if (average >= 60) return "available";
  if (average >= 40 || lessonsComplete) return "preview";
  return "locked";
}

function localDayDistance(fromKey, toKey = getLocalDateKey()) {
  if (!fromKey) return 99;
  const asNoon = key => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day, 12).getTime(); };
  return Math.max(0, Math.round((asNoon(toKey) - asNoon(fromKey)) / 86400000));
}

function recommendedSkill(state) {
  const unlocked = Object.values(skillById).filter(skill => levelUnlocked(state, skill.level));
  const candidates = unlocked.filter(skill => skill.practiceable);
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
  const candidates = Object.values(skillById).filter(skill => skill.practiceable && levelUnlocked(state, skill.level));
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
