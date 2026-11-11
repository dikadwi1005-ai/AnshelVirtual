CREATE TABLE anshel.sessions (
  token_hash text PRIMARY KEY,
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX sessions_expires ON anshel.sessions (expires_at);
CREATE TABLE anshel.login_limits (
  client_key text PRIMARY KEY,
  window_start bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE anshel.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anshel.login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON anshel.sessions, anshel.login_limits FROM PUBLIC, anon, authenticated;
