-- Per-project credentials: link each credential to a project and an end user
ALTER TABLE public.credentials ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.credentials ADD COLUMN IF NOT EXISTS end_user TEXT;

CREATE INDEX IF NOT EXISTS credentials_project_id_idx ON public.credentials(project_id);
