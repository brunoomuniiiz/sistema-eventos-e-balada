-- 1) novos campos em bar_expenses
ALTER TABLE public.bar_expenses
  ADD COLUMN IF NOT EXISTS is_investment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installment_total integer,
  ADD COLUMN IF NOT EXISTS installment_index integer,
  ADD COLUMN IF NOT EXISTS installment_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_bar_expenses_installment_group
  ON public.bar_expenses (installment_group_id);

-- 2) seed Bazar e limpeza para todos os owners que já tenham categorias
INSERT INTO public.bar_expense_categories (user_id, name, icon, kind, is_default, sort_order)
SELECT DISTINCT bec.user_id, 'Bazar e limpeza', 'sparkles', 'fixed', true, 50
FROM public.bar_expense_categories bec
WHERE NOT EXISTS (
  SELECT 1 FROM public.bar_expense_categories x
  WHERE x.user_id = bec.user_id AND x.kind = 'fixed' AND lower(x.name) = 'bazar e limpeza'
);

-- 3) tabela de abatimentos (consumo de fornecedor abate parcela)
CREATE TABLE IF NOT EXISTS public.expense_offsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  expense_id uuid NOT NULL REFERENCES public.bar_expenses(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('sale','event_cost','manual')),
  source_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  reference_month date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_offsets_expense ON public.expense_offsets(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_offsets_user_month ON public.expense_offsets(user_id, reference_month);

ALTER TABLE public.expense_offsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View expense_offsets" ON public.expense_offsets
  FOR SELECT USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Insert expense_offsets" ON public.expense_offsets
  FOR INSERT WITH CHECK (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Delete expense_offsets" ON public.expense_offsets
  FOR DELETE USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'financeiro'));