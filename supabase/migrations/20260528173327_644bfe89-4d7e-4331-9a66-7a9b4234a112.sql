-- Add printed_at to track if a physical ticket was already issued
ALTER TABLE public.lojinha_order_units 
ADD COLUMN printed_at TIMESTAMP WITH TIME ZONE;

-- Create table for product-level print rules (exceptions)
CREATE TABLE public.print_rules_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- Owner ID
    user_role_id UUID NOT NULL, -- Staff role ID
    product_id UUID NOT NULL,
    print_on_sale BOOLEAN NOT NULL DEFAULT true,
    print_on_scan BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_role_id, product_id)
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_rules_products TO authenticated;
GRANT ALL ON public.print_rules_products TO service_role;

-- Enable RLS
ALTER TABLE public.print_rules_products ENABLE ROW LEVEL SECURITY;

-- Policies for print_rules_products
CREATE POLICY "View print_rules_products" ON public.print_rules_products
FOR SELECT TO authenticated
USING (user_id = get_owner_id(auth.uid()));

CREATE POLICY "Manage print_rules_products" ON public.print_rules_products
FOR ALL TO authenticated
USING (user_id = get_owner_id(auth.uid()))
WITH CHECK (user_id = get_owner_id(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER trg_print_rules_products_updated_at
BEFORE UPDATE ON public.print_rules_products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
