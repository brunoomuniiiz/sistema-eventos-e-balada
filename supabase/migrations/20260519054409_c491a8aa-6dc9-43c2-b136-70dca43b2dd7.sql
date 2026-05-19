CREATE OR REPLACE FUNCTION public.get_sector_statuses()
RETURNS SETOF public.cash_register_sectors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF _owner IS NULL THEN RETURN; END IF;
  PERFORM public._ensure_sector_row(_owner, 'bar');
  PERFORM public._ensure_sector_row(_owner, 'portaria');
  RETURN QUERY SELECT * FROM public.cash_register_sectors
    WHERE user_id = _owner ORDER BY sector;
END $$;