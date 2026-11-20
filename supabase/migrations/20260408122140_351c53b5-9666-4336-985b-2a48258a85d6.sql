
-- Add 'specialist' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'specialist';

-- Add user_id to specialists table to link to auth user
ALTER TABLE public.specialists ADD COLUMN user_id uuid UNIQUE;

-- Create index for fast lookup
CREATE INDEX idx_specialists_user_id ON public.specialists(user_id);
