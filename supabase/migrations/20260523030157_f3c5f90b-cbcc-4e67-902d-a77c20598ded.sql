-- Fix: pgcrypto vive no schema "extensions" no Supabase atual.
-- Algumas funções da lojinha estavam com search_path = public apenas,
-- então gen_random_bytes() não era encontrado e a criação de pedido
-- falhava com "function gen_random_bytes(integer) does not exist".

ALTER FUNCTION public.lojinha_create_order(text, text, text, text, text, jsonb)
  SET search_path = public, extensions;

ALTER FUNCTION public.lojinha_create_pos_order(jsonb, text, text)
  SET search_path = public, extensions;

ALTER FUNCTION public.lojinha_release_expired_reservations()
  SET search_path = public, extensions;

ALTER FUNCTION public.next_daily_order_number(uuid)
  SET search_path = public, extensions;