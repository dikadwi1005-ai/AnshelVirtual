-- Single private, transactionally versioned aggregate follows the office setting convention.
-- The aggregate contains leads, watches, offers, snapshots, scan logs and notification outbox.
-- Existing task, audit and Telegram records are never rewritten.
CREATE TABLE IF NOT EXISTS anshel.automation_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND payload->>'version' = '1'),
  updated_at bigint NOT NULL CHECK (updated_at >= 0)
);
ALTER TABLE anshel.automation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON anshel.automation_state FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE anshel.automation_state IS
  'Owner-only Lead Hunter and Flight Tracker. All mutation goes through server auth, advisory lock and revision fencing.';
