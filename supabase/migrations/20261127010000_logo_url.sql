-- Add editable logo icon URL / data URL to salon_settings
ALTER TABLE public.salon_settings
ADD COLUMN IF NOT EXISTS logo_url text;
