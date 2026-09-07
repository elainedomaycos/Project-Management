-- ============================================================================
-- MULTI-SYSTEM REPOS + TASK REPO TAG
-- Replaces the single projects.repo_url with a JSONB list of repos, adds a
-- repo tag to tasks (dormant branch_name is kept but no longer used), and
-- restricts who may change a task's repo (admin/leader only).
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Projects: JSONB list of { label, url } repositories.
-- Keep repo_url dormant; backfill existing single-link projects into the list.
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS repos JSONB DEFAULT '[]'::jsonb;

UPDATE public.projects
SET repos = CASE
  WHEN repos::text = '[]' OR repos IS NULL OR jsonb_array_length(repos) = 0
    THEN CASE
      WHEN repo_url IS NOT NULL AND repo_url <> ''
        THEN jsonb_build_array(jsonb_build_object('label', 'Repository', 'url', repo_url))
      ELSE '[]'::jsonb
    END
  ELSE repos
END;

-- ---------------------------------------------------------------------------
-- Tasks: repo tag (a label from the project's repos, e.g. "Client System").
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS repo TEXT DEFAULT '';

-- ---------------------------------------------------------------------------
-- Security: only admins/leaders may reassign a task's repo.
-- Non-managers may still change status/QA fields but not the repo tag, which
-- is added to the existing enforce_task_field_permissions guard list.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_task_field_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_group(OLD.project_id) THEN
    IF NEW.title        IS DISTINCT FROM OLD.title
    OR NEW.task_id      IS DISTINCT FROM OLD.task_id
    OR NEW.project_id   IS DISTINCT FROM OLD.project_id
    OR NEW.developer    IS DISTINCT FROM OLD.developer
    OR NEW.category     IS DISTINCT FROM OLD.category
    OR NEW.field        IS DISTINCT FROM OLD.field
    OR NEW.due_date     IS DISTINCT FROM OLD.due_date
    OR NEW.start_date   IS DISTINCT FROM OLD.start_date
    OR NEW.priority     IS DISTINCT FROM OLD.priority
    OR NEW.end_user     IS DISTINCT FROM OLD.end_user
    OR NEW.module       IS DISTINCT FROM OLD.module
    OR NEW.timeline_item_id IS DISTINCT FROM OLD.timeline_item_id
    OR NEW.repo         IS DISTINCT FROM OLD.repo
    THEN
      RAISE EXCEPTION 'Members may only update task status fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_field_permissions ON public.tasks;
CREATE TRIGGER trg_task_field_permissions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_field_permissions();
