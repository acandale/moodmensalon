-- Add editable footer brand description to salon_settings
ALTER TABLE public.salon_settings
ADD COLUMN IF NOT EXISTS footer_description text NOT NULL DEFAULT 'Premium grooming services for the modern gentleman.';
