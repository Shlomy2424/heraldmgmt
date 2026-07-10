
-- 1) Add missing work_orders columns
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS parts_needed text,
  ADD COLUMN IF NOT EXISTS payer_responsibility text CHECK (payer_responsibility IN ('tenant','landlord','management')),
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS admin_estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS follow_up_notes text;

-- 2) Fix work_orders INSERT so any authenticated user with a role and matching created_by can insert;
--    keep admin/manager broader access via existing policies.
DROP POLICY IF EXISTS wo_insert_mgr ON public.work_orders;
CREATE POLICY wo_insert_authenticated ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[])
  );

-- Allow technicians to update work orders they created too
DROP POLICY IF EXISTS wo_update_creator ON public.work_orders;
CREATE POLICY wo_update_creator ON public.work_orders
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status NOT IN ('closed','cancelled'))
  WITH CHECK (created_by = auth.uid() AND status NOT IN ('closed','cancelled'));

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON public.work_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_due_at ON public.work_orders(due_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON public.work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_property ON public.work_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_unit ON public.work_orders(unit_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON public.work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_closed_at ON public.work_orders(closed_at);
CREATE INDEX IF NOT EXISTS idx_schedule_visits_date ON public.schedule_visits(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_schedule_visits_assigned ON public.schedule_visits(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON public.activity_log(user_id);

-- 4) user_sessions for login/logout tracking
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  last_seen_at timestamptz,
  duration_minutes numeric,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_admin_read ON public.user_sessions;
CREATE POLICY user_sessions_admin_read ON public.user_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());

DROP POLICY IF EXISTS user_sessions_own_insert ON public.user_sessions;
CREATE POLICY user_sessions_own_insert ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_sessions_own_update ON public.user_sessions;
CREATE POLICY user_sessions_own_update ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id, login_at DESC);

-- 5) app_settings singleton for admin settings page
CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name text NOT NULL DEFAULT 'Herald Property Management',
  brand_color text,
  email_provider_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT UPDATE, INSERT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.app_settings (id, app_name) VALUES (1, 'Herald Property Management')
ON CONFLICT (id) DO NOTHING;

-- 6) Soft delete columns for properties, units, tenants (deactivate)
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
