ALTER TABLE public.bar_settings
  ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Space Grotesk',
  ADD COLUMN IF NOT EXISTS theme_mode text DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS button_color text;