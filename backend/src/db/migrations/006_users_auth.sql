-- Users, roles, multi-factor authentication and sessions.
-- Secrets are never stored in clear: passwords and one-time codes are hashed,
-- session tokens are stored as SHA-256 hashes, TOTP secrets are encrypted (AES-256-GCM).

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'principal', 'registrar', 'bursar', 'cashier', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mfa_method AS ENUM ('totp', 'email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  username             TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
  full_name            TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  role                 user_role NOT NULL,
  teacher_id           INT REFERENCES teachers(id) ON DELETE SET NULL,   -- a teacher account sees its own classes
  password_hash        TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  mfa_method           mfa_method NOT NULL DEFAULT 'email',
  totp_secret          TEXT,                 -- encrypted
  totp_confirmed       BOOLEAN NOT NULL DEFAULT false,
  totp_last_step       BIGINT,               -- last accepted 30 s step: a code can be used only once
  is_active            BOOLEAN NOT NULL DEFAULT true,
  failed_attempts      INT NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A code can only be sent where the user can receive it
  CHECK (mfa_method <> 'email' OR email IS NOT NULL),
  CHECK (mfa_method <> 'sms' OR phone IS NOT NULL),
  CHECK (role <> 'teacher' OR teacher_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_teacher ON users(teacher_id) WHERE teacher_id IS NOT NULL;

-- Step 2 of the login: after the password, a short-lived challenge waits for the second factor
CREATE TABLE IF NOT EXISTS auth_challenges (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('login', 'totp_setup')),
  method     mfa_method NOT NULL,
  code_hash  TEXT,                -- email / SMS code (TOTP codes are computed, not stored)
  pending_secret TEXT,            -- encrypted TOTP secret being set up
  attempts   INT NOT NULL DEFAULT 0,
  sent_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_user ON auth_challenges(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Security log: sign-ins, failures, lockouts, user changes
CREATE TABLE IF NOT EXISTS auth_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  event      TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, created_at DESC);
