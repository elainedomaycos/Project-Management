-- Run this in your Supabase Dashboard SQL Editor

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  end_users JSONB DEFAULT '[]',
  modules JSONB DEFAULT '[]',
  created_at TEXT NOT NULL
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  developer TEXT DEFAULT '',
  category TEXT DEFAULT '',
  field TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  qa_status TEXT DEFAULT 'waiting',
  commit TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  completed_at TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  branch_name TEXT DEFAULT '',
  end_user TEXT DEFAULT '',
  module TEXT DEFAULT ''
);

-- Settings (developers list, QA users, etc)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Insert defaults
INSERT INTO projects (id, name, prefix, created_at) VALUES
  ('tourism', 'Tourism Management System', 'TS', '2026-03-01'),
  ('cbms', 'CBMMS', 'CBMMS', '2026-02-15')
ON CONFLICT (id) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('developers', '["Rachel", "Mcdoel", "Alvin", "John", "Elaine", "Carl"]'),
  ('qa_users', '["Sara", "Mike"]')
ON CONFLICT (key) DO NOTHING;

-- Disable RLS for simplicity (single-app usage)
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
