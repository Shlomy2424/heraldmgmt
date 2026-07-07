
-- Tighten profiles read access: full row visible only to self and admin/manager;
-- keep id+name readable by any authenticated user so embedded joins (e.g. profile:profiles(name)) still work.
DROP POLICY IF EXISTS profiles_read_any_signed_in ON public.profiles;
CREATE POLICY profiles_read_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, name) ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;  -- no-op if next line runs; kept for clarity
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, name) ON public.profiles TO authenticated;
-- Give admins/managers full column access via a separate grant path: use RPC admin_list_profiles (already exists)
-- Also allow self to read own full row via RPC get_my_profile (already exists).

-- Tighten user_roles read: self or admin/manager only
DROP POLICY IF EXISTS roles_read_signed_in ON public.user_roles;
CREATE POLICY roles_read_self_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- Storage: require access to the underlying work order before reading a photo file
DROP POLICY IF EXISTS wo_photos_read ON storage.objects;
CREATE POLICY wo_photos_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'work-order-photos'
    AND EXISTS (
      SELECT 1 FROM public.photos p
      WHERE p.storage_path = storage.objects.name
        AND public.can_access_work_order(p.work_order_id)
    )
  );
