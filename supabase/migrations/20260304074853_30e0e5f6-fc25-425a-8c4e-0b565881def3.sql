
CREATE TABLE public.salon_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name text NOT NULL DEFAULT 'BarberPro',
  -- Hero Section
  hero_title text NOT NULL DEFAULT 'Stilul tău, la superlativ',
  hero_subtitle text NOT NULL DEFAULT 'Book your appointment in seconds. Experience premium haircuts and grooming services from skilled professionals.',
  hero_badge_text text NOT NULL DEFAULT 'Premium Grooming Experience',
  hero_image_url text,
  -- About Section
  about_title text NOT NULL DEFAULT 'Crafting Confidence, One Cut at a Time',
  about_description text NOT NULL DEFAULT 'With over a decade of experience in the industry, BarberPro has become synonymous with excellence in men''s grooming.',
  about_features jsonb NOT NULL DEFAULT '["Premium quality products", "Appointment flexibility", "Satisfaction guaranteed"]'::jsonb,
  about_cards jsonb NOT NULL DEFAULT '[{"icon":"Award","title":"Expert Barbers","description":"Our team consists of certified professionals with years of experience"},{"icon":"Users","title":"Personalized Service","description":"Every cut is tailored to your unique style and preferences"},{"icon":"Shield","title":"Hygiene First","description":"We maintain the highest standards of cleanliness and safety"}]'::jsonb,
  -- Footer
  footer_address text NOT NULL DEFAULT '123 Style Street, City',
  footer_phone text NOT NULL DEFAULT '(555) 123-4567',
  footer_email text NOT NULL DEFAULT 'hello@barberpro.com',
  footer_hours jsonb NOT NULL DEFAULT '[{"label":"Mon - Fri: 9AM - 6PM"},{"label":"Saturday: 9AM - 5PM"},{"label":"Sunday: Closed"}]'::jsonb,
  -- Quick Links
  quick_links jsonb NOT NULL DEFAULT '[{"label":"Services","href":"/#services"},{"label":"About Us","href":"/#about"},{"label":"Book Now","href":"/auth"}]'::jsonb,
  -- Stats
  hero_stats jsonb NOT NULL DEFAULT '[{"value":"500+","label":"Happy Clients"},{"value":"4.9","label":"Star Rating"}]'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.salon_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings (public landing page)
CREATE POLICY "Anyone can view salon settings"
ON public.salon_settings FOR SELECT
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update salon settings"
ON public.salon_settings FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert salon settings"
ON public.salon_settings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_salon_settings_updated_at
BEFORE UPDATE ON public.salon_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.salon_settings DEFAULT VALUES;
