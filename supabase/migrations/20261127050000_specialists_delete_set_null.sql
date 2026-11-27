-- Allow deleting specialists by setting appointments.specialist_id to NULL instead of RESTRICT/NO ACTION
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_specialist_id_fkey;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_specialist_id_fkey
  FOREIGN KEY (specialist_id)
  REFERENCES public.specialists(id)
  ON DELETE SET NULL;
