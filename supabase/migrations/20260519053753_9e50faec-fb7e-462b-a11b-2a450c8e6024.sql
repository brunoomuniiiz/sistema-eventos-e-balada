
-- 1) Table
CREATE TABLE IF NOT EXISTS public.cash_register_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sector text NOT NULL CHECK (sector IN ('bar','portaria')),
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','awaiting_open','open','awaiting_close')),
  opening_amount numeric NOT NULL DEFAULT 0,
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz,
  authorized_by uuid,
  authorized_by_name text,
  authorized_at timestamptz,
  close_declared jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sector)
);

ALTER TABLE public.cash_register_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sectors REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "View cash_register_sectors" ON public.cash_register_sectors;
CREATE POLICY "View cash_register_sectors"
  ON public.cash_register_sectors FOR SELECT
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR public.has_permission(auth.uid(), user_id, 'financeiro')
      OR public.has_permission(auth.uid(), user_id, 'vendas')
      OR public.has_permission(auth.uid(), user_id, 'portaria')
    )
  );

-- All mutations only via SECURITY DEFINER functions; no INSERT/UPDATE/DELETE policy.

CREATE TRIGGER cash_register_sectors_updated_at
BEFORE UPDATE ON public.cash_register_sectors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Helpers
CREATE OR REPLACE FUNCTION public._ensure_sector_row(_owner uuid, _sector text)
RETURNS public.cash_register_sectors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.cash_register_sectors;
BEGIN
  SELECT * INTO _row FROM public.cash_register_sectors
   WHERE user_id = _owner AND sector = _sector;
  IF NOT FOUND THEN
    INSERT INTO public.cash_register_sectors (user_id, sector, status)
    VALUES (_owner, _sector, 'closed')
    RETURNING * INTO _row;
  END IF;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public._can_authorize_cash(_uid uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner_of(_uid, _owner)
      OR public.has_permission(_uid, _owner, 'financeiro');
$$;

CREATE OR REPLACE FUNCTION public._sector_permission(_sector text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _sector = 'portaria' THEN 'portaria' ELSE 'vendas' END;
$$;

-- 3) RPCs
CREATE OR REPLACE FUNCTION public.get_sector_statuses()
RETURNS SETOF public.cash_register_sectors
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF _owner IS NULL THEN RETURN; END IF;
  PERFORM public._ensure_sector_row(_owner, 'bar');
  PERFORM public._ensure_sector_row(_owner, 'portaria');
  RETURN QUERY SELECT * FROM public.cash_register_sectors
    WHERE user_id = _owner ORDER BY sector;
END $$;

CREATE OR REPLACE FUNCTION public.request_open_sector(_sector text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text; _row public.cash_register_sectors;
BEGIN
  IF _sector NOT IN ('bar','portaria') THEN RAISE EXCEPTION 'Setor inválido'; END IF;
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, public._sector_permission(_sector)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  _row := public._ensure_sector_row(_owner, _sector);
  IF _row.status = 'open' THEN RETURN _row.id; END IF;
  IF _row.status IN ('awaiting_open','awaiting_close') THEN RETURN _row.id; END IF;

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.cash_register_sectors
     SET status='awaiting_open',
         requested_by=auth.uid(), requested_by_name=_name, requested_at=now(),
         authorized_by=NULL, authorized_by_name=NULL, authorized_at=NULL,
         close_declared=NULL
   WHERE id = _row.id;
  RETURN _row.id;
END $$;

CREATE OR REPLACE FUNCTION public.authorize_open_sector(_sector text, _opening_amount numeric, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text; _row public.cash_register_sectors;
BEGIN
  IF _sector NOT IN ('bar','portaria') THEN RAISE EXCEPTION 'Setor inválido'; END IF;
  _owner := public.get_owner_id(auth.uid());
  IF NOT public._can_authorize_cash(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o gerente pode autorizar';
  END IF;
  _row := public._ensure_sector_row(_owner, _sector);

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.cash_register_sectors
     SET status='open',
         opening_amount=COALESCE(_opening_amount,0),
         authorized_by=auth.uid(), authorized_by_name=_name, authorized_at=now(),
         notes=COALESCE(_notes, notes),
         close_declared=NULL
   WHERE id = _row.id;
  RETURN _row.id;
END $$;

CREATE OR REPLACE FUNCTION public.request_close_sector(_sector text, _declared jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text; _row public.cash_register_sectors;
BEGIN
  IF _sector NOT IN ('bar','portaria') THEN RAISE EXCEPTION 'Setor inválido'; END IF;
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, public._sector_permission(_sector)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  _row := public._ensure_sector_row(_owner, _sector);
  IF _row.status <> 'open' THEN RAISE EXCEPTION 'Caixa não está aberto'; END IF;

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.cash_register_sectors
     SET status='awaiting_close',
         requested_by=auth.uid(), requested_by_name=_name, requested_at=now(),
         close_declared=_declared
   WHERE id = _row.id;
  RETURN _row.id;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_close_sector(_sector text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text; _row public.cash_register_sectors;
BEGIN
  IF _sector NOT IN ('bar','portaria') THEN RAISE EXCEPTION 'Setor inválido'; END IF;
  _owner := public.get_owner_id(auth.uid());
  IF NOT public._can_authorize_cash(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o gerente pode fechar';
  END IF;
  _row := public._ensure_sector_row(_owner, _sector);

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.cash_register_sectors
     SET status='closed',
         authorized_by=auth.uid(), authorized_by_name=_name, authorized_at=now(),
         opening_amount=0,
         requested_by=NULL, requested_by_name=NULL, requested_at=NULL,
         close_declared=NULL
   WHERE id = _row.id;
  RETURN _row.id;
END $$;

CREATE OR REPLACE FUNCTION public.force_open_sector(_sector text, _opening_amount numeric)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.authorize_open_sector(_sector, _opening_amount, 'Aberto pelo gerente');
$$;

CREATE OR REPLACE FUNCTION public.force_close_sector(_sector text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.confirm_close_sector(_sector);
$$;

-- 4) Block sales when sector is not open
CREATE OR REPLACE FUNCTION public.enforce_sector_cash_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sector text; _status text;
BEGIN
  -- Online sales (lojinha) bypass — handled by customer flow
  IF NEW.category IN ('online') THEN RETURN NEW; END IF;
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

DROP TRIGGER IF EXISTS enforce_sector_cash_open_trg ON public.sales;
CREATE TRIGGER enforce_sector_cash_open_trg
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.enforce_sector_cash_open();

-- 5) Realtime
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='cash_register_sectors';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register_sectors';
  END IF;
END $$;
