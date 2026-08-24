-- Make event deliverables shared per event instead of per user.
-- Edits by one user should be visible to all users.

-- 1. Drop RLS policies that depend on user_id BEFORE dropping the column
DROP POLICY IF EXISTS "Users read own deliverables" ON public.event_deliverables;
DROP POLICY IF EXISTS "Users manage own deliverables" ON public.event_deliverables;

-- 2. Dedupe: keep the newest row per event (from the per-user era)
DELETE FROM public.event_deliverables ed
WHERE ed.ctid NOT IN (
  SELECT DISTINCT ON (event_id) ctid
  FROM public.event_deliverables
  ORDER BY event_id, updated_at DESC
);

-- 3. Drop the per-user primary key and column (FK to auth.users drops with column)
ALTER TABLE public.event_deliverables DROP CONSTRAINT IF EXISTS event_deliverables_pkey;
ALTER TABLE public.event_deliverables DROP COLUMN IF EXISTS user_id;

-- 4. Key by event alone
ALTER TABLE public.event_deliverables ADD PRIMARY KEY (event_id);

-- 5. All authenticated users read/manage shared deliverables
DO $$ BEGIN
  CREATE POLICY "All users read deliverables" ON public.event_deliverables
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "All users manage deliverables" ON public.event_deliverables
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_deliverables;
