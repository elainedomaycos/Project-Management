-- ============================================================================
-- GRANT LEADERS GROUP MANAGEMENT + MISSING SCHEMA COLUMNS
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Projects: repository URL (written by the client project-edit form)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS repo_url TEXT DEFAULT null;

-- ---------------------------------------------------------------------------
-- Realtime: group_memberships (needed by the memberships-changes channel)
-- ---------------------------------------------------------------------------
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_memberships; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- RBAC: can the caller manage this group?
-- A system-role leader is the group leader, regardless of whether they also
-- hold a row in group_memberships (e.g. when an admin assigned them).
-- Without this, leader actions (member add/remove, task create) pass the UI
-- guard but fail RLS and are silently swallowed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_group(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_capstone_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'leader'
      )
      OR COALESCE(public.group_role(pid), '') = 'leader';
$$;