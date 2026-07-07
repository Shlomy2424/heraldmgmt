-- Scope warning-level table policies
DROP POLICY IF EXISTS ib_read ON public.import_batches;
CREATE POLICY ib_read ON public.import_batches
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS properties_read ON public.properties;
CREATE POLICY properties_read ON public.properties
FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager','viewer']::public.app_role[])
  OR (
    public.has_role(auth.uid(), 'technician')
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.property_id = properties.id
        AND wo.assigned_to = auth.uid()
        AND wo.status NOT IN ('closed','cancelled')
    )
  )
);

DROP POLICY IF EXISTS units_read ON public.units;
CREATE POLICY units_read ON public.units
FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager','viewer']::public.app_role[])
  OR (
    public.has_role(auth.uid(), 'technician')
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.unit_id = units.id
        AND wo.assigned_to = auth.uid()
        AND wo.status NOT IN ('closed','cancelled')
    )
  )
);

DROP POLICY IF EXISTS wo_update_tech_assigned ON public.work_orders;
CREATE POLICY wo_update_tech_assigned ON public.work_orders
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'technician')
  AND assigned_to = auth.uid()
  AND status NOT IN ('closed','cancelled')
)
WITH CHECK (
  public.has_role(auth.uid(), 'technician')
  AND assigned_to = auth.uid()
  AND status NOT IN ('closed','cancelled')
);

-- Ensure helper has a stable search path
CREATE OR REPLACE FUNCTION public.set_job_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'WO-' || LPAD(nextval('public.work_order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- Tighten function execution privileges. PUBLIC means both anonymous and signed-in users by default.
REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_user_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_activity_generic() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_job_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_work_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_work_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_activity_generic() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_assignment() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_job_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;