import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VerifyOtpRequest {
  userId: string;
  otpCode: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, otpCode }: VerifyOtpRequest = await req.json();

    console.log("Verifying OTP for user:", userId);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the OTP record
    const { data: otpRecord, error: fetchError } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("user_id", userId)
      .eq("verified", false)
      .single();

    if (fetchError || !otpRecord) {
      console.error("OTP not found:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "No pending verification found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if OTP has expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      console.log("OTP expired");
      return new Response(
        JSON.stringify({ success: false, error: "Verification code has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if OTP matches
    console.log("Stored OTP:", otpRecord.otp_code, "Type:", typeof otpRecord.otp_code);
    console.log("Received OTP:", otpCode, "Type:", typeof otpCode);
    
    // Ensure string comparison
    if (String(otpRecord.otp_code).trim() !== String(otpCode).trim()) {
      console.log("OTP mismatch - stored:", otpRecord.otp_code, "received:", otpCode);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid verification code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("OTP matched! Updating verification status...");

    // Mark OTP as verified
    const { error: otpUpdateError } = await supabase
      .from("otp_verifications")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    if (otpUpdateError) {
      console.error("Error updating OTP record:", otpUpdateError);
    }

    // Update profile to mark as verified
    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({ is_verified: true })
      .eq("id", userId)
      .select()
      .single();

    if (profileError) {
      console.error("Error updating profile:", profileError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update verification status" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Profile updated successfully:", updatedProfile);
    console.log("OTP verified successfully for user:", userId);

    return new Response(JSON.stringify({ success: true, verified: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in verify-otp function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
