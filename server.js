const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const sessions = new Map();

ensureStorage();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  const session = getSessionUser(req);
  res.redirect(session ? "/chat.html" : "/login.html");
});

app.get("/api/me", (req, res) => {
  const user = getSessionUser(req);

  if (!user) {
    return res.status(401).json({ error: "Not authorized" });
  }

  res.json({
    username: user.username,
    displayName: user.displayName
  });
});

app.post("/api/register", (req, res) => {
  const username = sanitizeText(req.body.username, 24);
  const displayName = sanitizeText(req.body.displayName, 32) || username;
  const password = String(req.body.password || "").trim();
  const users = readJson(USERS_FILE);

  if (!username || !password) {
    return res.status(400).json({ error: "Fill in all fields" });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: "Only letters, numbers and _ are allowed" });
  }

  if (users.length >= 2) {
    return res.status(403).json({ error: "Only two users can be registered in this chat" });
  }

  if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "This username is already taken" });
  }

  const newUser = {
    username,
    displayName,
    passwordHash: hashPassword(password)
  };

  users.push(newUser);
  writeJson(USERS_FILE, users);

  createSession(res, newUser);
  res.status(201).json({
    username: newUser.username,
    displayName: newUser.displayName
  });
});

app.post("/api/login", (req, res) => {
  const username = sanitizeText(req.body.username, 24);
  const password = String(req.body.password || "").trim();
  const users = readJson(USERS_FILE);
  const user = users.find((item) => item.username.toLowerCase() === username.toLowerCase());

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  createSession(res, user);
  res.json({
    username: user.username,
    displayName: user.displayName
  });
});

app.post("/api/logout", (req, res) => {
  const token = getSessionToken(req);

  if (token) {
    sessions.delete(token);
  }

  res.setHeader("Set-Cookie", buildSessionCookie("", 0));
  res.json({ ok: true });
});

app.get("/api/messages", requireAuth, (req, res) => {
  const messages = readJson(MESSAGES_FILE);
  res.json(messages);
});

app.post("/api/messages", requireAuth, (req, res) => {
  const text = sanitizeMessage(req.body.text);

  if (!text) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }

  const messages = readJson(MESSAGES_FILE);
  const message = {
    id: crypto.randomUUID(),
    username: req.user.username,
    displayName: req.user.displayName,
    text,
    createdAt: new Date().toISOString()
  };

  messages.push(message);
  writeJson(MESSAGES_FILE, messages.slice(-200));
  res.status(201).json(message);
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

function requireAuth(req, res, next) {
  const user = getSessionUser(req);

  if (!user) {
    return res.status(401).json({ error: "Not authorized" });
  }

  req.user = user;
  next();
}

function getSessionUser(req) {
  const token = getSessionToken(req);
  if (!token) {
    return null;
  }

  return sessions.get(token) || null;
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const sessionCookie = cookies.find((cookie) => cookie.startsWith("session="));
  return sessionCookie ? decodeURIComponent(sessionCookie.split("=")[1]) : null;
}

function createSession(res, user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    username: user.username,
    displayName: user.displayName
  });
  res.setHeader("Set-Cookie", buildSessionCookie(token));
}

function buildSessionCookie(token, maxAge = 1000 * 60 * 60 * 24 * 7) {
  return `session=${encodeURIComponent(token)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=Lax`;
}

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
  }

  if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, "[]", "utf8");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function sanitizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}
