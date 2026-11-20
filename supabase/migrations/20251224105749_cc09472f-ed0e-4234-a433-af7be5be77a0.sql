-- Allow service role to delete OTP records (for cleanup before creating new ones)
-- The edge functions use service role key, which bypasses RLS
-- But we need to add a delete policy for users to clean up their own OTPs if needed

CREATE POLICY "Users can delete their own OTP" 
ON public.otp_verifications 
FOR DELETE 
USING (auth.uid() = user_id);