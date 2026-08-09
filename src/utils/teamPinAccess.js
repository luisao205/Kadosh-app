export const TEAM_PIN_DOC_PATH = ['sistema', 'teamAccessPin'];
export const TEAM_PIN_SESSION_KEY = 'kadosh_team_pin_verified';
export const TEAM_PIN_LOCK_KEY = 'kadosh_team_pin_lock';
export const TEAM_PIN_SESSION_TTL_MS = 15 * 60 * 1000;
export const TEAM_PIN_EXIT_GRACE_MS = 5 * 1000;

let teamPinExitTimer = null;

const textEncoder = new TextEncoder();

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('');

export const sanitizePin = (value = '') => String(value).replace(/\D/g, '').slice(0, 4);

export const isCompletePin = (value = '') => /^\d{4}$/.test(String(value));

export const createPinSalt = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const hashTeamPin = async (pin, salt) => {
  const payload = textEncoder.encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return toHex(digest);
};

export const getTeamPinVersion = (config = {}) => String(
  config.pinVersion
  || config.updatedAt?.toMillis?.()
  || config.updatedAt?.seconds
  || config.updatedAt
  || 'legacy'
);

export const getTeamPinSession = (userId, pinVersion = null) => {
  try {
    const raw = sessionStorage.getItem(TEAM_PIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId || !parsed?.verifiedAt) return null;
    if (pinVersion && parsed?.pinVersion !== pinVersion) {
      sessionStorage.removeItem(TEAM_PIN_SESSION_KEY);
      return null;
    }
    if (Date.now() - Number(parsed.verifiedAt) > TEAM_PIN_SESSION_TTL_MS) {
      sessionStorage.removeItem(TEAM_PIN_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(TEAM_PIN_SESSION_KEY);
    return null;
  }
};

export const markTeamPinVerified = (userId, pinVersion) => {
  sessionStorage.setItem(TEAM_PIN_SESSION_KEY, JSON.stringify({
    userId,
    verifiedAt: Date.now(),
    pinVersion
  }));
};

export const clearTeamPinSession = () => {
  try {
    sessionStorage.removeItem(TEAM_PIN_SESSION_KEY);
  } catch {}
};

export const getTeamPinLock = (userId) => {
  try {
    const raw = sessionStorage.getItem(TEAM_PIN_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId) return null;
    return {
      userId: parsed.userId,
      failedAttempts: Math.max(0, Number(parsed.failedAttempts) || 0),
      lockLevel: Math.max(0, Number(parsed.lockLevel) || 0),
      lockedUntil: Math.max(0, Number(parsed.lockedUntil) || 0)
    };
  } catch {
    sessionStorage.removeItem(TEAM_PIN_LOCK_KEY);
    return null;
  }
};

export const setTeamPinLock = (userId, state = {}) => {
  sessionStorage.setItem(TEAM_PIN_LOCK_KEY, JSON.stringify({
    userId,
    failedAttempts: Math.max(0, Number(state.failedAttempts) || 0),
    lockLevel: Math.max(0, Number(state.lockLevel) || 0),
    lockedUntil: Math.max(0, Number(state.lockedUntil) || 0)
  }));
};

export const clearTeamPinLock = () => {
  try {
    sessionStorage.removeItem(TEAM_PIN_LOCK_KEY);
  } catch {}
};

export const clearTeamPinAccessState = () => {
  clearTeamPinSession();
  clearTeamPinLock();
};

export const scheduleTeamPinExitInvalidation = () => {
  if (teamPinExitTimer) clearTimeout(teamPinExitTimer);
  teamPinExitTimer = setTimeout(() => {
    clearTeamPinSession();
    teamPinExitTimer = null;
  }, TEAM_PIN_EXIT_GRACE_MS);
};

export const cancelTeamPinExitInvalidation = () => {
  if (teamPinExitTimer) {
    clearTimeout(teamPinExitTimer);
    teamPinExitTimer = null;
  }
};
