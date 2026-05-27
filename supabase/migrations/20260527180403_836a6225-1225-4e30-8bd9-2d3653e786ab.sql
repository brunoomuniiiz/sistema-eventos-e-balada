
-- 1. Remove anon-readable pix_charges policy. All public reads go through server functions using supabaseAdmin.
DROP POLICY IF EXISTS "pix_charges public read by id" ON public.pix_charges;

-- 2. Remove public-by-slug lojinha_settings policy. Storefront uses lojinha_get_storefront RPC.
DROP POLICY IF EXISTS "lojinha_settings public by slug" ON public.lojinha_settings;

-- 3. Tighten storage policies for bar-assets and product-photos buckets.
-- Require the first folder segment to match the staff's owner id (so vendors can upload for their own bar only).
DROP POLICY IF EXISTS "bar-assets auth write" ON storage.objects;
DROP POLICY IF EXISTS "bar-assets auth update" ON storage.objects;
DROP POLICY IF EXISTS "bar-assets auth delete" ON storage.objects;
DROP POLICY IF EXISTS "product-photos auth write" ON storage.objects;
DROP POLICY IF EXISTS "product-photos auth update" ON storage.objects;
DROP POLICY IF EXISTS "product-photos auth delete" ON storage.objects;

CREATE POLICY "bar-assets owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bar-assets'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );
CREATE POLICY "bar-assets owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bar-assets'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );
CREATE POLICY "bar-assets owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bar-assets'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );

CREATE POLICY "product-photos owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );
CREATE POLICY "product-photos owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );
CREATE POLICY "product-photos owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );

-- 4. Add a default-deny RLS policy on realtime.messages so authenticated users
-- cannot blindly subscribe to other bars' channels. Owner-scoping per topic is
-- not currently wired, so this denies all client subscriptions; service_role
-- (server) bypasses RLS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "deny realtime by default" ON realtime.messages';
    EXECUTE 'CREATE POLICY "deny realtime by default" ON realtime.messages FOR SELECT TO authenticated USING (false)';
  END IF;
END $$;
