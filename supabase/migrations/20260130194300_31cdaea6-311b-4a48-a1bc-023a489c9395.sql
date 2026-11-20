-- Drop the restrictive SELECT policy that only allows users to view their own appointments
DROP POLICY IF EXISTS "Users can view their own appointments" ON public.appointments;

-- Create a new policy that allows all authenticated users to view all appointments (for slot availability)
CREATE POLICY "Authenticated users can view all appointments" 
ON public.appointments 
FOR SELECT 
TO authenticated
USING (true);

-- Enable realtime for the appointments table
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;