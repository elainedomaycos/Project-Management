-- Add created_by column to tasks for tracking who created each task
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
