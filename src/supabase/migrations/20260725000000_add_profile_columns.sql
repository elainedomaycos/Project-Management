-- Profile columns used by the app (display_name, bio, role_title, etc).
-- Trimmed from the original startup "add_team_and_projects" migration —
-- everything else in it (member_projects, hackathons, user_roles) was
-- startup-only and is intentionally NOT part of this project.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS team TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS role_title TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS links JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill display_name from legacy 'name' column
UPDATE public.profiles SET display_name = name WHERE (display_name = '' OR display_name IS NULL) AND name IS NOT NULL AND name != '';
