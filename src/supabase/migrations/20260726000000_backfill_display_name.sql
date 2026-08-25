-- Backfill display_name for existing profiles where it's blank or looks like an email prefix
-- Priority: raw_user_meta_data display_name > full_name > email prefix

UPDATE public.profiles p
SET display_name = COALESCE(
  NULLIF(u.raw_user_meta_data->>'display_name', ''),
  NULLIF(u.raw_user_meta_data->>'full_name', ''),
  split_part(u.email, '@', 1)
)
FROM auth.users u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR p.display_name = '');

-- Also ensure the handle_new_user trigger sets display_name properly
-- (in case the trigger was created before display_name column existed)

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
  -- profiles.email is NOT NULL in this project's schema, and role follows the
  -- admin allowlist (is_admin_email is created by the RBAC migration).
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

-- Attach the signup trigger (this project's DB never had it — the old
-- startup migration that created it was never applied here)
DO $$
BEGIN
  CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
