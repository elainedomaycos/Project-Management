-- Run this in your Supabase Dashboard SQL Editor after 00003_notifications.sql

-- Project timeline: AI-generated + editable Gantt plan
CREATE TABLE IF NOT EXISTS timeline_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES timeline_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('phase', 'epic', 'task', 'milestone')),
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  dependencies JSONB DEFAULT '[]',
  assignee TEXT DEFAULT '',
  effort TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- Link existing Scrum tasks to timeline items (Gantt epic -> tasks)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timeline_item_id TEXT REFERENCES timeline_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS timeline_items_project_idx ON timeline_items (project_id, sort_order);

-- Keep RLS disabled for simplicity (app-level auth)
ALTER TABLE timeline_items DISABLE ROW LEVEL SECURITY;

-- Enable realtime so timeline edits sync between users
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE timeline_items;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
