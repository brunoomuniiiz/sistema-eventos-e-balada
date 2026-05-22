
ALTER TABLE public.bar_expenses
  ADD COLUMN IF NOT EXISTS reference_month date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric,
  ADD COLUMN IF NOT EXISTS interest_amount numeric NOT NULL DEFAULT 0;

-- Backfill: usa o primeiro dia do mês de expense_date como competência
UPDATE public.bar_expenses
SET reference_month = date_trunc('month', expense_date)::date
WHERE reference_month IS NULL;

CREATE INDEX IF NOT EXISTS idx_bar_expenses_reference_month
  ON public.bar_expenses (user_id, reference_month);

CREATE INDEX IF NOT EXISTS idx_bar_expenses_paid_at
  ON public.bar_expenses (user_id, paid_at);
