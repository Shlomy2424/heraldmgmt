
-- 1) Fix schedule_visits so anyone who can write the work order can create/edit its visit
DROP POLICY IF EXISTS sv_write_mgr ON public.schedule_visits;
CREATE POLICY sv_insert_any ON public.schedule_visits
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_work_order(work_order_id));

DROP POLICY IF EXISTS sv_update_mgr ON public.schedule_visits;
DROP POLICY IF EXISTS sv_update_tech ON public.schedule_visits;
CREATE POLICY sv_update_any ON public.schedule_visits
  FOR UPDATE TO authenticated
  USING (public.can_write_work_order(work_order_id))
  WITH CHECK (public.can_write_work_order(work_order_id));

-- 2) Include creator in work-order access + write checks so techs who create a WO can see/edit it
CREATE OR REPLACE FUNCTION public.can_access_work_order(_wo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = _wo
      AND (
        public.has_any_role(auth.uid(), ARRAY['admin','manager','viewer']::public.app_role[])
        OR wo.created_by = auth.uid()
        OR (public.has_role(auth.uid(), 'technician') AND wo.assigned_to = auth.uid())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_work_order(_wo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = _wo
      AND (
        public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
        OR (wo.created_by = auth.uid() AND wo.status NOT IN ('closed','cancelled'))
        OR (public.has_role(auth.uid(), 'technician')
            AND wo.assigned_to = auth.uid()
            AND wo.status NOT IN ('closed','cancelled'))
      )
  );
$$;

-- 3) Require actual_hours when a technician closes a work order
CREATE OR REPLACE FUNCTION public.enforce_close_requirements()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    IF NEW.actual_hours IS NULL OR NEW.actual_hours <= 0 THEN
      RAISE EXCEPTION 'Actual time (hours) is required to close a work order.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_wo_enforce_close ON public.work_orders;
CREATE TRIGGER trg_wo_enforce_close
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_close_requirements();
