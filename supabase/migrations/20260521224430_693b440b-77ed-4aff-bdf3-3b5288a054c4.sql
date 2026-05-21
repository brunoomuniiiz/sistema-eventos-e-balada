
CREATE OR REPLACE FUNCTION public.lojinha_mark_order_delivered(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_status text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT user_id, status INTO v_owner, v_status
  FROM public.lojinha_orders WHERE id = _order_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT public.has_permission(v_caller, v_owner, 'lojinha') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_status NOT IN ('paid', 'delivered') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_paid');
  END IF;

  UPDATE public.lojinha_order_units
  SET status = 'delivered',
      delivered_at = COALESCE(delivered_at, now()),
      delivered_by = COALESCE(delivered_by, v_caller)
  WHERE order_id = _order_id AND status <> 'delivered';

  UPDATE public.lojinha_orders
  SET status = 'delivered',
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_mark_order_delivered(uuid) TO authenticated;
