// Real member accounts — sign up, sign in, and server-verified sessions.
//
// This replaces a self-reported "I'm a member" checkbox with something a
// guest can't just fake: membership (and therefore the member discount
// rate) is decided by whether a valid session token is presented, and that
// token only exists if the password check actually passed. The pricing
// code never trusts a client-supplied isMember flag anymore — see
// resolveMember() in server.js.
//
// Storage is plain JSON files (same pattern as bookings-store.json /
// promotions-store.json) — fine for a demo; a real production system would
// use a proper database and a battle-tested auth library instead of this.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MEMBERS_FILE = path.join(__dirname, "members-store.json");
const SESSIONS_FILE = path.join(__dirname, "sessions-store.json");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Node's built-in scrypt — no external password-hashing library needed.
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function signUp(email, password, fullName) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    return { error: "Please enter a valid email address." };
  }
  if (!password || String(password).length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const members = loadJson(MEMBERS_FILE);
  if (members[normalized]) {
    return { error: "An account with this email already exists — try logging in instead." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  members[normalized] = {
    email: normalized,
    fullName: fullName ? String(fullName).trim() : "",
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  saveJson(MEMBERS_FILE, members);

  return { member: { email: normalized, fullName: members[normalized].fullName } };
}

function login(email, password) {
  const normalized = normalizeEmail(email);
  const members = loadJson(MEMBERS_FILE);
  const record = members[normalized];
  // Same generic error whether the email doesn't exist or the password is
  // wrong — don't reveal which one it was (standard practice: avoids
  // leaking which emails have accounts).
  if (!record || hashPassword(password, record.salt) !== record.passwordHash) {
    return { error: "Incorrect email or password." };
  }
  return { member: { email: record.email, fullName: record.fullName } };
}

function createSession(email) {
  const sessions = loadJson(SESSIONS_FILE);
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { email, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  saveJson(SESSIONS_FILE, sessions);
  return token;
}

// Returns the member's { email, fullName } if the token is a valid,
// unexpired session — otherwise null. This is the ONLY source of truth for
// "is this guest actually a member," used by both search-time pricing and
// actual booking submission.
function memberForToken(token) {
  if (!token) return null;
  const sessions = loadJson(SESSIONS_FILE);
  const session = sessions[token];
  if (!session || session.expiresAt < Date.now()) return null;

  const members = loadJson(MEMBERS_FILE);
  const record = members[session.email];
  if (!record) return null; // account was deleted after the session was issued

  return { email: record.email, fullName: record.fullName };
}

function destroySession(token) {
  if (!token) return;
  const sessions = loadJson(SESSIONS_FILE);
  delete sessions[token];
  saveJson(SESSIONS_FILE, sessions);
}

module.exports = { signUp, login, createSession, memberForToken, destroySession };
