-- ============================================================================
-- ADD DEFECTS TABLE — holistic system-testing defect log
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.defects (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  module TEXT DEFAULT '',
  environment TEXT DEFAULT '',
  precondition TEXT DEFAULT '',
  steps_to_reproduce TEXT DEFAULT '',
  expected_result TEXT DEFAULT '',
  actual_result TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'Medium'
    CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Low', 'Medium', 'High')),
  status TEXT NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'In Progress', 'Fixed', 'Closed')),
  assigned_developer_id TEXT DEFAULT '',
  related_task_id TEXT DEFAULT '',
  evidence_url TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

-- Column added to existing tables when this migration is re-run
ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS related_task_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS defects_project_idx ON public.defects (project_id, created_at);

-- ---------------------------------------------------------------------------
-- Trigger: members may only update the status field on defects
-- (mirrors enforce_task_field_permissions on tasks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_defect_field_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_group(OLD.project_id) THEN
    IF OLD.title          IS DISTINCT FROM NEW.title
    OR OLD.module         IS DISTINCT FROM NEW.module
    OR OLD.environment    IS DISTINCT FROM NEW.environment
    OR OLD.precondition   IS DISTINCT FROM NEW.precondition
    OR OLD.steps_to_reproduce IS DISTINCT FROM NEW.steps_to_reproduce
    OR OLD.expected_result IS DISTINCT FROM NEW.expected_result
    OR OLD.actual_result  IS DISTINCT FROM NEW.actual_result
    OR OLD.severity       IS DISTINCT FROM NEW.severity
    OR OLD.priority       IS DISTINCT FROM NEW.priority
    OR OLD.assigned_developer_id IS DISTINCT FROM NEW.assigned_developer_id
    OR OLD.related_task_id  IS DISTINCT FROM NEW.related_task_id
    OR OLD.evidence_url   IS DISTINCT FROM NEW.evidence_url
    THEN
      RAISE EXCEPTION 'Members may only update defect status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_defect_field_permissions ON public.defects;
CREATE TRIGGER trg_defect_field_permissions
  BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_defect_field_permissions();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defects TO authenticated;
GRANT ALL ON public.defects TO service_role;

CREATE POLICY "defects_read" ON public.defects FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "defects_insert" ON public.defects FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_group(project_id));
CREATE POLICY "defects_update" ON public.defects FOR UPDATE TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id))
  WITH CHECK (public.is_capstone_admin() OR public.in_group(project_id));
CREATE POLICY "defects_delete" ON public.defects FOR DELETE TO authenticated
  USING (public.can_manage_group(project_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.defects; EXCEPTION WHEN duplicate_object THEN NULL; END $$;