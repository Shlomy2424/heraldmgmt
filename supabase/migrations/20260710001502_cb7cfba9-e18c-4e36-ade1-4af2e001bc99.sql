
-- Tighten status_history read access to only users who can access the work order
DROP POLICY IF EXISTS sh_read ON public.status_history;
CREATE POLICY sh_read ON public.status_history
  FOR SELECT TO authenticated
  USING (public.can_access_work_order(work_order_id));

-- Tighten storage insert policy: verify uploader can write the target work order
DROP POLICY IF EXISTS wo_photos_insert ON storage.objects;
CREATE POLICY wo_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'work-order-photos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[])
    AND public.can_write_work_order((split_part(name, '/', 1))::uuid)
  );

-- Lock down SECURITY DEFINER function EXECUTE privileges.
-- Revoke from PUBLIC (and anon where not required), keep grants only where needed.
REVOKE ALL ON FUNCTION public.current_user_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_user_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid, boolean) FROM PUBLIC, anon;

-- Trigger-only functions: no client-callable EXECUTE needed
REVOKE ALL ON FUNCTION public.notify_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_activity_generic() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- get_invite_by_token intentionally callable by anon (invite acceptance flow before sign-in)
REVOKE ALL ON FUNCTION public.get_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;
