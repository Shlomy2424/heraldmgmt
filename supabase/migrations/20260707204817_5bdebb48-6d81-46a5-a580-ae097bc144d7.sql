DROP POLICY IF EXISTS activity_insert ON public.activity_log;
CREATE POLICY activity_insert ON public.activity_log
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());