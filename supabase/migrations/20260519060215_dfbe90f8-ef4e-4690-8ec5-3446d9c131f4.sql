
-- pix_charges: dynamic Mercado Pago Pix charges
CREATE TABLE IF NOT EXISTS public.pix_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sector text NOT NULL CHECK (sector IN ('bar','portaria','lojinha')),
  origin text NOT NULL CHECK (origin IN ('pdv','lojinha','portaria')),
  order_id uuid REFERENCES public.lojinha_orders(id) ON DELETE SET NULL,
  sale_payload jsonb,
  amount numeric NOT NULL CHECK (amount > 0),
  mp_payment_id text UNIQUE,
  qr_code text,
  qr_code_base64 text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','expired','cancelled','error')),
  error_message text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pix_charges_user_status_idx ON public.pix_charges (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pix_charges_mp_payment_idx ON public.pix_charges (mp_payment_id);

ALTER TABLE public.pix_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_charges staff view" ON public.pix_charges;
CREATE POLICY "pix_charges staff view" ON public.pix_charges FOR SELECT
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), user_id, 'vendas')
      OR public.has_permission(auth.uid(), user_id, 'lojinha')
      OR public.has_permission(auth.uid(), user_id, 'portaria')
    )
  );

-- Public can read a single pix_charge by id (needed for lojinha customer screen, no auth)
DROP POLICY IF EXISTS "pix_charges public read by id" ON public.pix_charges;
CREATE POLICY "pix_charges public read by id" ON public.pix_charges FOR SELECT
  TO anon USING (origin = 'lojinha');

CREATE TRIGGER pix_charges_set_updated_at
  BEFORE UPDATE ON public.pix_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pix_charges';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pix_charges;
  END IF;
END $$;

ALTER TABLE public.pix_charges REPLICA IDENTITY FULL;

-- RPC: finalize a PDV sale from approved pix charge (idempotent)
CREATE OR REPLACE FUNCTION public.finalize_sale_from_pix(_charge_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.pix_charges;
  p jsonb;
  v_sale_id uuid;
  it jsonb;
  pay jsonb;
BEGIN
  SELECT * INTO c FROM public.pix_charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pix_charge not found'; END IF;

  -- idempotent
  IF c.sale_payload IS NULL THEN RETURN NULL; END IF;
  IF c.sale_payload ? 'finalized_sale_id' THEN
    RETURN (c.sale_payload->>'finalized_sale_id')::uuid;
  END IF;

  p := c.sale_payload;

  INSERT INTO public.sales (
    user_id, employee_id, employee_name, payment_method, total,
    location_id, event_id, category, discount_percent, discount_value,
    discount_by, session_id
  ) VALUES (
    c.user_id,
    NULLIF(p->>'employee_id','')::uuid,
    p->>'employee_name',
    'pix',
    (p->>'total')::numeric,
    NULLIF(p->>'location_id','')::uuid,
    NULLIF(p->>'event_id','')::uuid,
    COALESCE(p->>'category','bar'),
    COALESCE((p->>'discount_percent')::numeric, 0),
    COALESCE((p->>'discount_value')::numeric, 0),
    NULLIF(p->>'discount_by','')::uuid,
    NULLIF(p->>'session_id','')::uuid
  ) RETURNING id INTO v_sale_id;

  FOR it IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    INSERT INTO public.sale_items (
      user_id, sale_id, product_id, product_name, unit_price, quantity, subtotal, cost_price_snapshot
    ) VALUES (
      c.user_id, v_sale_id,
      NULLIF(it->>'product_id','')::uuid,
      it->>'product_name',
      (it->>'unit_price')::numeric,
      (it->>'quantity')::int,
      (it->>'subtotal')::numeric,
      COALESCE((it->>'cost_price_snapshot')::numeric, 0)
    );
  END LOOP;

  FOR pay IN SELECT * FROM jsonb_array_elements(COALESCE(p->'payments', jsonb_build_array(jsonb_build_object('method','pix','amount', p->>'total')))) LOOP
    INSERT INTO public.sale_payments (user_id, sale_id, method, amount)
    VALUES (c.user_id, v_sale_id, pay->>'method', (pay->>'amount')::numeric);
  END LOOP;

  UPDATE public.pix_charges
     SET sale_payload = sale_payload || jsonb_build_object('finalized_sale_id', v_sale_id)
   WHERE id = _charge_id;

  RETURN v_sale_id;
END $$;

-- Allow online category through the cash gate too (already allowed). Add 'lojinha' bypass explicitly.
CREATE OR REPLACE FUNCTION public.enforce_sector_cash_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sector text; _status text;
BEGIN
  IF NEW.category IN ('online','lojinha') THEN RETURN NEW; END IF;
  IF NEW.category = 'entrada' THEN _sector := 'portaria';
  ELSE _sector := 'bar';
  END IF;

  SELECT status INTO _status FROM public.cash_register_sectors
    WHERE user_id = NEW.user_id AND sector = _sector;

  IF _status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Caixa do setor % não está aberto. Aguarde a autorização do gerente.', _sector
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
