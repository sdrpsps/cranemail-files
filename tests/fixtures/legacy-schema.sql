-- Schema from the application immediately before Drizzle was introduced.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  serverUrl TEXT,
  telegramUserId TEXT UNIQUE,
  encryptedPassword TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE bind_tokens (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE app_sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE smartermail_sessions (
  userId TEXT PRIMARY KEY,
  accessToken TEXT,
  accessTokenExpires TEXT,
  refreshToken TEXT,
  refreshTokenExpires TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE uploaded_files (
  id TEXT PRIMARY KEY,
  email TEXT,
  fileId TEXT,
  fileName TEXT,
  publicLink TEXT,
  size INTEGER,
  source TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
