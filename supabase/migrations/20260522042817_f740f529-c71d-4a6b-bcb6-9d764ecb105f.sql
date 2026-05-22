-- 1) Tipo de venda consumação
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS consumacao_target text
  CHECK (consumacao_target IN ('banda','dj','seguranca','funcionario','sorteio'));

CREATE INDEX IF NOT EXISTS idx_sales_consumacao_event
  ON public.sales (event_id, category)
  WHERE category = 'consumacao';

-- 2) Permissão por funcionário
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS pode_lancar_consumacao boolean NOT NULL DEFAULT false;

-- 3) RPC: agregados + detalhe da consumação de um evento
CREATE OR REPLACE FUNCTION public.get_event_consumacao(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_result jsonb;
BEGIN
  SELECT user_id INTO v_owner FROM public.events WHERE id = _event_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('by_target', '[]'::jsonb, 'items', '[]'::jsonb,
      'totals', jsonb_build_object('cost', 0, 'retail', 0, 'qty', 0));
  END IF;

  IF NOT (
    is_owner_of(auth.uid(), v_owner)
    OR has_permission(auth.uid(), v_owner, 'vendas')
    OR has_permission(auth.uid(), v_owner, 'financeiro')
    OR has_permission(auth.uid(), v_owner, 'eventos')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH itens AS (
    SELECT
      s.id            AS sale_id,
      s.created_at,
      s.employee_name,
      s.consumacao_target AS target,
      si.product_name,
      si.quantity,
      si.unit_price,
      si.cost_price_snapshot,
      (si.quantity * si.cost_price_snapshot)::numeric AS cost_total,
      (si.quantity * si.unit_price)::numeric          AS retail_total
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.event_id = _event_id
      AND s.category = 'consumacao'
      AND s.status = 'completed'
  ),
  by_target AS (
    SELECT
      target,
      SUM(quantity)::int    AS qty,
      SUM(cost_total)::numeric   AS cost,
      SUM(retail_total)::numeric AS retail
    FROM itens
    GROUP BY target
  ),
  totals AS (
    SELECT
      COALESCE(SUM(quantity),0)::int     AS qty,
      COALESCE(SUM(cost_total),0)::numeric   AS cost,
      COALESCE(SUM(retail_total),0)::numeric AS retail
    FROM itens
  )
  SELECT jsonb_build_object(
    'by_target', COALESCE((SELECT jsonb_agg(to_jsonb(by_target) ORDER BY cost DESC) FROM by_target), '[]'::jsonb),
    'items',     COALESCE((SELECT jsonb_agg(to_jsonb(itens) ORDER BY created_at DESC) FROM itens), '[]'::jsonb),
    'totals',    (SELECT to_jsonb(totals) FROM totals)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_consumacao(uuid) TO authenticated;