
-- ============================================================
-- 1. PRODUCTS — cost, photo, description, pickup
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS pickup_description text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'un';

-- ============================================================
-- 2. USER_ROLES — permissions per employee
-- ============================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS can_discount boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS can_sell_cash boolean NOT NULL DEFAULT true;

-- Owners always have full powers
UPDATE public.user_roles
SET can_discount = true, max_discount_percent = 100, can_sell_cash = true
WHERE role = 'owner';

-- ============================================================
-- 3. SALES — location, event, category, gender, discount
-- ============================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'bar',
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_by uuid;

-- ============================================================
-- 4. SALE_ITEMS — cost snapshot for historical CMV
-- ============================================================
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost_price_snapshot numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 5. EVENTS — public landing
-- ============================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS public_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text,
  ADD COLUMN IF NOT EXISTS display_boost numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS landing_published boolean NOT NULL DEFAULT false;

-- ============================================================
-- 6. BAR_SETTINGS (1 per owner)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bar_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  bar_name text,
  logo_url text,
  instagram_handle text,
  accent_color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bar_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View bar_settings" ON public.bar_settings FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()));
CREATE POLICY "Insert bar_settings" ON public.bar_settings FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid()) AND public.is_owner_of(auth.uid(), user_id));
CREATE POLICY "Update bar_settings" ON public.bar_settings FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.is_owner_of(auth.uid(), user_id));
CREATE POLICY "Delete bar_settings" ON public.bar_settings FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.is_owner_of(auth.uid(), user_id));

CREATE TRIGGER trg_bar_settings_updated
  BEFORE UPDATE ON public.bar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7. STOCK_LOCATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock_locations" ON public.stock_locations FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND (public.has_permission(auth.uid(), user_id, 'estoque')
              OR public.has_permission(auth.uid(), user_id, 'vendas')));
CREATE POLICY "Insert stock_locations" ON public.stock_locations FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Update stock_locations" ON public.stock_locations FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Delete stock_locations" ON public.stock_locations FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE TRIGGER trg_stock_locations_updated
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8. PRODUCT_STOCK — qty per (product, location)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_product_stock_product ON public.product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_location ON public.product_stock(location_id);

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View product_stock" ON public.product_stock FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND (public.has_permission(auth.uid(), user_id, 'estoque')
              OR public.has_permission(auth.uid(), user_id, 'vendas')));
CREATE POLICY "Insert product_stock" ON public.product_stock FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Update product_stock" ON public.product_stock FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND (public.has_permission(auth.uid(), user_id, 'estoque')
              OR public.has_permission(auth.uid(), user_id, 'vendas')));
CREATE POLICY "Delete product_stock" ON public.product_stock FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE TRIGGER trg_product_stock_updated
  BEFORE UPDATE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: keep products.stock_quantity = sum of product_stock for that product
CREATE OR REPLACE FUNCTION public.sync_product_total_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _pid uuid;
BEGIN
  _pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE public.products
  SET stock_quantity = COALESCE((
    SELECT SUM(quantity)::int FROM public.product_stock WHERE product_id = _pid
  ), 0)
  WHERE id = _pid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_total_stock ON public.product_stock;
CREATE TRIGGER trg_sync_product_total_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_total_stock();

-- ============================================================
-- 9. STOCK_TRANSFERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  from_location_id uuid NOT NULL,
  to_location_id uuid NOT NULL,
  quantity integer NOT NULL,
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock_transfers" ON public.stock_transfers FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Insert stock_transfers" ON public.stock_transfers FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'estoque'));

-- RPC: transfer_stock atomically
CREATE OR REPLACE FUNCTION public.transfer_stock(
  _product_id uuid,
  _from_location uuid,
  _to_location uuid,
  _quantity integer,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _from_qty integer;
  _name text;
  _transfer_id uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'estoque') THEN
    RAISE EXCEPTION 'Sem permissão de estoque';
  END IF;
  IF _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser positiva';
  END IF;
  IF _from_location = _to_location THEN
    RAISE EXCEPTION 'Origem e destino não podem ser iguais';
  END IF;

  SELECT quantity INTO _from_qty
  FROM public.product_stock
  WHERE product_id = _product_id AND location_id = _from_location;

  IF _from_qty IS NULL OR _from_qty < _quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente na origem';
  END IF;

  UPDATE public.product_stock
  SET quantity = quantity - _quantity
  WHERE product_id = _product_id AND location_id = _from_location;

  INSERT INTO public.product_stock (user_id, product_id, location_id, quantity)
  VALUES (_owner, _product_id, _to_location, _quantity)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = public.product_stock.quantity + EXCLUDED.quantity;

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.stock_transfers (user_id, product_id, from_location_id, to_location_id, quantity, notes, created_by, created_by_name)
  VALUES (_owner, _product_id, _from_location, _to_location, _quantity, _notes, auth.uid(), _name)
  RETURNING id INTO _transfer_id;

  RETURN _transfer_id;
END;
$$;

-- ============================================================
-- 10. STOCK_INVENTORIES + items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  notes text,
  total_surplus_value numeric NOT NULL DEFAULT 0,
  total_shortage_value numeric NOT NULL DEFAULT 0,
  net_value numeric NOT NULL DEFAULT 0,
  opened_by uuid,
  opened_by_name text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_inventories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock_inventories" ON public.stock_inventories FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Insert stock_inventories" ON public.stock_inventories FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Update stock_inventories" ON public.stock_inventories FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Delete stock_inventories" ON public.stock_inventories FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE TRIGGER trg_stock_inventories_updated
  BEFORE UPDATE ON public.stock_inventories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.stock_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  inventory_id uuid NOT NULL REFERENCES public.stock_inventories(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  system_qty integer NOT NULL DEFAULT 0,
  counted_qty integer,
  cost_price numeric NOT NULL DEFAULT 0,
  diff_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_items_inventory ON public.stock_inventory_items(inventory_id);
ALTER TABLE public.stock_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock_inventory_items" ON public.stock_inventory_items FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Insert stock_inventory_items" ON public.stock_inventory_items FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Update stock_inventory_items" ON public.stock_inventory_items FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Delete stock_inventory_items" ON public.stock_inventory_items FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE TRIGGER trg_stock_inventory_items_updated
  BEFORE UPDATE ON public.stock_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: close_inventory
CREATE OR REPLACE FUNCTION public.close_inventory(
  _inventory_id uuid,
  _adjust_stock boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _loc uuid;
  _surplus numeric := 0;
  _shortage numeric := 0;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'estoque') THEN
    RAISE EXCEPTION 'Sem permissão de estoque';
  END IF;

  SELECT location_id INTO _loc FROM public.stock_inventories
  WHERE id = _inventory_id AND user_id = _owner;
  IF _loc IS NULL THEN RAISE EXCEPTION 'Inventário não encontrado'; END IF;

  -- Compute diff_value per item
  UPDATE public.stock_inventory_items
  SET diff_value = (COALESCE(counted_qty, 0) - system_qty) * cost_price
  WHERE inventory_id = _inventory_id;

  SELECT
    COALESCE(SUM(CASE WHEN diff_value > 0 THEN diff_value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN diff_value < 0 THEN -diff_value ELSE 0 END), 0)
  INTO _surplus, _shortage
  FROM public.stock_inventory_items WHERE inventory_id = _inventory_id;

  -- Adjust product_stock if requested
  IF _adjust_stock THEN
    INSERT INTO public.product_stock (user_id, product_id, location_id, quantity)
    SELECT _owner, i.product_id, _loc, COALESCE(i.counted_qty, i.system_qty)
    FROM public.stock_inventory_items i
    WHERE i.inventory_id = _inventory_id AND i.counted_qty IS NOT NULL
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END IF;

  UPDATE public.stock_inventories
  SET status = 'closed',
      closed_at = now(),
      total_surplus_value = _surplus,
      total_shortage_value = _shortage,
      net_value = _surplus - _shortage
  WHERE id = _inventory_id;
END;
$$;

-- ============================================================
-- 11. TICKET_TYPES per event (early/late prices + switch)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name text NOT NULL,
  gender_target text,
  price_early numeric NOT NULL DEFAULT 0,
  price_late numeric NOT NULL DEFAULT 0,
  switch_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View ticket_types" ON public.ticket_types FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Insert ticket_types" ON public.ticket_types FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND (public.has_permission(auth.uid(), user_id, 'eventos')
                   OR public.is_owner_of(auth.uid(), user_id)));
CREATE POLICY "Update ticket_types" ON public.ticket_types FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND (public.has_permission(auth.uid(), user_id, 'eventos')
              OR public.is_owner_of(auth.uid(), user_id)));
CREATE POLICY "Delete ticket_types" ON public.ticket_types FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND (public.has_permission(auth.uid(), user_id, 'eventos')
              OR public.is_owner_of(auth.uid(), user_id)));

CREATE TRIGGER trg_ticket_types_updated
  BEFORE UPDATE ON public.ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 12. MONTHLY_PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.monthly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_margin numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, month)
);
ALTER TABLE public.monthly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View monthly_plans" ON public.monthly_plans FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'financeiro'));
CREATE POLICY "Insert monthly_plans" ON public.monthly_plans FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'financeiro'));
CREATE POLICY "Update monthly_plans" ON public.monthly_plans FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'financeiro'));
CREATE POLICY "Delete monthly_plans" ON public.monthly_plans FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE TRIGGER trg_monthly_plans_updated
  BEFORE UPDATE ON public.monthly_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 13. UPDATE decrement_product_stock to use product_stock per location
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _type text;
  _track boolean;
  _loc uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.location_id INTO _loc FROM public.sales s WHERE s.id = NEW.sale_id;

  -- Fallback to default location if sale has no location
  IF _loc IS NULL THEN
    SELECT id INTO _loc FROM public.stock_locations
    WHERE user_id = NEW.user_id AND is_default = true LIMIT 1;
  END IF;

  SELECT product_type, track_stock INTO _type, _track
  FROM public.products WHERE id = NEW.product_id;

  IF _type = 'combo' THEN
    -- Explode combo into components, decrement at the same location
    UPDATE public.product_stock ps
    SET quantity = GREATEST(ps.quantity - (ci.quantity * NEW.quantity)::int, 0)
    FROM public.combo_items ci, public.products p
    WHERE ci.combo_product_id = NEW.product_id
      AND p.id = ci.component_product_id
      AND p.track_stock = true
      AND ps.product_id = ci.component_product_id
      AND ps.location_id = _loc;

    IF _track AND _loc IS NOT NULL THEN
      UPDATE public.product_stock
      SET quantity = GREATEST(quantity - NEW.quantity, 0)
      WHERE product_id = NEW.product_id AND location_id = _loc;
    END IF;
  ELSE
    IF COALESCE(_track, true) AND _loc IS NOT NULL THEN
      UPDATE public.product_stock
      SET quantity = GREATEST(quantity - NEW.quantity, 0)
      WHERE product_id = NEW.product_id AND location_id = _loc;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 14. add_guest_to_list — extend with companions
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_guest_to_list_v2(
  _slug text,
  _name text,
  _phone text,
  _gender text,
  _companions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ep RECORD;
  _new_id UUID;
  _ids uuid[] := '{}';
  _comp jsonb;
  _comp_name text;
  _comp_gender text;
BEGIN
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  SELECT ep.id, ep.user_id, ep.event_id, ep.promoter_id, e.status
  INTO _ep
  FROM public.event_promoters ep
  JOIN public.events e ON e.id = ep.event_id
  WHERE ep.slug = _slug;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lista não encontrada'; END IF;
  IF _ep.status <> 'upcoming' THEN RAISE EXCEPTION 'Lista fechada'; END IF;

  INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
  VALUES (_ep.user_id, _ep.event_id, _ep.promoter_id, _ep.id, trim(_name), nullif(trim(_phone), ''), nullif(trim(_gender), ''))
  RETURNING id INTO _new_id;
  _ids := _ids || _new_id;

  IF _companions IS NOT NULL AND jsonb_array_length(_companions) > 0 THEN
    FOR _comp IN SELECT * FROM jsonb_array_elements(_companions) LOOP
      _comp_name := _comp->>'name';
      _comp_gender := _comp->>'gender';
      IF _comp_name IS NOT NULL AND length(trim(_comp_name)) > 0 THEN
        INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
        VALUES (_ep.user_id, _ep.event_id, _ep.promoter_id, _ep.id, trim(_comp_name), nullif(trim(_phone), ''), nullif(trim(_comp_gender), ''))
        RETURNING id INTO _new_id;
        _ids := _ids || _new_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ids', to_jsonb(_ids), 'count', array_length(_ids, 1));
END;
$$;

-- ============================================================
-- 15. PUBLIC LANDING — read by slug (event + ticket types + count)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_event_landing(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _event RECORD;
  _bar RECORD;
  _tickets jsonb;
  _count integer;
  _boosted integer;
BEGIN
  SELECT id, user_id, name, date, location, description, flyer_url,
         public_slug, whatsapp_group_url, display_boost, landing_published, status
  INTO _event
  FROM public.events
  WHERE public_slug = _slug AND landing_published = true;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT bar_name, logo_url, instagram_handle, accent_color INTO _bar
  FROM public.bar_settings WHERE user_id = _event.user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'gender_target', gender_target,
    'price_early', price_early, 'price_late', price_late, 'switch_at', switch_at
  ) ORDER BY sort_order), '[]'::jsonb) INTO _tickets
  FROM public.ticket_types
  WHERE event_id = _event.id AND is_active = true;

  SELECT COUNT(*) INTO _count FROM public.guest_list_entries WHERE event_id = _event.id;
  _boosted := GREATEST(0, ROUND(_count * COALESCE(_event.display_boost, 1.0))::int);

  RETURN jsonb_build_object(
    'event', jsonb_build_object(
      'id', _event.id, 'name', _event.name, 'date', _event.date,
      'location', _event.location, 'description', _event.description,
      'flyer_url', _event.flyer_url, 'whatsapp_group_url', _event.whatsapp_group_url,
      'status', _event.status
    ),
    'bar', CASE WHEN _bar IS NULL THEN NULL ELSE jsonb_build_object(
      'name', _bar.bar_name, 'logo_url', _bar.logo_url,
      'instagram', _bar.instagram_handle, 'accent', _bar.accent_color
    ) END,
    'tickets', _tickets,
    'count', _count,
    'display_count', _boosted
  );
END;
$$;

-- Public RPC: add guest by event public_slug (no promoter slug needed; falls into "Casa")
CREATE OR REPLACE FUNCTION public.add_guest_to_event(
  _event_slug text,
  _name text,
  _phone text,
  _gender text,
  _companions jsonb DEFAULT '[]'::jsonb,
  _promoter_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _event RECORD;
  _ep_id uuid;
  _promoter_id uuid;
  _new_id uuid;
  _ids uuid[] := '{}';
  _comp jsonb;
  _comp_name text;
  _comp_gender text;
BEGIN
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  SELECT id, user_id, status INTO _event FROM public.events
  WHERE public_slug = _event_slug AND landing_published = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado'; END IF;
  IF _event.status <> 'upcoming' THEN RAISE EXCEPTION 'Lista fechada'; END IF;

  -- If promoter slug provided, use it; else use "Casa" promoter
  IF _promoter_slug IS NOT NULL AND length(trim(_promoter_slug)) > 0 THEN
    SELECT ep.id, ep.promoter_id INTO _ep_id, _promoter_id
    FROM public.event_promoters ep
    WHERE ep.slug = _promoter_slug AND ep.event_id = _event.id;
  END IF;

  IF _ep_id IS NULL THEN
    -- Find or create "Casa" promoter for this owner
    SELECT id INTO _promoter_id FROM public.promoters
    WHERE user_id = _event.user_id AND name = 'Casa' LIMIT 1;
    IF _promoter_id IS NULL THEN
      INSERT INTO public.promoters (user_id, name, commission_percent)
      VALUES (_event.user_id, 'Casa', 0)
      RETURNING id INTO _promoter_id;
    END IF;

    -- Find or create event_promoter for Casa
    SELECT id INTO _ep_id FROM public.event_promoters
    WHERE event_id = _event.id AND promoter_id = _promoter_id LIMIT 1;
    IF _ep_id IS NULL THEN
      INSERT INTO public.event_promoters (user_id, event_id, promoter_id, slug)
      VALUES (_event.user_id, _event.id, _promoter_id,
              'casa-' || substr(md5(random()::text || _event.id::text), 1, 8))
      RETURNING id INTO _ep_id;
    END IF;
  END IF;

  INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
  VALUES (_event.user_id, _event.id, _promoter_id, _ep_id, trim(_name), nullif(trim(_phone), ''), nullif(trim(_gender), ''))
  RETURNING id INTO _new_id;
  _ids := _ids || _new_id;

  IF _companions IS NOT NULL AND jsonb_array_length(_companions) > 0 THEN
    FOR _comp IN SELECT * FROM jsonb_array_elements(_companions) LOOP
      _comp_name := _comp->>'name';
      _comp_gender := _comp->>'gender';
      IF _comp_name IS NOT NULL AND length(trim(_comp_name)) > 0 THEN
        INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
        VALUES (_event.user_id, _event.id, _promoter_id, _ep_id, trim(_comp_name), nullif(trim(_phone), ''), nullif(trim(_comp_gender), ''))
        RETURNING id INTO _new_id;
        _ids := _ids || _new_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('count', array_length(_ids, 1));
END;
$$;

-- ============================================================
-- 16. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('bar-assets', 'bar-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product-photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-photos');

CREATE POLICY "product-photos auth write"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "product-photos auth update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "product-photos auth delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "bar-assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'bar-assets');

CREATE POLICY "bar-assets auth write"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bar-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "bar-assets auth update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'bar-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "bar-assets auth delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'bar-assets' AND auth.uid() IS NOT NULL);

-- ============================================================
-- 17. REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_list_entries;

-- ============================================================
-- 18. SEED — Principal location for each owner + migrate stock
-- ============================================================
DO $$
DECLARE
  _owner uuid;
  _loc_id uuid;
BEGIN
  FOR _owner IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'owner' LOOP
    -- Create Principal location
    INSERT INTO public.stock_locations (user_id, name, is_default)
    VALUES (_owner, 'Principal', true)
    ON CONFLICT (user_id, name) DO UPDATE SET is_default = true
    RETURNING id INTO _loc_id;

    IF _loc_id IS NULL THEN
      SELECT id INTO _loc_id FROM public.stock_locations
      WHERE user_id = _owner AND name = 'Principal';
    END IF;

    -- Migrate existing stock_quantity into product_stock at Principal
    INSERT INTO public.product_stock (user_id, product_id, location_id, quantity)
    SELECT _owner, p.id, _loc_id, p.stock_quantity
    FROM public.products p
    WHERE p.user_id = _owner
    ON CONFLICT (product_id, location_id) DO NOTHING;

    -- Backfill existing sales with Principal location
    UPDATE public.sales SET location_id = _loc_id
    WHERE user_id = _owner AND location_id IS NULL;
  END LOOP;
END $$;
