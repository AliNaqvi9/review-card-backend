// Simple in-memory lockout for /admin/login — no new dependency.
// Tracks failed attempts per IP; after too many, blocks further tries
// (including correct-password ones) until the cooldown passes. Resets on
// server restart, same as sessions — fine for a single-admin tool.

const MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5;
const LOCKOUT_MINUTES = parseFloat(process.env.LOGIN_LOCKOUT_MINUTES) || 15;
const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

const attempts = new Map(); // ip -> { count, firstAttempt, lockedUntil }

function getRecord(ip) {
  return attempts.get(ip) || { count: 0, firstAttempt: 0, lockedUntil: 0 };
}

function isLocked(ip) {
  return getRecord(ip).lockedUntil > Date.now();
}

function minutesRemaining(ip) {
  return Math.max(
    1,
    Math.ceil((getRecord(ip).lockedUntil - Date.now()) / 60000),
  );
}

function recordFailure(ip) {
  const now = Date.now();
  const record = getRecord(ip);

  // A failure long after the last one starts a fresh count instead of
  // accumulating forever.
  if (now - record.firstAttempt > LOCKOUT_MS) {
    record.count = 0;
    record.firstAttempt = now;
  }

  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(ip, record);
}

function clearAttempts(ip) {
  attempts.delete(ip);
}

// Keep the map from growing unbounded over a long uptime (scanners hit
// this from many different IPs). Sweep hourly; don't block process exit.
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, record] of attempts) {
      if (record.lockedUntil < now && now - record.firstAttempt > LOCKOUT_MS) {
        attempts.delete(ip);
      }
    }
  },
  60 * 60 * 1000,
).unref();

module.exports = {
  isLocked,
  minutesRemaining,
  recordFailure,
  clearAttempts,
  MAX_ATTEMPTS,
  getRecord,
  LOCKOUT_MINUTES,
};
