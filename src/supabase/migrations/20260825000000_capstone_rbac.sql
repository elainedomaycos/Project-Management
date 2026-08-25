-- ============================================================================
-- Capstone RBAC: strict per-group access control
-- Roles: profiles.role IN ('admin','leader','developer','viewer')
--   admin    = block coordinator (faculty/lead): full access everywhere
--   leader   = group/project lead: full write within own group(s)
--   developer= member: read + status updates + comments within own group
--   viewer   = read-only within assigned groups
-- Run in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop orphaned startup/portfolio/event tables
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.event_deliverables CASCADE;
DROP TABLE IF EXISTS public.event_registrations CASCADE;
DROP TABLE IF EXISTS public.hackathon_projects CASCADE;
DROP TABLE IF EXISTS public.hackathons CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.project_links CASCADE;
DROP TABLE IF EXISTS public.member_projects CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Remap system role on profiles
-- ---------------------------------------------------------------------------
UPDATE public.profiles SET role = 'admin' WHERE role = 'super_admin';
UPDATE public.profiles SET role = 'developer' WHERE role NOT IN ('super_admin', 'admin');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'leader', 'developer', 'viewer'));

UPDATE public.invitations SET role = 'developer' WHERE role NOT IN ('leader', 'developer', 'viewer');
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('leader', 'developer', 'viewer'));

-- Admin bootstrap allowlist (emails may self-register as admin on first login).
-- Matches the previous SUPER_ADMIN_EMAILS constant.
INSERT INTO public.settings (key, value) VALUES
  ('admin_emails', '["edomaycos@gmail.com", "abellajoshua18@gmail.com", "allenmartillan715@gmail.com"]')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Group memberships (capstone group <-> user <-> per-group role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_memberships (
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('leader', 'developer', 'viewer')),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_memberships_user_idx ON public.group_memberships (user_id);
CREATE INDEX IF NOT EXISTS group_memberships_project_idx ON public.group_memberships (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_memberships TO authenticated;
GRANT ALL ON public.group_memberships TO service_role;

-- Only admins may grant/revoke the 'leader' role (leaders manage plain members)
CREATE OR REPLACE FUNCTION public.enforce_membership_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.role = 'leader' AND OLD.role IS DISTINCT FROM 'leader'
       AND NOT public.is_capstone_admin() THEN
      RAISE EXCEPTION 'Only an admin can assign or change the leader role';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'leader' AND NEW.role <> 'leader'
     AND NOT public.is_capstone_admin() THEN
    RAISE EXCEPTION 'Only an admin can demote a leader';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_membership_role_change ON public.group_memberships;
CREATE TRIGGER trg_membership_role_change
  BEFORE INSERT OR UPDATE ON public.group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_role_change();

-- ---------------------------------------------------------------------------
-- 4. Helper functions (SECURITY DEFINER so policies avoid recursive RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_capstone_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.group_role(pid text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.group_memberships
  WHERE user_id = auth.uid() AND project_id = pid
$$;

CREATE OR REPLACE FUNCTION public.can_manage_group(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_capstone_admin()
      OR COALESCE(public.group_role(pid), '') = 'leader'
$$;

CREATE OR REPLACE FUNCTION public.in_group(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.group_role(pid) IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.is_capstone_admin(), public.group_role(text),
  public.can_manage_group(text), public.in_group(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_capstone_admin(), public.group_role(text),
  public.can_manage_group(text), public.in_group(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Profile protection: only admins may change anyone's system role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_email(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.settings
    WHERE key = 'admin_emails' AND value ? lower(p_email)
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'developer' AND NOT public.is_admin_email(LOWER(NEW.email)) THEN
      RAISE EXCEPTION 'Only allowlisted coordinator emails may hold elevated roles';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND NOT public.is_capstone_admin()
       AND NOT public.is_admin_email(LOWER(NEW.email)) THEN
      RAISE EXCEPTION 'Only an admin can change system roles';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profile_role ON public.profiles;
CREATE TRIGGER trg_profile_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role();

-- Developers may not modify tasks' planning fields (title, dates, priority...)
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
    THEN
      RAISE EXCEPTION 'Members may only update task status fields (status, qa_status, commit, remarks, branch_name, completed_at)';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_field_permissions ON public.tasks;
CREATE TRIGGER trg_task_field_permissions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_field_permissions();

-- ---------------------------------------------------------------------------
-- 6. Enable RLS + policies
-- ---------------------------------------------------------------------------
DO $$ BEGIN ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.timeline_items ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- PROJECTS -------------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY "projects_read" ON public.projects FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
    WITH CHECK (public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
    USING (public.can_manage_group(id)) WITH CHECK (public.can_manage_group(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated
    USING (public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TASKS ----------------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY "tasks_read" ON public.tasks FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id))
    WITH CHECK (public.is_capstone_admin() OR public.in_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
    USING (public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TIMELINE (phases / epics / milestones) --------------------------------------
DO $$ BEGIN
  CREATE POLICY "timeline_read" ON public.timeline_items FOR SELECT TO authenticated
    USING (public.is_capstone_admin() OR public.in_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "timeline_write" ON public.timeline_items FOR ALL TO authenticated
    USING (public.can_manage_group(project_id))
    WITH CHECK (public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TASK COMMENTS ----------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY "comments_read" ON public.task_comments FOR SELECT TO authenticated
    USING (
      public.is_capstone_admin()
      OR public.in_group((SELECT project_id FROM public.tasks WHERE id = task_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "comments_insert" ON public.task_comments FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND (
        public.is_capstone_admin()
        OR public.in_group((SELECT project_id FROM public.tasks WHERE id = task_id))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "comments_update" ON public.task_comments FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "comments_delete" ON public.task_comments FOR DELETE TO authenticated
    USING (
      user_id = auth.uid()
      OR public.can_manage_group((SELECT project_id FROM public.tasks WHERE id = task_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NOTIFICATIONS ---------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      OR public.is_capstone_admin()
      OR public.can_manage_group(
        (SELECT project_id FROM public.tasks WHERE id = task_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CREDENTIALS (secrets vault: leaders/admin write, members read own group) ------
DO $$ BEGIN
  CREATE POLICY "credentials_read" ON public.credentials FOR SELECT TO authenticated
    USING (
      public.is_capstone_admin()
      OR (
        project_id IS NOT NULL AND COALESCE(public.group_role(project_id), '') <> 'viewer'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "credentials_write" ON public.credentials FOR ALL TO authenticated
    USING (public.is_capstone_admin() OR public.can_manage_group(project_id))
    WITH CHECK (public.is_capstone_admin() OR public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SETTINGS (global config: read all, write admin) ------------------------------
DO $$ BEGIN
  CREATE POLICY "settings_read" ON public.settings FOR SELECT TO authenticated
    USING (
      public.is_capstone_admin()
      OR NOT (key IN ('admin_emails'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "settings_write" ON public.settings FOR ALL TO authenticated
    USING (public.is_capstone_admin()) WITH CHECK (public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PROFILES (member directory readable by signed-in users; self-service edits) ---
DO $$ BEGIN
  CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_capstone_admin())
    WITH CHECK (id = auth.uid() OR public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INVITATIONS (coordinator tooling) --------------------------------------------
DO $$ BEGIN
  CREATE POLICY "invitations_all" ON public.invitations FOR ALL TO authenticated
    USING (public.is_capstone_admin())
    WITH CHECK (public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- GROUP MEMBERSHIPS -------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY "memberships_read" ON public.group_memberships FOR SELECT TO authenticated
    USING (
      public.is_capstone_admin()
      OR user_id = auth.uid()
      OR public.in_group(project_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "memberships_write" ON public.group_memberships FOR ALL TO authenticated
    USING (public.can_manage_group(project_id))
    WITH CHECK (public.can_manage_group(project_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
