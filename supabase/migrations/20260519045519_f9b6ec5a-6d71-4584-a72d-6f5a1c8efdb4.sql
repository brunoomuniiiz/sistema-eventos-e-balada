-- Permissões modulares por funcionário
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS pode_adicionar_bebidas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceita_dinheiro        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_pix             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_cartao          boolean NOT NULL DEFAULT true;

-- Espelha o valor antigo no novo aceita_dinheiro
UPDATE public.user_roles SET aceita_dinheiro = can_sell_cash;

-- Caixa da portaria: amarrar entrada à sessão + venda espelho
ALTER TABLE public.event_entries
  ADD COLUMN IF NOT EXISTS session_id uuid NULL,
  ADD COLUMN IF NOT EXISTS sale_id    uuid NULL,
  ADD COLUMN IF NOT EXISTS payment_method text NULL;

-- RPC para vender entrada da portaria já criando sales + sale_payments
CREATE OR REPLACE FUNCTION public.register_event_entry(
  _event_id uuid,
  _ticket_type_id uuid,
  _gender text,
  _amount numeric,
  _payment_method text,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
  _session uuid;
  _sale_id uuid;
  _name text;
  _entry_id uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT (public.has_permission(auth.uid(), _owner, 'portaria')
          OR public.has_permission(auth.uid(), _owner, 'vendas')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _payment_method NOT IN ('dinheiro','debito','credito','pix') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;

  SELECT id INTO _session FROM public.cash_sessions
   WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  IF _session IS NOT NULL THEN
    INSERT INTO public.sales (user_id, total, payment_method, category, session_id,
                              employee_id, employee_name, event_id, gender)
    VALUES (_owner, COALESCE(_amount,0), _payment_method, 'entrada', _session,
            auth.uid(), _name, _event_id, _gender)
    RETURNING id INTO _sale_id;

    INSERT INTO public.sale_payments(user_id, sale_id, amount, method)
    VALUES (_owner, _sale_id, COALESCE(_amount,0), _payment_method);
  END IF;

  INSERT INTO public.event_entries
    (user_id, event_id, ticket_type_id, gender, amount_paid, notes,
     created_by, created_by_name, session_id, sale_id, payment_method)
  VALUES
    (_owner, _event_id, _ticket_type_id, _gender, COALESCE(_amount,0), _notes,
     auth.uid(), _name, _session, _sale_id, _payment_method)
  RETURNING id INTO _entry_id;

  RETURN _entry_id;
END $$;