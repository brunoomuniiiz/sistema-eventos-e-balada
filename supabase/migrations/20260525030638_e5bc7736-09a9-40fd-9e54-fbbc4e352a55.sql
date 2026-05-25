
-- 1) Unificação de visibilidade de venda
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS disponivel_venda boolean NOT NULL DEFAULT true;

UPDATE public.products
SET disponivel_venda = (COALESCE(visivel_pdv_caixa,false) OR COALESCE(visivel_mobile_garcom,false) OR COALESCE(sell_online,false));

-- 2) Estorno de venda PDV/Garçom (parcial ou total) via PIN
CREATE OR REPLACE FUNCTION public.refund_pdv_sale(
  _sale_id uuid,
  _amount numeric,
  _reason text,
  _grant_token text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _sale public.sales%ROWTYPE;
  _grant public.auth_grants%ROWTYPE;
  _refund_amt numeric;
  _name text;
  _refund_sale_id uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO _grant FROM public.auth_grants
   WHERE token = _grant_token AND user_id = _owner
     AND scope IN ('operation','refund') AND used = false AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Autorização inválida ou expirada';
  END IF;

  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id AND user_id = _owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF _sale.category = 'entrada' THEN RAISE EXCEPTION 'Use o estorno da portaria para entradas'; END IF;
  IF _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Venda já estornada'; END IF;
  IF _sale.total <= 0 THEN RAISE EXCEPTION 'Venda sem valor a estornar'; END IF;

  _refund_amt := COALESCE(_amount, _sale.total);
  IF _refund_amt <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF _refund_amt > _sale.total + 0.01 THEN RAISE EXCEPTION 'Valor maior que a venda'; END IF;

  SELECT COALESCE(display_name, email) INTO _name FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  IF abs(_refund_amt - _sale.total) < 0.01 THEN
    -- Estorno total: marca como cancelled (estoque continua baixado conforme a operação real do bar)
    UPDATE public.sales
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = auth.uid(),
          cancelled_by_name = _name,
          cancelled_reason = COALESCE(_reason, 'Estorno total')
     WHERE id = _sale_id;
  ELSE
    -- Estorno parcial: cria venda negativa vinculada à sessão original
    INSERT INTO public.sales (user_id, total, payment_method, category, session_id,
                              employee_id, employee_name, event_id, notes, status, location_id)
    VALUES (_owner, -_refund_amt, _sale.payment_method, _sale.category, _sale.session_id,
            auth.uid(), _name, _sale.event_id,
            'Estorno parcial: ' || COALESCE(_reason,''),
            'completed', _sale.location_id)
    RETURNING id INTO _refund_sale_id;

    INSERT INTO public.sale_payments(user_id, sale_id, amount, method)
    VALUES (_owner, _refund_sale_id, -_refund_amt, _sale.payment_method);
  END IF;

  UPDATE public.auth_grants SET used = true WHERE id = _grant.id;
END $$;
