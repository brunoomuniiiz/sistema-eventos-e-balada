
-- 1. Nome do destinatário da consumação
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS consumacao_recipient_name text;

-- 2. Parcela/investimento pode definir abatimento automático por consumação
ALTER TABLE public.bar_expenses
  ADD COLUMN IF NOT EXISTS auto_consumacao_recipient text,
  ADD COLUMN IF NOT EXISTS auto_consumacao_target text;

-- 3. Atualizar RPC de consumação para incluir recipient
CREATE OR REPLACE FUNCTION public.get_event_consumacao(_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_result jsonb;
BEGIN
  SELECT user_id INTO v_owner FROM public.events WHERE id = _event_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('by_target','[]'::jsonb,'by_recipient','[]'::jsonb,'items','[]'::jsonb,
      'totals', jsonb_build_object('cost',0,'retail',0,'qty',0));
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
      s.consumacao_recipient_name AS recipient_name,
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
    SELECT target, SUM(quantity)::int AS qty,
           SUM(cost_total)::numeric AS cost,
           SUM(retail_total)::numeric AS retail
    FROM itens GROUP BY target
  ),
  by_recipient AS (
    SELECT target, COALESCE(recipient_name,'—') AS recipient_name,
           SUM(quantity)::int AS qty,
           SUM(cost_total)::numeric AS cost,
           SUM(retail_total)::numeric AS retail
    FROM itens GROUP BY target, COALESCE(recipient_name,'—')
  ),
  totals AS (
    SELECT COALESCE(SUM(quantity),0)::int AS qty,
           COALESCE(SUM(cost_total),0)::numeric AS cost,
           COALESCE(SUM(retail_total),0)::numeric AS retail
    FROM itens
  )
  SELECT jsonb_build_object(
    'by_target',    COALESCE((SELECT jsonb_agg(to_jsonb(by_target) ORDER BY cost DESC) FROM by_target), '[]'::jsonb),
    'by_recipient', COALESCE((SELECT jsonb_agg(to_jsonb(by_recipient) ORDER BY cost DESC) FROM by_recipient), '[]'::jsonb),
    'items',        COALESCE((SELECT jsonb_agg(to_jsonb(itens) ORDER BY created_at DESC) FROM itens), '[]'::jsonb),
    'totals',       (SELECT to_jsonb(totals) FROM totals)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 4. RPC para histórico de consumação de uma parcela (por período)
CREATE OR REPLACE FUNCTION public.get_supplier_consumacao_history(
  _expense_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_recipient text;
  v_target text;
  v_result jsonb;
BEGIN
  SELECT user_id, auto_consumacao_recipient, COALESCE(auto_consumacao_target,'seguranca')
    INTO v_owner, v_recipient, v_target
  FROM public.bar_expenses WHERE id = _expense_id;

  IF v_owner IS NULL OR v_recipient IS NULL THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'totals',jsonb_build_object('qty',0,'cost',0,'retail',0));
  END IF;

  IF NOT (is_owner_of(auth.uid(), v_owner) OR has_permission(auth.uid(), v_owner, 'financeiro')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH itens AS (
    SELECT
      s.id AS sale_id, s.created_at, s.consumacao_target AS target,
      s.consumacao_recipient_name AS recipient_name,
      si.product_name, si.quantity, si.unit_price, si.cost_price_snapshot,
      (si.quantity * si.cost_price_snapshot)::numeric AS cost_total,
      (si.quantity * si.unit_price)::numeric AS retail_total
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.user_id = v_owner
      AND s.category = 'consumacao'
      AND s.status = 'completed'
      AND lower(trim(s.consumacao_recipient_name)) = lower(trim(v_recipient))
      AND s.consumacao_target = v_target
      AND (_from IS NULL OR s.created_at::date >= _from)
      AND (_to   IS NULL OR s.created_at::date <= _to)
  ), totals AS (
    SELECT COALESCE(SUM(quantity),0)::int AS qty,
           COALESCE(SUM(cost_total),0)::numeric AS cost,
           COALESCE(SUM(retail_total),0)::numeric AS retail
    FROM itens
  )
  SELECT jsonb_build_object(
    'recipient', v_recipient,
    'target', v_target,
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(itens) ORDER BY created_at DESC) FROM itens), '[]'::jsonb),
    'totals', (SELECT to_jsonb(totals) FROM totals)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 5. Trigger: ao inserir sale_items de uma sales 'consumacao', criar expense_offsets
-- automáticos para parcelas em aberto com auto_consumacao_recipient correspondente.
CREATE OR REPLACE FUNCTION public.handle_consumacao_auto_offset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale record;
  v_amount numeric;
  v_expense record;
BEGIN
  SELECT id, user_id, category, consumacao_target, consumacao_recipient_name
    INTO v_sale
  FROM public.sales WHERE id = NEW.sale_id;

  IF v_sale.category IS DISTINCT FROM 'consumacao' THEN RETURN NEW; END IF;
  IF v_sale.consumacao_recipient_name IS NULL OR length(trim(v_sale.consumacao_recipient_name)) = 0 THEN
    RETURN NEW;
  END IF;

  v_amount := (NEW.quantity * NEW.unit_price)::numeric;
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  -- escolher 1 parcela: a mais antiga em aberto com recipient match
  SELECT * INTO v_expense
  FROM public.bar_expenses
  WHERE user_id = v_sale.user_id
    AND auto_consumacao_recipient IS NOT NULL
    AND lower(trim(auto_consumacao_recipient)) = lower(trim(v_sale.consumacao_recipient_name))
    AND COALESCE(auto_consumacao_target,'seguranca') = COALESCE(v_sale.consumacao_target,'seguranca')
    AND paid = false
  ORDER BY due_date NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_expense.id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.expense_offsets
    (user_id, expense_id, source_type, source_id, amount, description, reference_month)
  VALUES
    (v_sale.user_id, v_expense.id, 'consumacao', v_sale.id, v_amount,
     'Consumação ' || COALESCE(v_sale.consumacao_target,'') || ' — ' || v_sale.consumacao_recipient_name
       || ' (' || NEW.quantity || '× ' || NEW.product_name || ')',
     v_expense.reference_month);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consumacao_auto_offset ON public.sale_items;
CREATE TRIGGER trg_consumacao_auto_offset
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.handle_consumacao_auto_offset();
