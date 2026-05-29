-- 1. Garantir que o local 'Principal' existe e é o padrão
DO $$
DECLARE
    principal_id UUID;
BEGIN
    SELECT id INTO principal_id FROM public.stock_locations WHERE name = 'Principal' LIMIT 1;
    
    IF principal_id IS NULL THEN
        -- Se não existe 'Principal', tenta encontrar um com nome similar ou o padrão atual
        SELECT id INTO principal_id FROM public.stock_locations WHERE is_default = true OR name ILIKE '%principal%' LIMIT 1;
        
        IF principal_id IS NOT NULL THEN
            UPDATE public.stock_locations SET name = 'Principal', is_default = true WHERE id = principal_id;
        ELSE
            -- Cria um novo se realmente não encontrar nada
            INSERT INTO public.stock_locations (name, is_default, user_id) 
            SELECT 'Principal', true, user_id FROM public.stock_locations LIMIT 1
            RETURNING id INTO principal_id;
        END IF;
    ELSE
        UPDATE public.stock_locations SET is_default = true WHERE id = principal_id;
        UPDATE public.stock_locations SET is_default = false WHERE id <> principal_id;
    END IF;

    -- 2. Migrar quantidades de outros locais para o Principal
    -- Primeiro, insere registros de estoque para o local Principal onde eles não existem
    INSERT INTO public.product_stock (product_id, location_id, quantity, user_id)
    SELECT DISTINCT ps.product_id, principal_id, 0, ps.user_id
    FROM public.product_stock ps
    WHERE ps.location_id <> principal_id
    ON CONFLICT (product_id, location_id) DO NOTHING;

    -- Soma as quantidades no Principal
    UPDATE public.product_stock target
    SET quantity = target.quantity + sub.total_other
    FROM (
        SELECT product_id, SUM(quantity) as total_other
        FROM public.product_stock
        WHERE location_id <> principal_id
        GROUP BY product_id
    ) sub
    WHERE target.product_id = sub.product_id AND target.location_id = principal_id;

    -- 3. Deletar outros locais (e seus registros de estoque agora migrados)
    DELETE FROM public.product_stock WHERE location_id <> principal_id;
    DELETE FROM public.stock_locations WHERE id <> principal_id;

END $$;
