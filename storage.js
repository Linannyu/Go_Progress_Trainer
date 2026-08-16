/** Local, versioned persistence. Everything is stored only in this browser. */
const STORAGE_KEY = "go-progress-trainer-v2";

const defaultState = () => ({
  profile: { hasStarted: false, level: 0, currentSkill: "intro", displayName: "围棋新手" },
  skillMastery: {},
  lessonProgress: {},
  questionHistory: {},
  mistakes: {},
  trainingSessions: [],
  activeSession: null,
  achievements: [],
  studyTimeSeconds: 0,
  streak: 0,
  longestStreak: 0,
  lastStudyDate: null,
  totalStudyDays: 0,
  settings: { developerMode: false, unlockAllLevels: false, showAnswers: false }
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? {
      ...defaultState(), ...saved,
      profile: { ...defaultState().profile, ...saved.profile },
      settings: { ...defaultState().settings, ...saved.settings }
    } : defaultState();
  } catch { return defaultState(); }
}

function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function resetState() { localStorage.removeItem(STORAGE_KEY); return defaultState(); }

function touchStudy(state) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastStudyDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = state.lastStudyDate === yesterday ? state.streak + 1 : 1;
  state.longestStreak = Math.max(state.longestStreak, state.streak);
  state.lastStudyDate = today;
  state.totalStudyDays += 1;
}

function addStudySeconds(state, seconds) {
  state.studyTimeSeconds = Math.max(0, Math.round((state.studyTimeSeconds || 0) + seconds));
}
