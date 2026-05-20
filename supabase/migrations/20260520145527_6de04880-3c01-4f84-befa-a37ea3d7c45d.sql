
-- ============================================================================
-- Numeração diária por bar (#001), pickup_token único por pedido,
-- RPCs order_lookup_by_token e order_release (com fichas de preparo de combos).
-- ============================================================================

-- 1) Tabela contadora atômica por owner+dia (timezone São Paulo)
CREATE TABLE IF NOT EXISTS public.daily_order_counter (
  user_id uuid NOT NULL,
  daily_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, daily_date)
);

ALTER TABLE public.daily_order_counter ENABLE ROW LEVEL SECURITY;
-- sem políticas — acesso só via SECURITY DEFINER

-- 2) Função que devolve próximo número do dia para um owner
CREATE OR REPLACE FUNCTION public.next_daily_order_number(_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_n integer;
BEGIN
  INSERT INTO public.daily_order_counter (user_id, daily_date, last_number)
  VALUES (_owner, v_date, 1)
  ON CONFLICT (user_id, daily_date)
  DO UPDATE SET last_number = public.daily_order_counter.last_number + 1,
                updated_at = now()
  RETURNING last_number INTO v_n;
  RETURN v_n;
END;
$$;

-- 3) Colunas em sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS daily_number integer,
  ADD COLUMN IF NOT EXISTS daily_date date,
  ADD COLUMN IF NOT EXISTS pickup_token text,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sales_pickup_token_key
  ON public.sales(pickup_token) WHERE pickup_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_daily_lookup
  ON public.sales(user_id, daily_date, daily_number);

-- 4) Colunas em lojinha_orders
ALTER TABLE public.lojinha_orders
  ADD COLUMN IF NOT EXISTS daily_number integer,
  ADD COLUMN IF NOT EXISTS daily_date date,
  ADD COLUMN IF NOT EXISTS pickup_token text;

CREATE UNIQUE INDEX IF NOT EXISTS lojinha_orders_pickup_token_key
  ON public.lojinha_orders(pickup_token) WHERE pickup_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS lojinha_orders_daily_lookup
  ON public.lojinha_orders(user_id, daily_date, daily_number);

-- 5) Trigger genérico — atribui daily_number, daily_date e pickup_token
CREATE OR REPLACE FUNCTION public.assign_daily_number_and_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.daily_number IS NULL THEN
    NEW.daily_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    NEW.daily_number := public.next_daily_order_number(NEW.user_id);
  END IF;
  IF NEW.pickup_token IS NULL THEN
    NEW.pickup_token := encode(gen_random_bytes(9), 'base64');
    NEW.pickup_token := replace(replace(replace(NEW.pickup_token, '+','-'), '/','_'), '=','');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_daily ON public.sales;
CREATE TRIGGER trg_sales_daily
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.assign_daily_number_and_token();

DROP TRIGGER IF EXISTS trg_lojinha_orders_daily ON public.lojinha_orders;
CREATE TRIGGER trg_lojinha_orders_daily
  BEFORE INSERT ON public.lojinha_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_daily_number_and_token();

-- 6) Permitir cliente público ler pickup_token / daily_number da própria order
-- (já temos política "lojinha_orders staff view"; cliente acessa via RPC lojinha_get_order,
-- então não precisa de política nova aqui)

-- 7) RPC: scanner do garçom — abre pedido por pickup_token
CREATE OR REPLACE FUNCTION public.order_lookup_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_source text;
  v_id uuid;
  v_daily integer;
  v_status text;
  v_total numeric;
  v_customer text;
  v_released boolean;
  v_items jsonb;
BEGIN
  -- procura em sales (PDV)
  SELECT s.id, s.user_id, s.daily_number, s.total, s.released_at IS NOT NULL
    INTO v_id, v_owner, v_daily, v_total, v_released
  FROM public.sales s
  WHERE s.pickup_token = _token
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    v_source := 'sale';
    v_status := CASE WHEN v_released THEN 'released' ELSE 'paid' END;
    v_customer := 'Balcão';

    IF NOT (has_permission(auth.uid(), v_owner, 'vendas') OR has_permission(auth.uid(), v_owner, 'lojinha')) THEN
      RAISE EXCEPTION 'no_permission';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', si.id,
      'product_id', si.product_id,
      'product_name', si.product_name,
      'quantity', si.quantity,
      'unit_price', si.unit_price,
      'product_type', COALESCE(p.product_type, 'simple')
    ) ORDER BY si.created_at), '[]'::jsonb) INTO v_items
    FROM public.sale_items si
    LEFT JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = v_id;
  ELSE
    -- procura em lojinha_orders
    SELECT o.id, o.user_id, o.daily_number, o.total, o.customer_name, o.status
      INTO v_id, v_owner, v_daily, v_total, v_customer, v_status
    FROM public.lojinha_orders o
    WHERE o.pickup_token = _token
    LIMIT 1;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    v_source := 'order';

    IF NOT (has_permission(auth.uid(), v_owner, 'vendas') OR has_permission(auth.uid(), v_owner, 'lojinha')) THEN
      RAISE EXCEPTION 'no_permission';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', oi.id,
      'product_id', oi.product_id,
      'product_name', oi.product_name_snapshot,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'product_type', COALESCE(p.product_type, 'simple')
    ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
    FROM public.lojinha_order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = v_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source', v_source,
    'id', v_id,
    'daily_number', v_daily,
    'status', v_status,
    'total', v_total,
    'customer_name', v_customer,
    'items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.order_lookup_by_token(text) TO authenticated;

-- 8) RPC: liberar pedido + devolve fichas de preparo (1 por unidade de combo)
CREATE OR REPLACE FUNCTION public.order_release(_source text, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_daily integer;
  v_bar_name text;
  v_caller text;
  v_slips jsonb := '[]'::jsonb;
  v_item record;
  v_components jsonb;
  i integer;
BEGIN
  IF _source = 'sale' THEN
    SELECT user_id, daily_number INTO v_owner, v_daily
    FROM public.sales WHERE id = _id;
  ELSIF _source = 'order' THEN
    SELECT user_id, daily_number INTO v_owner, v_daily
    FROM public.lojinha_orders WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'invalid_source';
  END IF;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF NOT (has_permission(auth.uid(), v_owner, 'vendas') OR has_permission(auth.uid(), v_owner, 'lojinha')) THEN
    RAISE EXCEPTION 'no_permission';
  END IF;

  SELECT bar_name INTO v_bar_name FROM public.bar_settings WHERE user_id = v_owner LIMIT 1;
  SELECT display_name INTO v_caller FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = v_owner LIMIT 1;

  -- monta fichas de preparo: para cada item combo, 1 ficha por unidade
  IF _source = 'sale' THEN
    FOR v_item IN
      SELECT si.product_id, si.product_name, si.quantity, COALESCE(p.product_type, 'simple') AS product_type
      FROM public.sale_items si
      LEFT JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = _id
      ORDER BY si.created_at
    LOOP
      IF v_item.product_type = 'combo' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', cp.name, 'qty', ci.quantity)), '[]'::jsonb)
          INTO v_components
        FROM public.combo_items ci
        JOIN public.products cp ON cp.id = ci.component_product_id
        WHERE ci.combo_product_id = v_item.product_id;

        FOR i IN 1..v_item.quantity LOOP
          v_slips := v_slips || jsonb_build_array(jsonb_build_object(
            'daily_number', v_daily,
            'bar_name', v_bar_name,
            'item_name', v_item.product_name,
            'unit_index', i,
            'unit_total', v_item.quantity,
            'components', v_components,
            'waiter', v_caller,
            'created_at', now()
          ));
        END LOOP;
      END IF;
    END LOOP;

    UPDATE public.sales SET released_at = COALESCE(released_at, now()) WHERE id = _id;
  ELSE
    FOR v_item IN
      SELECT oi.product_id, oi.product_name_snapshot AS product_name, oi.quantity,
             COALESCE(p.product_type, 'simple') AS product_type
      FROM public.lojinha_order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = _id
      ORDER BY oi.created_at
    LOOP
      IF v_item.product_type = 'combo' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', cp.name, 'qty', ci.quantity)), '[]'::jsonb)
          INTO v_components
        FROM public.combo_items ci
        JOIN public.products cp ON cp.id = ci.component_product_id
        WHERE ci.combo_product_id = v_item.product_id;

        FOR i IN 1..v_item.quantity LOOP
          v_slips := v_slips || jsonb_build_array(jsonb_build_object(
            'daily_number', v_daily,
            'bar_name', v_bar_name,
            'item_name', v_item.product_name,
            'unit_index', i,
            'unit_total', v_item.quantity,
            'components', v_components,
            'waiter', v_caller,
            'created_at', now()
          ));
        END LOOP;
      END IF;
    END LOOP;

    UPDATE public.lojinha_orders
      SET status = 'delivered',
          delivered_at = COALESCE(delivered_at, now())
      WHERE id = _id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'daily_number', v_daily, 'prep_slips', v_slips);
END;
$$;

GRANT EXECUTE ON FUNCTION public.order_release(text, uuid) TO authenticated;
