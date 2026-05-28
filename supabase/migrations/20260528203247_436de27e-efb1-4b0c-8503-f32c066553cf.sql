-- Remover restrição de NOT NULL de promoter_id na tabela event_promoters
ALTER TABLE public.event_promoters ALTER COLUMN promoter_id DROP NOT NULL;
