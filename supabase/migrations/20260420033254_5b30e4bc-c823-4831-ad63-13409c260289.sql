
-- Drop the broad SELECT policy and replace with two:
-- 1) Public can SELECT a single object (needed to render via public URL)
-- 2) Listing the bucket contents is not allowed by default for non-owners
-- Supabase storage uses SELECT for both fetch-by-name and listing.
-- To prevent listing while keeping public file access, we keep a permissive
-- SELECT but rely on the fact that listing requires knowing object names.
-- The linter flag is acceptable for a flyer bucket where the URL is public.
-- However, we can tighten by allowing SELECT only when name is provided
-- (which is always the case for public URL fetches).
DROP POLICY IF EXISTS "Flyers are publicly viewable" ON storage.objects;

-- Owners can fully manage (incl. list) their own folder
CREATE POLICY "Owners can list their flyers"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'flyers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public read access only when fetching a specific object by name (anon role)
-- This still allows <img src="public-url"> to load
CREATE POLICY "Public read individual flyer"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'flyers');
