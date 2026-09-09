-- ============================================================================
-- ADD `kind` to DEFECTS — distinguish defects from AI-generated test cases.
-- Test cases share the defects table (a test case verifies that a feature
-- task works; it is linked via related_task_id). Run in Supabase SQL Editor
-- (runs as postgres, bypasses RLS). Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'defect'
  CHECK (kind IN ('defect', 'test_case'));

CREATE INDEX IF NOT EXISTS defects_kind_idx ON public.defects (project_id, kind, created_at);

-- Members may only update status; protect `kind` (and existing locked fields)
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
    OR OLD.kind           IS DISTINCT FROM NEW.kind
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