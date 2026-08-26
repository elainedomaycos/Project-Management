-- ============================================================================
-- FULL SCHEMA RESET — single consolidated migration
-- Drops all tables/functions/policies, recreates everything from scratch.
-- Existing auth.users and public.profiles are PRESERVED.
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- ============================================================================

-- ============================================================================
-- PART 1: DROP EVERYTHING
-- ============================================================================

-- Drop tables (order matters for FK dependencies)
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.task_comments CASCADE;
DROP TABLE IF EXISTS public.defense_subtasks CASCADE;
DROP TABLE IF EXISTS public.feedback CASCADE;
DROP TABLE IF EXISTS public.defense_deliverables CASCADE;
DROP TABLE IF EXISTS public.credentials CASCADE;
DROP TABLE IF EXISTS public.group_memberships CASCADE;
DROP TABLE IF EXISTS public.activity_log CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.timeline_items CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop leftover startup/portfolio tables
DROP TABLE IF EXISTS public.event_deliverables CASCADE;
DROP TABLE IF EXISTS public.event_registrations CASCADE;
DROP TABLE IF EXISTS public.hackathon_projects CASCADE;
DROP TABLE IF EXISTS public.hackathons CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.project_links CASCADE;
DROP TABLE IF EXISTS public.member_projects CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_capstone_admin() CASCADE;
DROP FUNCTION IF EXISTS public.group_role(text) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_group(text) CASCADE;
DROP FUNCTION IF EXISTS public.in_group(text) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_email(text) CASCADE;
DROP FUNCTION IF EXISTS public.is_project_adviser(text) CASCADE;
DROP FUNCTION IF EXISTS public.enforce_membership_role_change() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_profile_role() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_task_field_permissions() CASCADE;
DROP FUNCTION IF EXISTS public.recompute_deliverable_status() CASCADE;

-- ============================================================================
-- PART 2: CREATE TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Profiles (linked to auth.users — must exist before projects)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  name TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('admin', 'adviser', 'leader', 'developer', 'viewer')),
  avatar_url TEXT,
  team TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  role_title TEXT DEFAULT '',
  skills TEXT[] DEFAULT '{}',
  links JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- B. Projects
-- ---------------------------------------------------------------------------
CREATE TABLE public.projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  end_users JSONB DEFAULT '[]',
  modules JSONB DEFAULT '[]',
  created_at TEXT NOT NULL,
  archived_at TEXT DEFAULT NULL,
  final_defense_date TEXT DEFAULT '',
  adviser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  health_status TEXT NOT NULL DEFAULT 'on_track' CHECK (health_status IN ('on_track', 'at_risk', 'behind')),
  health_source TEXT NOT NULL DEFAULT 'auto' CHECK (health_source IN ('auto', 'manual'))
);

-- ---------------------------------------------------------------------------
-- C. Tasks
-- ---------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  developer TEXT DEFAULT '',
  category TEXT DEFAULT '',
  field TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  qa_status TEXT DEFAULT 'waiting',
  commit TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  completed_at TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  branch_name TEXT DEFAULT '',
  end_user TEXT DEFAULT '',
  module TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  timeline_item_id TEXT
);

-- ---------------------------------------------------------------------------
-- D. Settings (key-value config: admin emails, developers list, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ---------------------------------------------------------------------------
-- E. Invitations
-- ---------------------------------------------------------------------------
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('leader', 'developer', 'viewer')),
  invited_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- F. Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id TEXT,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON public.notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- G. Task Comments
-- ---------------------------------------------------------------------------
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  attachment_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- H. Timeline Items (Gantt)
-- ---------------------------------------------------------------------------
CREATE TABLE public.timeline_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES public.timeline_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('phase', 'epic', 'task', 'milestone')),
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  dependencies JSONB DEFAULT '[]',
  assignee TEXT DEFAULT '',
  effort TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX timeline_items_project_idx ON public.timeline_items (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- I. Group Memberships (per-project role assignment)
-- ---------------------------------------------------------------------------
CREATE TABLE public.group_memberships (
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('leader', 'developer', 'viewer')),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX group_memberships_user_idx ON public.group_memberships (user_id);
CREATE INDEX group_memberships_project_idx ON public.group_memberships (project_id);

-- ---------------------------------------------------------------------------
-- J. Credentials (vault)
-- ---------------------------------------------------------------------------
CREATE TABLE public.credentials (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'other',
  service TEXT NOT NULL,
  username TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT,
  description TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  end_user TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credentials_project_id_idx ON public.credentials(project_id);

-- ---------------------------------------------------------------------------
-- K. Defense Deliverables
-- ---------------------------------------------------------------------------
CREATE TABLE public.defense_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  link_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX defense_deliverables_project_idx ON public.defense_deliverables (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- L. Defense Subtasks
-- ---------------------------------------------------------------------------
CREATE TABLE public.defense_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id UUID NOT NULL REFERENCES public.defense_deliverables(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  assignee TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX defense_subtasks_deliverable_idx ON public.defense_subtasks (deliverable_id, created_at);
CREATE INDEX defense_subtasks_project_idx ON public.defense_subtasks (project_id);

-- ---------------------------------------------------------------------------
-- M. Feedback (adviser/coordinator)
-- ---------------------------------------------------------------------------
CREATE TABLE public.feedback (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX feedback_project_idx ON public.feedback (project_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- N. Activity Log
-- ---------------------------------------------------------------------------
CREATE TABLE public.activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_project_idx ON public.activity_log (project_id, created_at DESC);
CREATE INDEX activity_log_user_idx ON public.activity_log (user_id, created_at DESC);

-- ============================================================================
-- PART 3: FUNCTIONS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Auth helper: is this email in the admin allowlist?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_email(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.settings
    WHERE key = 'admin_emails' AND value ? lower(p_email)
  );
$$;

-- ---------------------------------------------------------------------------
-- Auth trigger: auto-create profile on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_name TEXT;
BEGIN
  new_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    split_part(NEW.email, '@', 1)
  );
  INSERT INTO public.profiles (id, email, name, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    new_name,
    new_name,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN public.is_admin_email(LOWER(NEW.email)) THEN 'admin' ELSE 'developer' END
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = CASE
      WHEN profiles.display_name IS NULL OR profiles.display_name = ''
      THEN EXCLUDED.display_name
      ELSE profiles.display_name
    END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RBAC: is the caller a capstone admin?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_capstone_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- RBAC: get the caller's role in a group
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_role(pid text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.group_memberships
  WHERE user_id = auth.uid() AND project_id = pid;
$$;

-- ---------------------------------------------------------------------------
-- RBAC: can the caller manage this group? (admin or leader)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_group(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_capstone_admin()
      OR COALESCE(public.group_role(pid), '') = 'leader';
$$;

-- ---------------------------------------------------------------------------
-- RBAC: is the caller a member of this group?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.in_group(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.group_role(pid) IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- RBAC: is the caller the assigned adviser of a project?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_project_adviser(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = pid AND adviser_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Revoke public access to helper functions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.is_admin_email(text),
  public.handle_new_user(),
  public.is_capstone_admin(),
  public.group_role(text),
  public.can_manage_group(text),
  public.in_group(text),
  public.is_project_adviser(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.is_admin_email(text),
  public.handle_new_user(),
  public.is_capstone_admin(),
  public.group_role(text),
  public.can_manage_group(text),
  public.in_group(text),
  public.is_project_adviser(text)
TO authenticated, service_role;

-- ============================================================================
-- PART 4: TRIGGERS
-- ============================================================================

-- Only admins can assign/promote/demote the 'leader' role in groups
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
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_role_change ON public.group_memberships;
CREATE TRIGGER trg_membership_role_change
  BEFORE INSERT OR UPDATE ON public.group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_role_change();

-- Profile role protection: only admin-allowlisted emails can hold elevated roles
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
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_role ON public.profiles;
CREATE TRIGGER trg_profile_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role();

-- Developers cannot modify tasks' planning fields (only status fields)
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

-- Auto-recompute deliverable status from subtask progress
CREATE OR REPLACE FUNCTION public.recompute_deliverable_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target_id UUID;
  total_count INT;
  done_count INT;
  new_status TEXT;
BEGIN
  target_id := COALESCE(NEW.deliverable_id, OLD.deliverable_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE defense_subtasks.done)
    INTO total_count, done_count
    FROM public.defense_subtasks
   WHERE deliverable_id = target_id;

  new_status := CASE
    WHEN total_count = 0 OR done_count = 0 THEN 'pending'
    WHEN done_count < total_count THEN 'in_progress'
    ELSE 'submitted'
  END;

  UPDATE public.defense_deliverables
     SET status = new_status
   WHERE id = target_id
     AND status IN ('pending', 'in_progress', 'submitted');

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_deliverable_status ON public.defense_subtasks;
CREATE TRIGGER trg_recompute_deliverable_status
  AFTER INSERT OR UPDATE OF done OR DELETE ON public.defense_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.recompute_deliverable_status();

-- ============================================================================
-- PART 5: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_items TO authenticated;
GRANT ALL ON public.timeline_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_memberships TO authenticated;
GRANT ALL ON public.group_memberships TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credentials TO authenticated;
GRANT ALL ON public.credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defense_deliverables TO authenticated;
GRANT ALL ON public.defense_deliverables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defense_subtasks TO authenticated;
GRANT ALL ON public.defense_subtasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

-- ---------------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------------
CREATE POLICY "projects_read" ON public.projects FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(id) OR public.is_project_adviser(id));
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_capstone_admin());
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_manage_group(id)) WITH CHECK (public.can_manage_group(id));
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated
  USING (public.is_capstone_admin());

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------
CREATE POLICY "tasks_read" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_group(project_id));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id))
  WITH CHECK (public.is_capstone_admin() OR public.in_group(project_id));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING (public.can_manage_group(project_id));

-- ---------------------------------------------------------------------------
-- TIMELINE
-- ---------------------------------------------------------------------------
CREATE POLICY "timeline_read" ON public.timeline_items FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "timeline_write" ON public.timeline_items FOR ALL TO authenticated
  USING (public.can_manage_group(project_id))
  WITH CHECK (public.can_manage_group(project_id));

-- ---------------------------------------------------------------------------
-- TASK COMMENTS
-- ---------------------------------------------------------------------------
CREATE POLICY "comments_read" ON public.task_comments FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group((SELECT project_id FROM public.tasks WHERE id = task_id)));
CREATE POLICY "comments_insert" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.is_capstone_admin() OR public.in_group((SELECT project_id FROM public.tasks WHERE id = task_id))));
CREATE POLICY "comments_update" ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "comments_delete" ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_group((SELECT project_id FROM public.tasks WHERE id = task_id)));

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_capstone_admin() OR public.can_manage_group((SELECT project_id FROM public.tasks WHERE id = task_id)));

-- ---------------------------------------------------------------------------
-- CREDENTIALS
-- ---------------------------------------------------------------------------
CREATE POLICY "credentials_read" ON public.credentials FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR (project_id IS NOT NULL AND COALESCE(public.group_role(project_id), '') <> 'viewer'));
CREATE POLICY "credentials_write" ON public.credentials FOR ALL TO authenticated
  USING (public.is_capstone_admin() OR public.can_manage_group(project_id))
  WITH CHECK (public.is_capstone_admin() OR public.can_manage_group(project_id));

-- ---------------------------------------------------------------------------
-- SETTINGS
-- ---------------------------------------------------------------------------
CREATE POLICY "settings_read" ON public.settings FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR NOT (key IN ('admin_emails')));
CREATE POLICY "settings_write" ON public.settings FOR ALL TO authenticated
  USING (public.is_capstone_admin()) WITH CHECK (public.is_capstone_admin());

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_capstone_admin())
  WITH CHECK (id = auth.uid() OR public.is_capstone_admin());

-- ---------------------------------------------------------------------------
-- INVITATIONS
-- ---------------------------------------------------------------------------
CREATE POLICY "invitations_all" ON public.invitations FOR ALL TO authenticated
  USING (public.is_capstone_admin()) WITH CHECK (public.is_capstone_admin());

-- ---------------------------------------------------------------------------
-- GROUP MEMBERSHIPS
-- ---------------------------------------------------------------------------
CREATE POLICY "memberships_read" ON public.group_memberships FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR user_id = auth.uid() OR public.in_group(project_id));
CREATE POLICY "memberships_write" ON public.group_memberships FOR ALL TO authenticated
  USING (public.can_manage_group(project_id))
  WITH CHECK (public.can_manage_group(project_id));

-- ---------------------------------------------------------------------------
-- DEFENSE DELIVERABLES
-- ---------------------------------------------------------------------------
CREATE POLICY "defense_read" ON public.defense_deliverables FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "defense_insert" ON public.defense_deliverables FOR INSERT TO authenticated
  WITH CHECK (public.is_capstone_admin() OR public.in_group(project_id));
CREATE POLICY "defense_update" ON public.defense_deliverables FOR UPDATE TO authenticated
  USING (public.is_capstone_admin() OR public.can_manage_group(project_id))
  WITH CHECK (public.is_capstone_admin() OR public.can_manage_group(project_id));
CREATE POLICY "defense_delete" ON public.defense_deliverables FOR DELETE TO authenticated
  USING (public.is_capstone_admin() OR public.can_manage_group(project_id));

-- ---------------------------------------------------------------------------
-- DEFENSE SUBTASKS
-- ---------------------------------------------------------------------------
CREATE POLICY "subtasks_read" ON public.defense_subtasks FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "subtasks_write" ON public.defense_subtasks FOR ALL TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id))
  WITH CHECK (public.is_capstone_admin() OR public.in_group(project_id));

-- ---------------------------------------------------------------------------
-- FEEDBACK
-- ---------------------------------------------------------------------------
CREATE POLICY "feedback_read" ON public.feedback FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (public.is_capstone_admin() OR public.is_project_adviser(project_id));
CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "feedback_delete" ON public.feedback FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_capstone_admin());

-- ---------------------------------------------------------------------------
-- ACTIVITY LOG
-- ---------------------------------------------------------------------------
CREATE POLICY "activity_read" ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_capstone_admin() OR public.in_group(project_id) OR public.is_project_adviser(project_id));
CREATE POLICY "activity_insert" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 6: REALTIME
-- ============================================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.projects; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.timeline_items; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.credentials; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.defense_deliverables; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.defense_subtasks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 7: SEED DATA
-- ============================================================================

-- Admin allowlist (matches ADMIN_EMAILS in auth-context.tsx)
INSERT INTO public.settings (key, value) VALUES
  ('admin_emails', '["edomaycos@gmail.com", "abellajoshua18@gmail.com", "allenmartillan715@gmail.com"]')
ON CONFLICT (key) DO NOTHING;
