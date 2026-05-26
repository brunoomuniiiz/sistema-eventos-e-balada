-- ============ A.1 payment_terminals ============
CREATE TABLE public.payment_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('mercado_pago','manual')),
  mp_device_id text,
  owner_label text,
  accepts_credito boolean NOT NULL DEFAULT true,
  accepts_debito boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_terminals TO authenticated;
GRANT ALL ON public.payment_terminals TO service_role;
ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View payment_terminals" ON public.payment_terminals
  FOR SELECT TO authenticated
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'vendas')
              OR has_permission(auth.uid(), user_id, 'portaria')
              OR has_permission(auth.uid(), user_id, 'financeiro')));

CREATE POLICY "Insert payment_terminals" ON public.payment_terminals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Update payment_terminals" ON public.payment_terminals
  FOR UPDATE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Delete payment_terminals" ON public.payment_terminals
  FOR DELETE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE TRIGGER trg_payment_terminals_updated_at
  BEFORE UPDATE ON public.payment_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ A.3 user_roles flag + terminal_id columns ============
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS pode_pix_chave boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.payment_terminals(id) ON DELETE SET NULL;
ALTER TABLE public.sale_payments ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.payment_terminals(id) ON DELETE SET NULL;
ALTER TABLE public.sale_payments ADD COLUMN IF NOT EXISTS notes text;

-- ============ E.1 printers ============
CREATE TABLE public.printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printers TO authenticated;
GRANT ALL ON public.printers TO service_role;
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View printers" ON public.printers
  FOR SELECT TO authenticated
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'vendas')));

CREATE POLICY "Insert printers" ON public.printers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Update printers" ON public.printers
  FOR UPDATE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Delete printers" ON public.printers
  FOR DELETE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE TRIGGER trg_printers_updated_at
  BEFORE UPDATE ON public.printers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ E.2 print_rules ============
CREATE TABLE public.print_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_role_id uuid NOT NULL REFERENCES public.user_roles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  print_on_sale boolean NOT NULL DEFAULT true,
  print_on_scan boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_role_id, category_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_rules TO authenticated;
GRANT ALL ON public.print_rules TO service_role;
ALTER TABLE public.print_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View print_rules" ON public.print_rules
  FOR SELECT TO authenticated
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'vendas')
              OR has_permission(auth.uid(), user_id, 'funcionarios')));

CREATE POLICY "Insert print_rules" ON public.print_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_owner_id(auth.uid())
              AND (is_owner_of(auth.uid(), user_id)
                   OR has_permission(auth.uid(), user_id, 'funcionarios')));

CREATE POLICY "Update print_rules" ON public.print_rules
  FOR UPDATE TO authenticated
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'funcionarios')));

CREATE POLICY "Delete print_rules" ON public.print_rules
  FOR DELETE TO authenticated
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'funcionarios')));

CREATE TRIGGER trg_print_rules_updated_at
  BEFORE UPDATE ON public.print_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();