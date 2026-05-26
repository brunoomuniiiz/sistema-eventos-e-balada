REVOKE EXECUTE ON FUNCTION public.apply_role_preset(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_role_preset(uuid, text) TO authenticated;