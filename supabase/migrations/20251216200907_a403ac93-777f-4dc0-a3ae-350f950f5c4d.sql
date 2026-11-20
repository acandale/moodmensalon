
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'client',
  UNIQUE (user_id, role)
);

-- Create services table
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create work_hours table
CREATE TABLE public.work_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_working_day BOOLEAN DEFAULT true,
  UNIQUE (day_of_week)
);

-- Create blocked_times table for admin breaks
CREATE TABLE public.blocked_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create OTP verification table
CREATE TABLE public.otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Services policies (public read, admin write)
CREATE POLICY "Anyone can view services" ON public.services
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage services" ON public.services
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Appointments policies
CREATE POLICY "Users can view their own appointments" ON public.appointments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own appointments" ON public.appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own appointments" ON public.appointments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all appointments" ON public.appointments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all appointments" ON public.appointments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Work hours policies (public read, admin write)
CREATE POLICY "Anyone can view work hours" ON public.work_hours
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage work hours" ON public.work_hours
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Blocked times policies
CREATE POLICY "Anyone can view blocked times" ON public.blocked_times
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage blocked times" ON public.blocked_times
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- OTP policies
CREATE POLICY "Users can view their own OTP" ON public.otp_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OTP" ON public.otp_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OTP" ON public.otp_verifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'phone', '')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default services
INSERT INTO public.services (name, duration_minutes, price, description) VALUES
  ('Premium Haircut', 60, 45.00, 'Full service premium haircut with styling and hot towel treatment'),
  ('Standard Haircut', 45, 30.00, 'Classic haircut with precision styling'),
  ('Beard Trim', 15, 15.00, 'Professional beard shaping and trimming');

-- Insert default work hours (Mon-Sat 9AM-6PM)
INSERT INTO public.work_hours (day_of_week, start_time, end_time, is_working_day) VALUES
  (0, '09:00', '18:00', false),  -- Sunday (closed)
  (1, '09:00', '18:00', true),   -- Monday
  (2, '09:00', '18:00', true),   -- Tuesday
  (3, '09:00', '18:00', true),   -- Wednesday
  (4, '09:00', '18:00', true),   -- Thursday
  (5, '09:00', '18:00', true),   -- Friday
  (6, '09:00', '17:00', true);   -- Saturday
