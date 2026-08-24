-- Migration: Team Members, Member Projects, Hackathon Tracker
-- Fully idempotent — safe to re-run. No existing data is modified or deleted.

-- 0. Ensure prerequisite tables exist (user_roles + app_role enum)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('ba', 'pm', 'developer', 'qa', 'client');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DO $$ BEGIN
  ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- has_role function (safe to recreate)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 1. Extend profiles table with new columns (safe: IF NOT EXISTS)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS team TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS role_title TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS links JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill display_name from legacy 'name' column if it exists
DO $$ BEGIN
  UPDATE public.profiles SET display_name = name WHERE display_name = '' AND name IS NOT NULL AND name != '';
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- 2. Link types enum
DO $$ BEGIN
  CREATE TYPE public.project_link_type AS ENUM (
    'live_demo', 'github', 'figma', 'play_store', 'case_study', 'website'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Member projects table
CREATE TABLE IF NOT EXISTS public.member_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_description TEXT DEFAULT '',
  project_type TEXT DEFAULT 'personal',
  role TEXT DEFAULT '',
  technologies TEXT[] DEFAULT '{}',
  image_url TEXT DEFAULT '',
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_projects TO authenticated;
GRANT ALL ON public.member_projects TO service_role;

DO $$ BEGIN
  ALTER TABLE public.member_projects ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Projects readable by authenticated" ON public.member_projects FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own projects" ON public.member_projects FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Project links table
CREATE TABLE IF NOT EXISTS public.project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.member_projects(id) ON DELETE CASCADE,
  link_type public.project_link_type NOT NULL,
  url TEXT NOT NULL,
  UNIQUE(project_id, link_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_links TO authenticated;
GRANT ALL ON public.project_links TO service_role;

DO $$ BEGIN
  ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Project links readable by authenticated" ON public.project_links FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage links for own projects" ON public.project_links FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.member_projects WHERE id = project_id AND owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.member_projects WHERE id = project_id AND owner_id = auth.uid()));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Project members junction table
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID NOT NULL REFERENCES public.member_projects(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, member_id)
);

GRANT SELECT, INSERT, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;

DO $$ BEGIN
  ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Project members readable by authenticated" ON public.project_members FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage members for own projects" ON public.project_members FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.member_projects WHERE id = project_id AND owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.member_projects WHERE id = project_id AND owner_id = auth.uid()));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. Hackathons table
CREATE TABLE IF NOT EXISTS public.hackathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  theme TEXT DEFAULT '',
  category TEXT DEFAULT 'hackathon',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT '',
  registration_url TEXT DEFAULT '',
  announcement_url TEXT DEFAULT '',
  status TEXT DEFAULT 'upcoming',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hackathons TO authenticated;
GRANT ALL ON public.hackathons TO service_role;

DO $$ BEGIN
  ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Hackathons readable by authenticated" ON public.hackathons FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage hackathons" ON public.hackathons FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'pm'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'pm'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 7. Hackathon projects junction table
CREATE TABLE IF NOT EXISTS public.hackathon_projects (
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.member_projects(id) ON DELETE CASCADE,
  PRIMARY KEY (hackathon_id, project_id)
);

GRANT SELECT, INSERT, DELETE ON public.hackathon_projects TO authenticated;
GRANT ALL ON public.hackathon_projects TO service_role;

DO $$ BEGIN
  ALTER TABLE public.hackathon_projects ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Hackathon projects readable by authenticated" ON public.hackathon_projects FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage hackathon projects" ON public.hackathon_projects FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'pm'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'pm'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 8. Event registrations (per-user registration tracking)
CREATE TABLE IF NOT EXISTS public.event_registrations (
  event_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.event_registrations TO authenticated;
GRANT ALL ON public.event_registrations TO service_role;

DO $$ BEGIN
  ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users read own registrations" ON public.event_registrations FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own registrations" ON public.event_registrations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 9. Auto-add owner as project_member on project creation
CREATE OR REPLACE FUNCTION public.handle_new_member_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, member_id)
  VALUES (NEW.id, NEW.owner_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER on_member_project_created
  AFTER INSERT ON public.member_projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_member_project();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
