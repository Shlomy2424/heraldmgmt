
-- Phase 1: Security foundation, invites, activity log, RLS fixes

-- 1. photos.storage_path (nullable, backfill nothing)
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.photos ALTER COLUMN file_url DROP NOT NULL;

-- 2. Helper functions for work order access
CREATE OR REPLACE FUNCTION public.can_access_work_order(_wo UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = _wo
      AND (
        public.has_any_role(auth.uid(), ARRAY['admin','manager','viewer']::public.app_role[])
        OR (public.has_role(auth.uid(), 'technician') AND wo.assigned_to = auth.uid())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_work_order(_wo UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = _wo
      AND (
        public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
        OR (public.has_role(auth.uid(), 'technician')
            AND wo.assigned_to = auth.uid()
            AND wo.status NOT IN ('closed','cancelled'))
      )
  );
$$;

-- 3. Rewrite job_notes policies
DROP POLICY IF EXISTS notes_read ON public.job_notes;
DROP POLICY IF EXISTS notes_insert_signed ON public.job_notes;
DROP POLICY IF EXISTS notes_update_owner_or_mgr ON public.job_notes;
DROP POLICY IF EXISTS notes_delete_mgr ON public.job_notes;

CREATE POLICY notes_read ON public.job_notes FOR SELECT TO authenticated
  USING (public.can_access_work_order(work_order_id));
CREATE POLICY notes_insert ON public.job_notes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_write_work_order(work_order_id));
CREATE POLICY notes_update ON public.job_notes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY notes_delete ON public.job_notes FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- 4. Rewrite photos policies
DROP POLICY IF EXISTS photos_read ON public.photos;
DROP POLICY IF EXISTS photos_insert ON public.photos;
DROP POLICY IF EXISTS photos_delete_mgr ON public.photos;
DROP POLICY IF EXISTS photos_insert_signed ON public.photos;

CREATE POLICY photos_read ON public.photos FOR SELECT TO authenticated
  USING (public.can_access_work_order(work_order_id));
CREATE POLICY photos_insert ON public.photos FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.can_write_work_order(work_order_id));
CREATE POLICY photos_delete ON public.photos FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- 5. Rewrite time_entries policies (technician_id column assumed)
DROP POLICY IF EXISTS te_read ON public.time_entries;
DROP POLICY IF EXISTS te_insert ON public.time_entries;
DROP POLICY IF EXISTS te_update_owner_or_mgr ON public.time_entries;
DROP POLICY IF EXISTS te_delete_mgr ON public.time_entries;
DROP POLICY IF EXISTS te_insert_signed ON public.time_entries;

CREATE POLICY te_read ON public.time_entries FOR SELECT TO authenticated
  USING (public.can_access_work_order(work_order_id));
CREATE POLICY te_insert ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (technician_id = auth.uid() AND public.can_write_work_order(work_order_id));
CREATE POLICY te_update ON public.time_entries FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (technician_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY te_delete ON public.time_entries FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- 6. Tighten tenant read: technicians only see tenants tied to their assigned WOs
DROP POLICY IF EXISTS tenants_read ON public.tenants;
CREATE POLICY tenants_read ON public.tenants FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','viewer']::public.app_role[])
    OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.tenant_id = tenants.id
        AND wo.assigned_to = auth.uid()
        AND wo.status NOT IN ('closed','cancelled')
    )
  );

-- 7. account_invites
CREATE TABLE IF NOT EXISTS public.account_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role public.app_role NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_invites TO authenticated;
GRANT ALL ON public.account_invites TO service_role;
ALTER TABLE public.account_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_invites_admin_all ON public.account_invites;
CREATE POLICY account_invites_admin_all ON public.account_invites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_invites_email ON public.account_invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.account_invites(token);

-- Lookup an invite by token WITHOUT exposing the whole table (called by accept-invite edge fn as service role, or via RPC)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token TEXT)
RETURNS TABLE(id UUID, email TEXT, name TEXT, role public.app_role, expires_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, email, name, role, expires_at, accepted_at, revoked_at
  FROM public.account_invites WHERE token = _token LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO anon, authenticated;

-- 8. activity_log
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_admin_select ON public.activity_log;
CREATE POLICY activity_admin_select ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS activity_insert ON public.activity_log;
CREATE POLICY activity_insert ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_wo ON public.activity_log(work_order_id);

CREATE OR REPLACE FUNCTION public.log_activity_generic()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec_id UUID;
  wo_id UUID;
  act TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    rec_id := NEW.id; act := lower(TG_TABLE_NAME) || '_created';
  ELSIF TG_OP = 'UPDATE' THEN
    rec_id := NEW.id; act := lower(TG_TABLE_NAME) || '_updated';
    IF TG_TABLE_NAME = 'work_orders' AND NEW.status IS DISTINCT FROM OLD.status THEN
      act := 'work_order_status_' || NEW.status::text;
    END IF;
  ELSE
    rec_id := OLD.id; act := lower(TG_TABLE_NAME) || '_deleted';
  END IF;

  IF TG_TABLE_NAME = 'work_orders' THEN
    wo_id := rec_id;
  ELSIF TG_TABLE_NAME IN ('job_notes','photos','schedule_visits','time_entries') THEN
    wo_id := COALESCE(NEW.work_order_id, OLD.work_order_id);
  ELSE
    wo_id := NULL;
  END IF;

  INSERT INTO public.activity_log(user_id, action, table_name, record_id, work_order_id, details)
  VALUES (auth.uid(), act, TG_TABLE_NAME, rec_id, wo_id,
    CASE WHEN TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'work_orders'
      THEN jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
      ELSE jsonb_build_object('op', TG_OP) END);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

DROP TRIGGER IF EXISTS activity_work_orders ON public.work_orders;
CREATE TRIGGER activity_work_orders AFTER INSERT OR UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_generic();

DROP TRIGGER IF EXISTS activity_job_notes ON public.job_notes;
CREATE TRIGGER activity_job_notes AFTER INSERT OR DELETE ON public.job_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_generic();

DROP TRIGGER IF EXISTS activity_photos ON public.photos;
CREATE TRIGGER activity_photos AFTER INSERT OR DELETE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_generic();

DROP TRIGGER IF EXISTS activity_properties ON public.properties;
CREATE TRIGGER activity_properties AFTER INSERT OR UPDATE OR DELETE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_generic();

DROP TRIGGER IF EXISTS activity_units ON public.units;
CREATE TRIGGER activity_units AFTER INSERT OR UPDATE OR DELETE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_generic();

DROP TRIGGER IF EXISTS activity_tenants ON public.tenants;
CREATE TRIGGER activity_tenants AFTER INSERT OR UPDATE OR DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_generic();

-- 9. Storage policies for work-order-photos bucket
DROP POLICY IF EXISTS "wo_photos_read" ON storage.objects;
DROP POLICY IF EXISTS "wo_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "wo_photos_delete" ON storage.objects;

CREATE POLICY "wo_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'work-order-photos');
CREATE POLICY "wo_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'work-order-photos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[]));
CREATE POLICY "wo_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'work-order-photos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- 10. Update handle_new_user to consume invite when signing up via invite link
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
    assigned_role := CASE WHEN is_first THEN 'admin'::app_role ELSE 'viewer'::app_role END;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, assigned_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;
