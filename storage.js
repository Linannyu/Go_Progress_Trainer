/** Local, versioned persistence. Everything stays in this browser. */
const STORAGE_KEY = "go-progress-trainer-v2";
const STORAGE_VERSION = 3;
const ACTIVE_STUDY_TIMEOUT_MS = 3 * 60 * 1000;

const defaultState = () => ({
  storageVersion: STORAGE_VERSION,
  profile: { hasStarted: false, level: 0, currentSkill: "intro", displayName: "围棋新手" },
  skillMastery: {}, lessonProgress: {}, questionHistory: {}, mistakes: {},
  trainingSessions: [], activeSession: null, achievements: [],
  studyTimeSeconds: 0, dailyStudySeconds: {},
  streak: 0, longestStreak: 0, lastStudyDate: null, totalStudyDays: 0,
  settings: { developerMode: false, unlockAllLevels: false, showAnswers: false }
});

/** Local calendar key. UTC ISO dates must not be used for daily learning data. */
function getLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateOffsetKey(value, dayOffset) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return getLocalDateKey(date);
}

function migrateState(saved) {
  if (!saved || typeof saved !== "object") return defaultState();
  const next = {
    ...defaultState(), ...saved,
    profile: { ...defaultState().profile, ...(saved.profile || {}) },
    settings: { ...defaultState().settings, ...(saved.settings || {}) },
    dailyStudySeconds: { ...(saved.dailyStudySeconds || {}) }
  };
  // v2 stored one total only. Preserve it; future active seconds fill daily data.
  if (!Number.isFinite(next.studyTimeSeconds)) next.studyTimeSeconds = 0;
  if (Array.isArray(next.mistakes)) next.mistakes = Object.fromEntries(next.mistakes.map((item, index) => [`legacy-${index}`, item]));
  next.storageVersion = STORAGE_VERSION;
  return next;
}

function loadState() {
  try { return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return defaultState(); }
}

function saveState(state) { state.storageVersion = STORAGE_VERSION; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function resetState() { localStorage.removeItem(STORAGE_KEY); return defaultState(); }

function touchStudy(state, value = new Date()) {
  const today = getLocalDateKey(value);
  if (state.lastStudyDate === today) return false;
  const yesterday = localDateOffsetKey(value, -1);
  state.streak = state.lastStudyDate === yesterday ? (state.streak || 0) + 1 : 1;
  state.longestStreak = Math.max(state.longestStreak || 0, state.streak);
  state.lastStudyDate = today;
  state.totalStudyDays = (state.totalStudyDays || 0) + 1;
  return true;
}

function addStudySeconds(state, seconds, value = new Date()) {
  const amount = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!amount) return 0;
  const key = getLocalDateKey(value);
  state.studyTimeSeconds = Math.max(0, Math.round((state.studyTimeSeconds || 0) + amount));
  state.dailyStudySeconds ||= {};
  state.dailyStudySeconds[key] = Math.max(0, Math.round((state.dailyStudySeconds[key] || 0) + amount));
  return amount;
}

/** Active study timer. It caps each active span at three idle minutes. */
function createActiveStudyTimer(now = Date.now()) { return { active: false, lastInteractionAt: now, lastCommittedAt: now }; }
function commitActiveStudy(state, timer, now = Date.now()) {
  if (!timer.active) return 0;
  const cutoff = Math.min(now, timer.lastInteractionAt + ACTIVE_STUDY_TIMEOUT_MS);
  const seconds = Math.max(0, Math.floor((cutoff - timer.lastCommittedAt) / 1000));
  if (seconds) addStudySeconds(state, seconds, new Date(cutoff));
  timer.lastCommittedAt = cutoff;
  if (now >= timer.lastInteractionAt + ACTIVE_STUDY_TIMEOUT_MS) timer.active = false;
  return seconds;
}
function activateStudy(state, timer, now = Date.now()) {
  commitActiveStudy(state, timer, now);
  touchStudy(state, new Date(now));
  timer.active = true; timer.lastInteractionAt = now; timer.lastCommittedAt = now;
}
function pauseStudy(state, timer, now = Date.now()) {
  const seconds = commitActiveStudy(state, timer, now);
  timer.active = false; timer.lastCommittedAt = now;
  return seconds;
}
