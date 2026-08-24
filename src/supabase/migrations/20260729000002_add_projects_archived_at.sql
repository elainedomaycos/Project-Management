-- Add archived_at column to projects for soft-delete (archive) support
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at TEXT DEFAULT NULL;

-- Keep RLS disabled for simplicity, consistent with the rest of this table
