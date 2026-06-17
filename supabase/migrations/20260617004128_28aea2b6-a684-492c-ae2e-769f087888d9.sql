
CREATE POLICY "wo_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'work-order-photos');
CREATE POLICY "wo_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'work-order-photos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[])
  );
CREATE POLICY "wo_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'work-order-photos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
  );
