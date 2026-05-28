-- Restringe leitura do hash do PIN do dono — apenas service_role pode ler diretamente.
-- Funções SECURITY DEFINER continuam funcionando (rodam como dono da função).
REVOKE SELECT (owner_pin_hash) ON public.bar_settings FROM authenticated;
REVOKE SELECT (owner_pin_hash) ON public.bar_settings FROM anon;