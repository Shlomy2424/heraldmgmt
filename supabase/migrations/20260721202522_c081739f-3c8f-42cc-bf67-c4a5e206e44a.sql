
-- 1) Broaden read access on work_orders and schedule_visits so every signed-in
--    user can see all records on the main list and the Schedule page. Per-row
--    write permissions (can_write_work_order) are unchanged.
DROP POLICY IF EXISTS wo_read ON public.work_orders;
CREATE POLICY wo_read ON public.work_orders
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS sv_read ON public.schedule_visits;
CREATE POLICY sv_read ON public.schedule_visits
  FOR SELECT
  TO authenticated
  USING (true);

-- 2) Follow-up history: track every change to the follow-up fields on a
--    work order so the detail page can show a click-to-expand history.
CREATE TABLE IF NOT EXISTS public.follow_up_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  follow_up public.follow_up_status NOT NULL,
  follow_up_date DATE,
  follow_up_notes TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.follow_up_events TO authenticated;
GRANT ALL ON public.follow_up_events TO service_role;

ALTER TABLE public.follow_up_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fue_read ON public.follow_up_events;
CREATE POLICY fue_read ON public.follow_up_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS follow_up_events_wo_idx
  ON public.follow_up_events(work_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_follow_up_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.follow_up IS DISTINCT FROM 'no'::public.follow_up_status
       OR NEW.follow_up_date IS NOT NULL
       OR NEW.follow_up_notes IS NOT NULL THEN
      INSERT INTO public.follow_up_events(work_order_id, follow_up, follow_up_date, follow_up_notes, changed_by)
      VALUES (NEW.id, NEW.follow_up, NEW.follow_up_date, NEW.follow_up_notes, COALESCE(auth.uid(), NEW.created_by));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.follow_up IS DISTINCT FROM OLD.follow_up
     OR NEW.follow_up_date IS DISTINCT FROM OLD.follow_up_date
     OR NEW.follow_up_notes IS DISTINCT FROM OLD.follow_up_notes THEN
    INSERT INTO public.follow_up_events(work_order_id, follow_up, follow_up_date, follow_up_notes, changed_by)
    VALUES (NEW.id, NEW.follow_up, NEW.follow_up_date, NEW.follow_up_notes, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_follow_up_change ON public.work_orders;
CREATE TRIGGER trg_log_follow_up_change
  AFTER INSERT OR UPDATE OF follow_up, follow_up_date, follow_up_notes
  ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_follow_up_change();
