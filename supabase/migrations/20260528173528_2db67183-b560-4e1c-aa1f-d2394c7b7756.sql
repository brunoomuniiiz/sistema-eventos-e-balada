CREATE OR REPLACE FUNCTION public.mark_units_printed(_qr_tokens TEXT[])
RETURNS VOID AS $$
BEGIN
    UPDATE public.lojinha_order_units
    SET printed_at = now()
    WHERE qr_token = ANY(_qr_tokens);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_units_printed(TEXT[]) TO authenticated;
