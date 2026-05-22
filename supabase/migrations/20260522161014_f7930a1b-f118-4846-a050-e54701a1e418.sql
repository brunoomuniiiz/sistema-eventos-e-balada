ALTER TABLE public.bar_expense_categories DROP CONSTRAINT IF EXISTS bar_expense_categories_kind_check;
ALTER TABLE public.bar_expense_categories ADD CONSTRAINT bar_expense_categories_kind_check CHECK (kind IN ('fixed','variable','event','investment'));

ALTER TABLE public.bar_expenses ADD COLUMN IF NOT EXISTS total_amount numeric;
ALTER TABLE public.bar_expenses ADD COLUMN IF NOT EXISTS investment_name text;

INSERT INTO public.bar_expense_categories (user_id, name, kind, is_default, sort_order)
SELECT DISTINCT ur.user_id, c.name, 'investment', true, c.sort_order
FROM public.user_roles ur
CROSS JOIN (VALUES
  ('Equipamento de som', 100),
  ('Equipamento de bar/cozinha', 101),
  ('Móveis e decoração', 102),
  ('Obras e reforma', 103),
  ('Tecnologia', 104),
  ('Melhoria do espaço', 105)
) AS c(name, sort_order)
WHERE ur.role = 'owner'
ON CONFLICT DO NOTHING;