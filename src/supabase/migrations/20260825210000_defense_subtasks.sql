-- ============================================================================
-- Defense sub-tasks: member-level checklist items under each deliverable.
-- Any group member can add/toggle their items; leaders/admins manage all.
-- Run AFTER 20260825200000_capstone_features.sql. Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.defense_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id UUID NOT NULL REFERENCES public.defense_deliverables(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  assignee TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS defense_subtasks_deliverable_idx
  ON public.defense_subtasks (deliverable_id, created_at);
CREATE INDEX IF NOT EXISTS defense_subtasks_project_idx
  ON public.defense_subtasks (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defense_subtasks TO authenticated;
GRANT ALL ON public.defense_subtasks TO service_role;

DO $$ BEGIN ALTER TABLE public.defense_subtasks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "subtasks_read" ON public.defense_subtasks FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "subtasks_write" ON public.defense_subtasks FOR ALL TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id))
    WITH CHECK (public.is_capstone_admin() OR public.in_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.defense_subtasks;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;
