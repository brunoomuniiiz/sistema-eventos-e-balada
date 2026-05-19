
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  -- Se o usuário foi convidado como staff, não criar bar próprio
  IF (NEW.raw_user_meta_data->>'invited_by') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, owner_id, role, display_name, email)
    VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
    PERFORM public.seed_default_cost_categories(NEW.id);
    PERFORM public.seed_default_bar_expense_categories(NEW.id);
    PERFORM public.seed_default_product_categories(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Limpa linhas owner duplicadas para quem também é staff em outro bar
DELETE FROM public.user_roles a
WHERE a.role = 'owner'
  AND EXISTS (
    SELECT 1 FROM public.user_roles b
    WHERE b.user_id = a.user_id
      AND b.role = 'staff'
      AND b.owner_id <> a.user_id
  );
