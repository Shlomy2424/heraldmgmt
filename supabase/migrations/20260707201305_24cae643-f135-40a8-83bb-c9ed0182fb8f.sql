DROP POLICY IF EXISTS wo_update_tech_assigned ON public.work_orders;
CREATE POLICY wo_update_tech_assigned ON public.work_orders
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'technician'::app_role)
    AND assigned_to = auth.uid()
    AND status NOT IN ('closed'::job_status, 'cancelled'::job_status)
  )
  WITH CHECK (
    has_role(auth.uid(), 'technician'::app_role)
    AND assigned_to = auth.uid()
    AND status NOT IN ('closed'::job_status, 'cancelled'::job_status)
  );