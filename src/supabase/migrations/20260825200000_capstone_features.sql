-- ============================================================================
-- Capstone feature modules: Final Defense board, Document versioning,
-- Adviser portal + feedback, Contribution metrics, Group health statuses.
-- Extends the RBAC model with an 'adviser' system role.
-- Run AFTER 20260825000000_capstone_rbac.sql. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. 'adviser' joins the system-role set
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'adviser', 'leader', 'developer', 'viewer'));

-- ---------------------------------------------------------------------------
-- B. Projects: hard deadline, adviser assignment, health status
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS final_defense_date TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS adviser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS health_source TEXT NOT NULL DEFAULT 'auto';

DO $$ BEGIN
  ALTER TABLE public.projects ADD CONSTRAINT projects_health_check
    CHECK (health_status IN ('on_track', 'at_risk', 'behind'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.projects ADD CONSTRAINT projects_health_source_check
    CHECK (health_source IN ('auto', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- C. Helper: is the caller the assigned adviser of a project?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_project_adviser(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = pid AND adviser_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_adviser(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_adviser(text) TO authenticated, service_role;

-- Extend existing read policies so advisers see their assigned project
DROP POLICY IF EXISTS "projects_read" ON public.projects;
DO $$ BEGIN
  CREATE POLICY "projects_read" ON public.projects FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(id) OR public.is_project_adviser(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
DO $$ BEGIN
  CREATE POLICY "tasks_read" ON public.tasks FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "timeline_read" ON public.timeline_items;
DO $$ BEGIN
  CREATE POLICY "timeline_read" ON public.timeline_items FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- D. Final Defense deliverables checklist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.defense_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected')),
  rejection_note TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS defense_deliverables_project_idx
  ON public.defense_deliverables (project_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defense_deliverables TO authenticated;
GRANT ALL ON public.defense_deliverables TO service_role;

-- Only admins may approve/reject a submitted deliverable
CREATE OR REPLACE FUNCTION public.enforce_deliverable_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('approved', 'rejected')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT public.is_capstone_admin() THEN
    RAISE EXCEPTION 'Only an admin can approve or reject deliverables';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliverable_approval ON public.defense_deliverables;
CREATE TRIGGER trg_deliverable_approval
  BEFORE UPDATE ON public.defense_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deliverable_approval();

DO $$ BEGIN ALTER TABLE public.defense_deliverables ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "defense_read" ON public.defense_deliverables FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "defense_write" ON public.defense_deliverables FOR ALL TO authenticated
    USING (public.can_manage_group(project_id))
    WITH CHECK (public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- E. Document repository (versioned links per chapter)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL DEFAULT 'Other',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'gdrive'
    CHECK (source_type IN ('gdrive', 'github', 'figma', 'other')),
  version TEXT NOT NULL DEFAULT 'v1.0',
  revision_notes TEXT DEFAULT '',
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_project_chapter_idx
  ON public.documents (project_id, chapter, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

DO $$ BEGIN ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "documents_read" ON public.documents FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
    WITH CHECK (public.in_group(project_id) OR public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated
    USING (public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- F. Adviser / coordinator feedback log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chapter TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'comment'
    CHECK (category IN ('comment', 'change_request', 'approval')),
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'addressed', 'dismissed')),
  task_created BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS feedback_project_idx
  ON public.feedback (project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

DO $$ BEGIN ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "feedback_read" ON public.feedback FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT TO authenticated
    WITH CHECK (public.is_capstone_admin() OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Author may edit own entry; group members mark feedback addressed/dismissed.
  CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.is_capstone_admin()
           OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- G. Activity log ("who did what")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_log_project_idx
  ON public.activity_log (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_user_idx
  ON public.activity_log (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

DO $$ BEGIN ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "activity_read" ON public.activity_log FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "activity_insert" ON public.activity_log FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- H. Realtime for the new tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.defense_deliverables;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;
