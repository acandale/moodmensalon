import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendOtpRequest {
  email: string;
  userId: string;
  fullName: string;
}

const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured");
      throw new Error("Email service is not configured");
    }
    
    // Trim the API key to remove any whitespace or newlines
    const cleanApiKey = resendApiKey.trim();
    console.log("API key length:", cleanApiKey.length);

    const { email, userId, fullName }: SendOtpRequest = await req.json();

    console.log("Generating OTP for user:", userId, "email:", email);

    // Generate 6-digit OTP
    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete any existing OTP for this user
    await supabase
      .from("otp_verifications")
      .delete()
      .eq("user_id", userId);

    // Store OTP in database
    const { error: insertError } = await supabase
      .from("otp_verifications")
      .insert({
        user_id: userId,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
      throw new Error("Failed to store OTP");
    }

    console.log("OTP stored successfully, sending email...");

    // Send OTP email using Resend REST API
    const headers = new Headers();
    headers.set("Authorization", "Bearer " + cleanApiKey);
    headers.set("Content-Type", "application/json");
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        from: "BarberPro <onboarding@resend.dev>",
        to: [email],
        subject: "Your BarberPro Verification Code",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background-color: #001f3f; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">✂️ BarberPro</h1>
              </div>
              <div style="padding: 32px 24px;">
                <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 20px;">Hello ${fullName}!</h2>
                <p style="color: #52525b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">
                  Your verification code is:
                </p>
                <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #001f3f;">${otpCode}</span>
                </div>
                <p style="color: #71717a; margin: 0; font-size: 14px; line-height: 1.5;">
                  This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
                </p>
              </div>
              <div style="background-color: #f4f4f5; padding: 16px 24px; text-align: center;">
                <p style="color: #a1a1aa; margin: 0; font-size: 12px;">
                  © ${new Date().getFullYear()} BarberPro. All rights reserved.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const emailResult = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error("Error sending email:", emailResult);
      
      // Check if it's a domain verification error
      if (emailResult.message?.includes("testing emails") || emailResult.message?.includes("verify a domain")) {
        throw new Error("Email service requires domain verification. Please contact support or verify your domain at resend.com/domains");
      }
      
      throw new Error(emailResult.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailResult);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-otp function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
