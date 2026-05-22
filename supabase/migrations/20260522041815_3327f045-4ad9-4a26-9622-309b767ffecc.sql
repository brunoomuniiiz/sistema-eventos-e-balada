
-- Índice único para evitar crédito duplicado no mesmo check-in
CREATE UNIQUE INDEX IF NOT EXISTS uniq_promoter_credits_checkin
  ON public.promoter_credits (source_ref_id)
  WHERE source = 'checkin_free';

-- Função que cria crédito quando convidado entra
CREATE OR REPLACE FUNCTION public.generate_promoter_credit_on_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_value numeric;
  v_owner uuid;
BEGIN
  -- Só age quando muda para checked_in = true e há promoter associado
  IF NEW.checked_in IS NOT TRUE THEN RETURN NEW; END IF;
  IF COALESCE(OLD.checked_in, false) = true THEN RETURN NEW; END IF;
  IF NEW.promoter_id IS NULL THEN RETURN NEW; END IF;

  -- Busca regra de comissão (override de evento tem prioridade)
  SELECT
    COALESCE(epc_type, p_type),
    COALESCE(epc_value, p_value),
    p.user_id
  INTO v_type, v_value, v_owner
  FROM (
    SELECT
      CASE WHEN NEW.gender = 'F' THEN p.comm_woman_free_type ELSE p.comm_man_free_type END AS p_type,
      CASE WHEN NEW.gender = 'F' THEN p.comm_woman_free_value ELSE p.comm_man_free_value END AS p_value,
      p.user_id,
      (SELECT CASE WHEN NEW.gender = 'F' THEN epc.comm_woman_free_type ELSE epc.comm_man_free_type END
         FROM public.event_promoter_commissions epc
         WHERE epc.promoter_id = p.id AND epc.event_id = NEW.event_id LIMIT 1) AS epc_type,
      (SELECT CASE WHEN NEW.gender = 'F' THEN epc.comm_woman_free_value ELSE epc.comm_man_free_value END
         FROM public.event_promoter_commissions epc
         WHERE epc.promoter_id = p.id AND epc.event_id = NEW.event_id LIMIT 1) AS epc_value
    FROM public.promoters p
    WHERE p.id = NEW.promoter_id
  ) p;

  -- Só cria crédito se for valor fixo > 0 (percent não se aplica a entrada gratuita)
  IF v_type = 'fixed' AND COALESCE(v_value, 0) > 0 THEN
    INSERT INTO public.promoter_credits (
      user_id, promoter_id, event_id, amount, source, source_ref_id, gender
    ) VALUES (
      v_owner, NEW.promoter_id, NEW.event_id, v_value, 'checkin_free', NEW.id, NEW.gender
    )
    ON CONFLICT (source_ref_id) WHERE source = 'checkin_free' DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promoter_credit_checkin ON public.guest_list_entries;
CREATE TRIGGER trg_promoter_credit_checkin
AFTER UPDATE OF checked_in ON public.guest_list_entries
FOR EACH ROW
EXECUTE FUNCTION public.generate_promoter_credit_on_checkin();
