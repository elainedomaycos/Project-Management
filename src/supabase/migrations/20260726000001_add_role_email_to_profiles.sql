-- Ensure profiles has the columns the app needs for RBAC

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';

-- Backfill existing rows (ADD COLUMN DEFAULT doesn't update existing rows)
UPDATE public.profiles p
SET role = 'developer'
WHERE p.role IS NULL;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');
