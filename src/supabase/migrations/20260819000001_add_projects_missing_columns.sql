-- Add missing columns to the projects table that the app code expects
-- The original 00001_schema.sql used CREATE TABLE IF NOT EXISTS, so if the
-- table already existed (e.g. created by Lovable), those columns were never added.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS prefix TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS end_users JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS modules JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS archived_at TEXT DEFAULT NULL;

-- Backfill prefix for existing rows that have an empty prefix
UPDATE public.projects SET prefix = upper(left(replace(name, ' ', ''), 4)) WHERE prefix = '' AND prefix IS NOT NULL;
