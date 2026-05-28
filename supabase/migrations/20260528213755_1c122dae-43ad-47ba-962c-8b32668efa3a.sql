ALTER TABLE public.promoters ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Garantir permissões para funções públicas de landing e listas
GRANT EXECUTE ON FUNCTION public.get_event_landing(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_list_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lojinha_get_storefront(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lojinha_operation_window(text) TO anon, authenticated;
