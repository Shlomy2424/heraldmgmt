
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_insert_mgr ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, name, active, created_at, updated_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS TABLE(id uuid, name text, email text, phone text, active boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, email, phone, active, created_at
  FROM public.profiles
  WHERE public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
  ORDER BY name NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(id uuid, name text, email text, phone text, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, email, phone, active FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

DROP POLICY IF EXISTS tenants_read ON public.tenants;
CREATE POLICY tenants_read_mgr ON public.tenants
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

CREATE POLICY tenants_read_tech_assigned ON public.tenants
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'technician'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.tenant_id = tenants.id
        AND wo.assigned_to = auth.uid()
        AND wo.status NOT IN ('closed','cancelled')
    )
  );
