const masteryLabels = [
  [0, 19, "刚接触"], [20, 39, "学习中"], [40, 59, "基本理解"],
  [60, 79, "熟悉"], [80, 94, "熟练"], [95, 100, "Mastered"]
];

function masteryRecord(state, skillId) {
  if (!state.skillMastery[skillId]) state.skillMastery[skillId] = {
    masteryScore: 0, correctStreak: 0, wrongCount: 0, attempts: 0, correct: 0,
    lastPracticed: null, recentSignatures: []
  };
  return state.skillMastery[skillId];
}

function masteryLabel(score = 0) { return masteryLabels.find(([min, max]) => score >= min && score <= max)?.[2] || "刚接触"; }
function skillAccuracy(state, skillId) {
  const record = masteryRecord(state, skillId);
  return record.attempts ? Math.round(record.correct / record.attempts * 100) : 0;
}

/** Update mastery from a real question. Repeated positions gain much less. */
function applyPracticeResult(state, question, correct) {
  const record = masteryRecord(state, question.skill);
  const oldScore = record.masteryScore;
  record.attempts += 1; record.lastPracticed = new Date().toISOString();
  const repeated = record.recentSignatures.includes(question.signature);
  if (correct) {
    record.correct += 1; record.correctStreak += 1;
    const base = question.difficulty === "challenge" ? 5 : question.difficulty === "normal" ? 3 : 2;
    const streakBonus = record.correctStreak >= 3 ? 1 : 0;
    // The same template/position cannot be used to grind a Skill to 100.
    // A position already seen in the recent window earns no mastery, so users
    // cannot fill a Skill by immediately repeating the same question.
    const gain = repeated ? 0 : base + streakBonus;
    record.masteryScore = Math.min(100, record.masteryScore + gain);
  } else {
    record.wrongCount += 1; record.correctStreak = 0;
    record.masteryScore = Math.max(0, record.masteryScore - 1);
  }
  record.recentSignatures = [...record.recentSignatures, question.signature].slice(-12);
  return { before: oldScore, after: record.masteryScore, delta: record.masteryScore - oldScore, label: masteryLabel(record.masteryScore) };
}

function levelUnlocked(state, level) {
  if (state.settings.unlockAllLevels || level === 0) return true;
  const previous = level - 1;
  const prevSkills = Object.values(skillById).filter(skill => skill.level === previous);
  return prevSkills.length > 0 && prevSkills.every(skill => masteryRecord(state, skill.id).masteryScore >= 40);
}

function recommendedSkill(state) {
  const unlocked = Object.values(skillById).filter(skill => levelUnlocked(state, skill.level));
  const candidates = unlocked.filter(skill => skill.practiceable);
  const overdue = candidates.map(skill => {
    const record = masteryRecord(state, skill.id);
    const days = record.lastPracticed ? (Date.now() - new Date(record.lastPracticed).getTime()) / 86400000 : 99;
    let priority = 100 - record.masteryScore;
    if (days >= 7) priority += 28;
    if (record.attempts && skillAccuracy(state, skill.id) < 60) priority += 18;
    if (record.masteryScore > 90) priority -= 25;
    return { skill, priority, days };
  });
  return overdue.sort((a, b) => b.priority - a.priority)[0] || { skill: skillById.intro, priority: 0, days: 0 };
}

function totalQuestions(state) { return Object.values(state.questionHistory).reduce((sum, q) => sum + q.attempts, 0); }
function totalCorrect(state) { return Object.values(state.questionHistory).reduce((sum, q) => sum + q.correct, 0); }
function totalAccuracy(state) { const total = totalQuestions(state); return total ? Math.round(totalCorrect(state) / total * 100) : 0; }
