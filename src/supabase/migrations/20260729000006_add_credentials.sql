-- Shared credentials vault (API keys, logins, database URLs) synced live across users
CREATE TABLE IF NOT EXISTS public.credentials (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'other',
  service TEXT NOT NULL,
  username TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credentials TO authenticated;
GRANT ALL ON public.credentials TO service_role;

DO $$ BEGIN
  ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "All users read credentials" ON public.credentials
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "All users manage credentials" ON public.credentials
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
-- Realtime so adds/removes appear instantly for everyone
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.credentials;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- NOTE: seed rows from the startup project were removed — they pointed at the
-- old Supabase instance and contained placeholder keys. Add real entries via
-- the Credentials page in-app.

