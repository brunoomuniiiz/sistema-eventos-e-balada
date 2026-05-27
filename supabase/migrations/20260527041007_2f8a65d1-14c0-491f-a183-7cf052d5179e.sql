REVOKE EXECUTE ON FUNCTION public.close_expired_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_events() TO service_role, postgres;