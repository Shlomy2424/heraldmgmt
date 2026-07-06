
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first boolean;
  invite_row public.account_invites%ROWTYPE;
  invite_token TEXT;
  assigned_role public.app_role;
BEGIN
  invite_token := NEW.raw_user_meta_data->>'invite_token';

  -- Try token first, then fall back to email match (for Google OAuth pre-invited by email)
  IF invite_token IS NOT NULL THEN
    SELECT * INTO invite_row FROM public.account_invites
      WHERE token = invite_token
        AND accepted_at IS NULL AND revoked_at IS NULL
        AND expires_at > now()
        AND lower(email) = lower(NEW.email)
      LIMIT 1;
  END IF;

  IF invite_row.id IS NULL THEN
    SELECT * INTO invite_row FROM public.account_invites
      WHERE lower(email) = lower(NEW.email)
        AND accepted_at IS NULL AND revoked_at IS NULL
        AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;

  IF invite_row.id IS NULL AND NOT is_first THEN
    RAISE EXCEPTION 'Sign-ups are invite-only. Ask an administrator for an invite link.';
  END IF;

  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(invite_row.name, NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  ) ON CONFLICT (id) DO NOTHING;

  IF invite_row.id IS NOT NULL THEN
    assigned_role := invite_row.role;
    UPDATE public.account_invites
      SET accepted_at = now(), accepted_by = NEW.id
      WHERE id = invite_row.id;
  ELSE
    assigned_role := 'admin'::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, assigned_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;
