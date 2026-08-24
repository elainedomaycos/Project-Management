-- Run this in your Supabase Dashboard SQL Editor after 00002_auth.sql

-- Notifications: alerts sent to developers when a task is assigned to them
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id, created_at DESC);

-- Keep RLS disabled for simplicity (app-level auth)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Enable realtime for INSERT events used by the notification bell
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
