
-- Stock purchase (entrada de compra) tables + RPCs

CREATE TABLE public.stock_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  supplier_id UUID,
  supplier_name TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  expense_id UUID,
  location_id UUID NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_by_name TEXT,
  reversed_at TIMESTAMP WITH TIME ZONE,
  reversed_by UUID,
  reversed_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_purchases_user_created ON public.stock_purchases(user_id, created_at DESC);

CREATE TABLE public.stock_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES public.stock_purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_purchase_items_purchase ON public.stock_purchase_items(purchase_id);

ALTER TABLE public.stock_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock_purchases" ON public.stock_purchases FOR SELECT
  USING ((user_id = get_owner_id(auth.uid())) AND (has_permission(auth.uid(), user_id, 'estoque') OR has_permission(auth.uid(), user_id, 'financeiro')));

CREATE POLICY "Insert stock_purchases" ON public.stock_purchases FOR INSERT
  WITH CHECK ((user_id = get_owner_id(auth.uid())) AND has_permission(auth.uid(), user_id, 'estoque'));

CREATE POLICY "Update stock_purchases owner" ON public.stock_purchases FOR UPDATE
  USING ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Delete stock_purchases owner" ON public.stock_purchases FOR DELETE
  USING ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "View stock_purchase_items" ON public.stock_purchase_items FOR SELECT
  USING ((user_id = get_owner_id(auth.uid())) AND (has_permission(auth.uid(), user_id, 'estoque') OR has_permission(auth.uid(), user_id, 'financeiro')));

CREATE POLICY "Insert stock_purchase_items" ON public.stock_purchase_items FOR INSERT
  WITH CHECK ((user_id = get_owner_id(auth.uid())) AND has_permission(auth.uid(), user_id, 'estoque'));

CREATE POLICY "Delete stock_purchase_items owner" ON public.stock_purchase_items FOR DELETE
  USING ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id));

CREATE TRIGGER update_stock_purchases_updated_at
  BEFORE UPDATE ON public.stock_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: register_stock_purchase
-- Cria a compra, items, dá entrada no estoque, atualiza cost_price, cria despesa no financeiro.
CREATE OR REPLACE FUNCTION public.register_stock_purchase(
  _supplier_id UUID,
  _supplier_name TEXT,
  _location_id UUID,
  _items JSONB,
  _expense_category_id UUID,
  _expense_category_name TEXT,
  _payment_method TEXT,
  _paid BOOLEAN,
  _expense_date DATE,
  _due_date DATE,
  _notes TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
  v_purchase_id UUID;
  v_expense_id UUID;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product RECORD;
  v_desc TEXT := '';
BEGIN
  v_owner := get_owner_id(v_actor);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT has_permission(v_actor, v_owner, 'estoque') THEN
    RAISE EXCEPTION 'Sem permissão de estoque';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item informado';
  END IF;

  SELECT display_name INTO v_actor_name FROM profiles WHERE user_id = v_actor;

  -- total
  SELECT COALESCE(SUM((x->>'total_cost')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(_items) x;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Valor total inválido';
  END IF;

  -- description from items
  SELECT string_agg(
    (x->>'quantity') || 'x ' || (x->>'product_name_snapshot'),
    ', '
  ) INTO v_desc
  FROM jsonb_array_elements(_items) x;

  -- Cria despesa
  INSERT INTO bar_expenses (
    user_id, kind, category_id, category_name,
    supplier_id, supplier_name,
    amount, description, expense_date, due_date,
    payment_method, paid, paid_at, recurrence, notes, created_by
  ) VALUES (
    v_owner, 'variable', _expense_category_id, COALESCE(_expense_category_name, 'Compra de mercadoria'),
    _supplier_id, _supplier_name,
    v_total,
    'Compra: ' || COALESCE(v_desc, ''),
    COALESCE(_expense_date, CURRENT_DATE),
    _due_date,
    _payment_method,
    COALESCE(_paid, true),
    CASE WHEN COALESCE(_paid, true) THEN now() ELSE NULL END,
    'once',
    _notes,
    v_actor
  ) RETURNING id INTO v_expense_id;

  -- Cria purchase
  INSERT INTO stock_purchases (
    user_id, supplier_id, supplier_name, total_amount, expense_id, location_id, notes,
    created_by, created_by_name
  ) VALUES (
    v_owner, _supplier_id, _supplier_name, v_total, v_expense_id, _location_id, _notes,
    v_actor, v_actor_name
  ) RETURNING id INTO v_purchase_id;

  -- Para cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, track_stock INTO v_product
    FROM products WHERE id = (v_item->>'product_id')::uuid AND user_id = v_owner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado';
    END IF;

    INSERT INTO stock_purchase_items (
      user_id, purchase_id, product_id, product_name_snapshot,
      quantity, unit_cost, total_cost
    ) VALUES (
      v_owner, v_purchase_id, v_product.id, v_product.name,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric,
      (v_item->>'total_cost')::numeric
    );

    -- Entrada no estoque (upsert)
    INSERT INTO product_stock (user_id, product_id, location_id, quantity)
    VALUES (v_owner, v_product.id, _location_id, (v_item->>'quantity')::numeric)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                  updated_at = now();

    -- Atualiza cost_price com o último custo unitário pago
    UPDATE products SET cost_price = (v_item->>'unit_cost')::numeric,
                       updated_at = now()
    WHERE id = v_product.id;
  END LOOP;

  RETURN v_purchase_id;
END;
$$;

-- Note: product_stock may not have unique constraint on (product_id, location_id).
-- Ensure it exists for the ON CONFLICT above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_product_location_unique'
  ) THEN
    -- only add if no duplicates exist
    IF NOT EXISTS (
      SELECT product_id, location_id FROM product_stock
      GROUP BY product_id, location_id HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE product_stock
        ADD CONSTRAINT product_stock_product_location_unique UNIQUE (product_id, location_id);
    END IF;
  END IF;
END $$;

-- RPC: reverse_stock_purchase (owner only)
CREATE OR REPLACE FUNCTION public.reverse_stock_purchase(_purchase_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_owner UUID;
  v_purchase RECORD;
  v_item RECORD;
  v_actor_name TEXT;
BEGIN
  v_owner := get_owner_id(v_actor);
  IF NOT is_owner_of(v_actor, v_owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode estornar';
  END IF;

  SELECT * INTO v_purchase FROM stock_purchases WHERE id = _purchase_id AND user_id = v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada';
  END IF;
  IF v_purchase.status = 'reversed' THEN
    RAISE EXCEPTION 'Compra já estornada';
  END IF;

  SELECT display_name INTO v_actor_name FROM profiles WHERE user_id = v_actor;

  FOR v_item IN SELECT product_id, quantity FROM stock_purchase_items WHERE purchase_id = _purchase_id LOOP
    UPDATE product_stock
       SET quantity = GREATEST(0, quantity - v_item.quantity), updated_at = now()
     WHERE product_id = v_item.product_id AND location_id = v_purchase.location_id;
  END LOOP;

  IF v_purchase.expense_id IS NOT NULL THEN
    DELETE FROM bar_expenses WHERE id = v_purchase.expense_id;
  END IF;

  UPDATE stock_purchases
     SET status = 'reversed', reversed_at = now(),
         reversed_by = v_actor, reversed_by_name = v_actor_name
   WHERE id = _purchase_id;

  RETURN TRUE;
END;
$$;
