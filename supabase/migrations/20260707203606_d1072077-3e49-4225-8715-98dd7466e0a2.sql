-- Restrict broad work order and schedule read policies
DROP POLICY IF EXISTS wo_read ON public.work_orders;
CREATE POLICY wo_read ON public.work_orders
FOR SELECT TO authenticated
USING (public.can_access_work_order(id));

DROP POLICY IF EXISTS sv_read ON public.schedule_visits;
CREATE POLICY sv_read ON public.schedule_visits
FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
  OR (
    public.has_role(auth.uid(), 'technician')
    AND EXISTS (
      SELECT 1
      FROM public.work_orders wo
      WHERE wo.id = schedule_visits.work_order_id
        AND wo.assigned_to = auth.uid()
    )
  )
);

-- Make invite lookup return enough accepted-state detail for a clear public accept page
DROP FUNCTION IF EXISTS public.get_invite_by_token(text);
CREATE FUNCTION public.get_invite_by_token(_token text)
RETURNS TABLE(
  id uuid,
  email text,
  name text,
  role app_role,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  accepted_by uuid,
  accepted_by_name text,
  revoked_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ai.id,
    ai.email,
    ai.name,
    ai.role,
    ai.expires_at,
    ai.accepted_at,
    ai.accepted_by,
    p.name AS accepted_by_name,
    ai.revoked_at
  FROM public.account_invites ai
  LEFT JOIN public.profiles p ON p.id = ai.accepted_by
  WHERE ai.token = _token
  LIMIT 1;
$$;

-- Admin-only user lifecycle helpers
CREATE OR REPLACE FUNCTION public.admin_set_user_active(_target_user uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  UPDATE public.profiles
  SET active = _active, updated_at = now()
  WHERE id = _target_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  INSERT INTO public.activity_log(user_id, action, table_name, record_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN _active THEN 'user_reactivated' ELSE 'user_deactivated' END,
    'profiles',
    _target_user,
    jsonb_build_object('target_user', _target_user, 'active', _active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_active()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT active FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- Log invite acceptance when trigger creates the auth-backed account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
  invite_row public.account_invites%ROWTYPE;
  invite_token TEXT;
  assigned_role public.app_role;
BEGIN
  invite_token := NEW.raw_user_meta_data->>'invite_token';

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

  INSERT INTO public.profiles (id, name, email, active)
  VALUES (
    NEW.id,
    COALESCE(invite_row.name, NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    true
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    active = true,
    updated_at = now();

  IF invite_row.id IS NOT NULL THEN
    assigned_role := invite_row.role;
    UPDATE public.account_invites
      SET accepted_at = now(), accepted_by = NEW.id
      WHERE id = invite_row.id
        AND accepted_at IS NULL;

    INSERT INTO public.activity_log(user_id, action, table_name, record_id, details)
    VALUES (
      NEW.id,
      'invite_accepted',
      'account_invites',
      invite_row.id,
      jsonb_build_object('email', NEW.email, 'role', assigned_role)
    );
  ELSE
    assigned_role := 'admin'::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, assigned_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_active() TO authenticated;