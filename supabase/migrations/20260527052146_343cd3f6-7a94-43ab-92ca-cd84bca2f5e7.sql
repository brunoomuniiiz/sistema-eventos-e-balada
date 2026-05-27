
-- 1) Flags em products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_drink_input boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_drink boolean NOT NULL DEFAULT false;

-- 2) Tabela event_drink_consumption
CREATE TABLE IF NOT EXISTS public.event_drink_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_cost_snapshot numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  total_cost numeric NOT NULL DEFAULT 0,
  stock_location_id uuid,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_drink_consumption TO authenticated;
GRANT ALL ON public.event_drink_consumption TO service_role;

ALTER TABLE public.event_drink_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View event_drink_consumption"
  ON public.event_drink_consumption FOR SELECT TO authenticated
  USING (user_id = get_owner_id(auth.uid())
    AND (is_owner_of(auth.uid(), user_id)
      OR has_permission(auth.uid(), user_id, 'eventos')
      OR has_permission(auth.uid(), user_id, 'financeiro')));

CREATE POLICY "Insert event_drink_consumption"
  ON public.event_drink_consumption FOR INSERT TO authenticated
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Delete event_drink_consumption"
  ON public.event_drink_consumption FOR DELETE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE INDEX IF NOT EXISTS idx_event_drink_consumption_event ON public.event_drink_consumption(event_id);
CREATE INDEX IF NOT EXISTS idx_event_drink_consumption_user_created ON public.event_drink_consumption(user_id, created_at DESC);

-- 3) RPC register_drink_consumption
CREATE OR REPLACE FUNCTION public.register_drink_consumption(
  p_event_id uuid,
  p_product_id uuid,
  p_quantity numeric DEFAULT 1
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_name text;
  v_cost numeric;
  v_track boolean;
  v_loc uuid;
  v_id uuid;
  v_user_name text;
BEGIN
  v_owner := get_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT is_owner_of(auth.uid(), v_owner) THEN
    RAISE EXCEPTION 'Apenas o owner pode lançar insumos';
  END IF;

  SELECT name, COALESCE(cost_price,0), COALESCE(track_stock, true)
    INTO v_name, v_cost, v_track
  FROM public.products
  WHERE id = p_product_id AND user_id = v_owner;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  SELECT id INTO v_loc FROM public.stock_locations
    WHERE user_id = v_owner AND is_default = true LIMIT 1;

  SELECT COALESCE((raw_user_meta_data->>'name'), email) INTO v_user_name
    FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.event_drink_consumption (
    user_id, event_id, product_id, product_name_snapshot,
    unit_cost_snapshot, quantity, total_cost, stock_location_id,
    created_by, created_by_name
  ) VALUES (
    v_owner, p_event_id, p_product_id, v_name,
    v_cost, p_quantity, v_cost * p_quantity, v_loc,
    auth.uid(), v_user_name
  ) RETURNING id INTO v_id;

  IF v_track AND v_loc IS NOT NULL THEN
    UPDATE public.product_stock
      SET quantity = GREATEST(quantity - p_quantity, 0)
      WHERE product_id = p_product_id AND location_id = v_loc;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_drink_consumption(uuid, uuid, numeric) TO authenticated;

-- 4) RPC undo_drink_consumption
CREATE OR REPLACE FUNCTION public.undo_drink_consumption(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_row public.event_drink_consumption%ROWTYPE;
  v_track boolean;
BEGIN
  v_owner := get_owner_id(auth.uid());
  IF NOT is_owner_of(auth.uid(), v_owner) THEN
    RAISE EXCEPTION 'Apenas o owner pode desfazer';
  END IF;

  SELECT * INTO v_row FROM public.event_drink_consumption
    WHERE id = p_id AND user_id = v_owner;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  SELECT COALESCE(track_stock,true) INTO v_track
    FROM public.products WHERE id = v_row.product_id;

  IF v_track AND v_row.stock_location_id IS NOT NULL THEN
    UPDATE public.product_stock
      SET quantity = quantity + v_row.quantity
      WHERE product_id = v_row.product_id AND location_id = v_row.stock_location_id;
  END IF;

  DELETE FROM public.event_drink_consumption WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_drink_consumption(uuid) TO authenticated;

-- 5) RPC get_event_drink_margin: retorna evento + janela móvel
CREATE OR REPLACE FUNCTION public.get_event_drink_margin(
  p_event_id uuid,
  p_window_events int DEFAULT 4
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_event_revenue numeric := 0;
  v_event_qty numeric := 0;
  v_event_cmv numeric := 0;
  v_window_ids uuid[];
  v_win_revenue numeric := 0;
  v_win_qty numeric := 0;
  v_win_cmv numeric := 0;
  v_30_revenue numeric := 0;
  v_30_qty numeric := 0;
  v_30_cmv numeric := 0;
BEGIN
  v_owner := get_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Evento atual: faturamento e qtd de drinks
  SELECT COALESCE(SUM(si.subtotal),0), COALESCE(SUM(si.quantity),0)
    INTO v_event_revenue, v_event_qty
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  JOIN public.products p ON p.id = si.product_id
  WHERE s.user_id = v_owner AND s.event_id = p_event_id
    AND p.is_drink = true
    AND s.status <> 'cancelled';

  -- Evento atual: CMV drinks
  SELECT COALESCE(SUM(total_cost),0) INTO v_event_cmv
  FROM public.event_drink_consumption
  WHERE user_id = v_owner AND event_id = p_event_id;

  -- Últimos N eventos do owner (por data, incluindo atual)
  WITH ranked AS (
    SELECT id, date FROM public.events
    WHERE user_id = v_owner
      AND date <= COALESCE((SELECT date FROM public.events WHERE id = p_event_id), now())
    ORDER BY date DESC
    LIMIT GREATEST(p_window_events, 1)
  )
  SELECT array_agg(id) INTO v_window_ids FROM ranked;

  IF v_window_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(si.subtotal),0), COALESCE(SUM(si.quantity),0)
      INTO v_win_revenue, v_win_qty
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    JOIN public.products p ON p.id = si.product_id
    WHERE s.user_id = v_owner
      AND s.event_id = ANY(v_window_ids)
      AND p.is_drink = true
      AND s.status <> 'cancelled';

    SELECT COALESCE(SUM(total_cost),0) INTO v_win_cmv
    FROM public.event_drink_consumption
    WHERE user_id = v_owner AND event_id = ANY(v_window_ids);
  END IF;

  -- Últimos 30 dias
  SELECT COALESCE(SUM(si.subtotal),0), COALESCE(SUM(si.quantity),0)
    INTO v_30_revenue, v_30_qty
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  JOIN public.products p ON p.id = si.product_id
  WHERE s.user_id = v_owner
    AND s.created_at >= now() - interval '30 days'
    AND p.is_drink = true
    AND s.status <> 'cancelled';

  SELECT COALESCE(SUM(total_cost),0) INTO v_30_cmv
  FROM public.event_drink_consumption edc
  WHERE edc.user_id = v_owner
    AND edc.created_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'event', jsonb_build_object(
      'revenue', v_event_revenue, 'cmv', v_event_cmv, 'qty', v_event_qty,
      'margin_pct', CASE WHEN v_event_revenue > 0 THEN ((v_event_revenue - v_event_cmv) / v_event_revenue) * 100 ELSE 0 END,
      'avg_cost_per_drink', CASE WHEN v_event_qty > 0 THEN v_event_cmv / v_event_qty ELSE 0 END
    ),
    'window', jsonb_build_object(
      'events_count', COALESCE(array_length(v_window_ids,1),0),
      'revenue', v_win_revenue, 'cmv', v_win_cmv, 'qty', v_win_qty,
      'margin_pct', CASE WHEN v_win_revenue > 0 THEN ((v_win_revenue - v_win_cmv) / v_win_revenue) * 100 ELSE 0 END,
      'avg_cost_per_drink', CASE WHEN v_win_qty > 0 THEN v_win_cmv / v_win_qty ELSE 0 END
    ),
    'last30', jsonb_build_object(
      'revenue', v_30_revenue, 'cmv', v_30_cmv, 'qty', v_30_qty,
      'margin_pct', CASE WHEN v_30_revenue > 0 THEN ((v_30_revenue - v_30_cmv) / v_30_revenue) * 100 ELSE 0 END,
      'avg_cost_per_drink', CASE WHEN v_30_qty > 0 THEN v_30_cmv / v_30_qty ELSE 0 END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_drink_margin(uuid, int) TO authenticated;
