import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Scissors, ArrowLeft, Mail, Lock, User, Phone, Loader2, ShieldCheck, AlertTriangle, Eye, EyeOff, KeyRound, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";

const signUpSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(10, "Please enter a valid phone number").max(20),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const generatePin = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

type AuthMode = "signin" | "signup" | "verify" | "forgot" | "reset";

interface RecoveryUrlState {
  hasAccessToken: boolean;
  code: string | null;
  tokenHash: string | null;
  urlType: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

const EMPTY_RECOVERY_URL_STATE: RecoveryUrlState = {
  hasAccessToken: false,
  code: null,
  tokenHash: null,
  urlType: null,
  errorCode: null,
  errorDescription: null,
};

const parseRecoveryUrlState = (): RecoveryUrlState => {
  if (typeof window === "undefined") {
    return EMPTY_RECOVERY_URL_STATE;
  }
  const search = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hash = new URLSearchParams(rawHash);

  return {
    hasAccessToken: hash.has("access_token") || search.has("access_token"),
    code: search.get("code"),
    tokenHash: search.get("token_hash") || hash.get("token_hash"),
    urlType: search.get("type") || hash.get("type"),
    errorCode:
      search.get("error_code") ||
      hash.get("error_code") ||
      search.get("error") ||
      hash.get("error"),
    errorDescription:
      search.get("error_description") || hash.get("error_description"),
  };
};

export default function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { signIn, signUp, user, session, isLoading: authLoading, isPasswordRecovery, clearPasswordRecovery, refreshProfile } = useAuth();
  const [initialRecoveryUrl, setInitialRecoveryUrl] = useState<RecoveryUrlState>(parseRecoveryUrlState);
  const initialModeParam = searchParams.get("mode");
  const hasRecoveryInUrl =
    initialModeParam === "reset" ||
    initialRecoveryUrl.urlType === "recovery" ||
    Boolean(initialRecoveryUrl.tokenHash);

  const [mode, setMode] = useState<AuthMode>(
    hasRecoveryInUrl || isPasswordRecovery
      ? "reset"
      : initialModeParam === "signup"
      ? "signup"
      : initialModeParam === "forgot"
      ? "forgot"
      : "signin"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [verifyingRecovery, setVerifyingRecovery] = useState<boolean>(() => {
    const parsed = parseRecoveryUrlState();
    return (
      !parsed.errorCode &&
      !parsed.errorDescription &&
      (parsed.hasAccessToken || Boolean(parsed.code) || Boolean(parsed.tokenHash))
    );
  });
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null);
  const attemptedTokenExchangeRef = useRef(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinValue, setPinValue] = useState("");
  const [displayedPin, setDisplayedPin] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const isRo = language === "ro";

  useEffect(() => {
    localStorage.removeItem("barber_registered_device");
  }, []);

  useEffect(() => {
    if (isPasswordRecovery || searchParams.get("mode") === "reset") {
      setMode("reset");
    }
  }, [isPasswordRecovery, searchParams]);

  useEffect(() => {
    if (mode !== "reset") return;

    if (session) {
      setVerifyingRecovery(false);
      setRecoveryLinkError(null);
      return;
    }

    if (initialRecoveryUrl.errorCode || initialRecoveryUrl.errorDescription) {
      setVerifyingRecovery(false);
      const isExpired =
        initialRecoveryUrl.errorCode === "otp_expired" ||
        initialRecoveryUrl.errorDescription?.toLowerCase().includes("expired") ||
        initialRecoveryUrl.errorDescription?.toLowerCase().includes("invalid");
      setRecoveryLinkError(
        isExpired
          ? isRo
            ? "Linkul de resetare a expirat sau a fost deja folosit (linkurile sunt de unică folosință). Solicită un link nou mai jos."
            : "The reset link has expired or was already used (links are single-use). Please request a new link below."
          : initialRecoveryUrl.errorDescription || null
      );
      return;
    }

    if (authLoading) return;

    let cancelled = false;

    if (initialRecoveryUrl.tokenHash && !attemptedTokenExchangeRef.current) {
      attemptedTokenExchangeRef.current = true;
      setVerifyingRecovery(true);
      supabase.auth
        .verifyOtp({
          token_hash: initialRecoveryUrl.tokenHash,
          type: "recovery",
        })
        .then(({ error }) => {
          if (cancelled) return;
          if (error) {
            setRecoveryLinkError(
              isRo
                ? "Linkul de resetare este invalid sau a expirat. Solicită un link nou."
                : error.message
            );
          } else {
            setSearchParams({ mode: "reset" }, { replace: true });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setVerifyingRecovery(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    if (initialRecoveryUrl.code && !attemptedTokenExchangeRef.current) {
      attemptedTokenExchangeRef.current = true;
      setVerifyingRecovery(true);
      supabase.auth
        .exchangeCodeForSession(initialRecoveryUrl.code)
        .then(({ error }) => {
          if (cancelled) return;
          if (error) {
            setRecoveryLinkError(
              isRo
                ? "Linkul de resetare nu a putut fi verificat sau a expirat (deschide linkul din același browser în care l-ai solicitat sau solicită unul nou)."
                : error.message
            );
          } else {
            setSearchParams({ mode: "reset" }, { replace: true });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setVerifyingRecovery(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    if (initialRecoveryUrl.hasAccessToken) {
      const timer = setTimeout(() => {
        if (!cancelled) {
          setVerifyingRecovery(false);
        }
      }, 1500);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    setVerifyingRecovery(false);
  }, [mode, session, authLoading, initialRecoveryUrl, isRo, setSearchParams]);

  useEffect(() => {
    if (!authLoading && user && (mode === "signin" || mode === "signup") && !isPasswordRecovery) {
      checkUserVerification();
    }
  }, [user, authLoading, mode, isPasswordRecovery]);

  const checkUserVerification = async () => {
    if (!user) return;
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_verified")
      .eq("id", user.id)
      .single();
    
    if (profile?.is_verified) {
      navigate("/dashboard");
    } else {
      setPendingUserId(user.id);
      showPinVerification();
    }
  };

  const showPinVerification = () => {
    const pin = generatePin();
    setDisplayedPin(pin);
    setMode("verify");
    
    toast({
      title: t("auth.securityPin"),
      description: `${t("auth.verificationCode")} ${pin}`,
      duration: 30000,
    });
  };

  const verifyPin = async () => {
    if (!pendingUserId || pinValue.length !== 4) return;

    if (pinValue !== displayedPin) {
      toast({
        title: t("auth.invalidPin"),
        description: t("auth.invalidPinDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_verified: true })
        .eq("id", pendingUserId);

      if (error) throw error;

      await refreshProfile();

      toast({
        title: t("auth.verified"),
        description: t("auth.verifiedDesc"),
      });
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error verifying:", error);
      toast({
        title: t("auth.verificationFailed"),
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const regeneratePin = () => {
    const pin = generatePin();
    setDisplayedPin(pin);
    setPinValue("");
    
    toast({
      title: t("auth.newSecurityPin"),
      description: `${t("auth.verificationCode")} ${pin}`,
      duration: 30000,
    });
  };

  const validateForm = () => {
    try {
      if (mode === "signup") {
        signUpSchema.parse(formData);
      } else {
        signInSchema.parse(formData);
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (mode === "signup") {
        const { error, data } = await signUp(
          formData.email,
          formData.password,
          formData.fullName,
          formData.phone
        );

        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              title: t("auth.accountExists"),
              description: t("auth.accountExistsDesc"),
              variant: "destructive",
            });
          } else {
            toast({
              title: t("auth.signUpFailed"),
              description: error.message,
              variant: "destructive",
            });
          }
        } else if (data?.user) {
          setPendingUserId(data.user.id);
          showPinVerification();
        }
      } else {
        const { error, data } = await signIn(formData.email, formData.password);

        if (error) {
          toast({
            title: t("auth.signInFailed"),
            description: t("auth.signInFailedDesc"),
            variant: "destructive",
          });
        } else if (data?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_verified, full_name")
            .eq("id", data.user.id)
            .single();
          
          if (profile?.is_verified) {
            navigate("/dashboard");
          } else {
            setPendingUserId(data.user.id);
            showPinVerification();
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  // PIN Verification Screen
  if (mode === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
        <div className="absolute top-20 left-10 w-32 h-32 bg-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple/10 rounded-full blur-3xl" />

        <div className="w-full max-w-md relative">
          <Card variant="elevated" className="border-0 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 p-3 rounded-xl bg-navy shadow-md">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">{t("auth.pinVerification")}</CardTitle>
              <CardDescription>
                {t("auth.pinDescription")}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <Alert className="bg-primary/10 border-primary">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-center">
                  <span className="block text-sm text-muted-foreground mb-2">
                    {t("auth.verificationCode")}
                  </span>
                  <span className="block text-3xl font-bold tracking-[0.5em] text-primary">
                    {displayedPin}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-2">
                    {t("auth.testingMode")}
                  </span>
                </AlertDescription>
              </Alert>

              <div className="flex justify-center">
                <InputOTP
                  maxLength={4}
                  value={pinValue}
                  onChange={(value) => setPinValue(value)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                variant="hero"
                className="w-full"
                size="lg"
                disabled={isLoading || pinValue.length !== 4}
                onClick={verifyPin}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("auth.verifying")}
                  </>
                ) : (
                  t("auth.verifyPin")
                )}
              </Button>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("auth.needNewCode")}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={regeneratePin}
                  disabled={isLoading}
                >
                  {t("auth.generateNew")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const sendResetCode = async (emailTrimmed: string) => {
    setErrors({});
    setIsLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth?mode=reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
        redirectTo,
      });

      if (error) {
        toast({
          title: isRo ? "Eroare la trimitere" : "Could not send reset code",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setResetEmailSent(true);
      toast({
        title: isRo ? "Email de resetare trimis" : "Reset email sent",
        description: isRo
          ? `Verifică emailul ${emailTrimmed} pentru linkul sau codul de resetare.`
          : `Check ${emailTrimmed} for your password reset link or code.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailTrimmed = formData.email.trim();
    const emailResult = z.string().email().safeParse(emailTrimmed);
    if (!emailResult.success) {
      setErrors({
        email: isRo ? "Te rugăm să introduci o adresă de email validă" : "Please enter a valid email address",
      });
      return;
    }

    await sendResetCode(emailTrimmed);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (newPassword.length < 6) {
      nextErrors.newPassword = isRo
        ? "Parola nouă trebuie să aibă cel puțin 6 caractere"
        : "New password must be at least 6 characters";
    }
    if (newPassword !== confirmNewPassword) {
      nextErrors.confirmNewPassword = isRo
        ? "Parolele nu coincid"
        : "Passwords do not match";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({
          title: isRo ? "Eroare la resetarea parolei" : "Password reset failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      clearPasswordRecovery();
      setNewPassword("");
      setConfirmNewPassword("");
      toast({
        title: isRo ? "Parolă actualizată" : "Password updated",
        description: isRo
          ? "Parola ta a fost resetată cu succes."
          : "Your password has been reset successfully.",
      });

      if (user) {
        setSearchParams({}, { replace: true });
        navigate("/dashboard", { replace: true });
      } else {
        setMode("signin");
        setSearchParams({}, { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (mode === "forgot") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
        <div className="absolute top-20 left-10 w-32 h-32 bg-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple/10 rounded-full blur-3xl" />

        <div className="w-full max-w-md relative">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setResetEmailSent(false);
              setNewPassword("");
              setConfirmNewPassword("");
              setErrors({});
            }}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {isRo ? "Înapoi la autentificare" : "Back to sign in"}
          </button>

          <Card variant="elevated" className="border-0 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 p-3 rounded-xl bg-navy shadow-md">
                <KeyRound className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">
                {isRo ? "Resetare parolă" : "Reset password"}
              </CardTitle>
              <CardDescription>
                {resetEmailSent
                  ? isRo
                    ? "Verifică inbox-ul și deschide cel mai nou email primit."
                    : "Check your inbox and open the latest email you received."
                  : isRo
                  ? "Introdu adresa de email pentru a primi linkul de resetare a parolei."
                  : "Enter your email address to receive a password reset link."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {resetEmailSent ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-purple/25 bg-purple/5 p-4 text-sm text-foreground flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-purple shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <p className="font-medium">
                        {isRo
                          ? `Link de resetare trimis${formData.email.trim() ? ` către ${formData.email.trim()}` : ""}`
                          : `Reset link sent${formData.email.trim() ? ` to ${formData.email.trim()}` : ""}`}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {isRo
                          ? "Deschide cel mai nou email și apasă pe butonul „Reset Password” pentru a alege o parolă nouă. Dacă nu îl vezi în Inbox, verifică și folderul Spam."
                          : "Open the latest email and click the \"Reset Password\" button to choose a new password. Also check your Spam folder."}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="hero"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                    onClick={() => {
                      const emailTrimmed = formData.email.trim();
                      if (z.string().email().safeParse(emailTrimmed).success) {
                        sendResetCode(emailTrimmed);
                      } else {
                        setResetEmailSent(false);
                      }
                    }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isRo ? "Se retrimite..." : "Resending..."}
                      </>
                    ) : isRo ? (
                      "Retrimite emailul de resetare"
                    ) : (
                      "Resend reset email"
                    )}
                  </Button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmailSent(false);
                        setErrors({});
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {isRo ? "Folosește altă adresă de email" : "Use a different email address"}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">{t("auth.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="pl-10"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>

                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isRo ? "Se trimite..." : "Sending..."}
                      </>
                    ) : isRo ? (
                      "Trimite link de resetare"
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    const waitingForCodeExchange = !session && (authLoading || verifyingRecovery);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
        <div className="absolute top-20 left-10 w-32 h-32 bg-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple/10 rounded-full blur-3xl" />

        <div className="w-full max-w-md relative">
          <Card variant="elevated" className="border-0 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 p-3 rounded-xl bg-navy shadow-md">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">
                {isRo ? "Setează o parolă nouă" : "Set a new password"}
              </CardTitle>
              <CardDescription>
                {isRo
                  ? "Alege o parolă nouă pentru contul tău."
                  : "Choose a new password for your account."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {waitingForCodeExchange ? (
                <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-purple" />
                  <p className="text-sm">{isRo ? "Se verifică linkul de resetare..." : "Verifying reset link..."}</p>
                </div>
              ) : !session ? (
                <div className="space-y-4 text-center py-2">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {recoveryLinkError ||
                        (isRo
                          ? "Linkul de resetare este invalid sau a expirat. Solicită un link nou."
                          : "The reset link is invalid or has expired. Please request a new link.")}
                    </AlertDescription>
                  </Alert>
                  <Button
                    type="button"
                    variant="hero"
                    className="w-full"
                    onClick={() => {
                      clearPasswordRecovery();
                      setRecoveryLinkError(null);
                      setInitialRecoveryUrl(EMPTY_RECOVERY_URL_STATE);
                      attemptedTokenExchangeRef.current = false;
                      setVerifyingRecovery(false);
                      setResetEmailSent(false);
                      setMode("forgot");
                      setSearchParams({}, { replace: true });
                    }}
                  >
                    {isRo ? "Solicită un link nou" : "Request a new link"}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{isRo ? "Parola nouă" : "New password"}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={isRo ? "Arată/ascunde parola" : "Show/hide password"}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.newPassword && (
                      <p className="text-sm text-destructive">{errors.newPassword}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">{isRo ? "Confirmă parola nouă" : "Confirm new password"}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-new-password"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {errors.confirmNewPassword && (
                      <p className="text-sm text-destructive">{errors.confirmNewPassword}</p>
                    )}
                  </div>

                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isRo ? "Se salvează..." : "Saving..."}
                      </>
                    ) : isRo ? (
                      "Salvează parola nouă"
                    ) : (
                      "Save new password"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <div className="absolute top-20 left-10 w-32 h-32 bg-purple/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("auth.backHome")}
        </Link>

        <Card variant="elevated" className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 p-3 rounded-xl bg-navy shadow-md">
              <Scissors className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">
              {mode === "signup" ? t("auth.createAccount") : t("auth.welcomeBack")}
            </CardTitle>
            <CardDescription>
              {mode === "signup"
                ? t("auth.startBooking")
                : t("auth.signInManage")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        placeholder="John Doe"
                        value={formData.fullName}
                        onChange={(e) =>
                          setFormData({ ...formData, fullName: e.target.value })
                        }
                        className="pl-10"
                      />
                    </div>
                    {errors.fullName && (
                      <p className="text-sm text-destructive">{errors.fullName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("auth.phoneNumber")}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="pl-10"
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-destructive">{errors.phone}</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="pl-10"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrors({});
                        setResetEmailSent(false);
                        setMode("forgot");
                      }}
                      className="text-xs text-purple hover:text-purple-light font-medium transition-colors"
                    >
                      {isRo ? "Ai uitat parola?" : "Forgot password?"}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={isRo ? "Arată/ascunde parola" : "Show/hide password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <Button
                type="submit"
                variant="hero"
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "signup" ? t("auth.creatingAccount") : t("auth.signingIn")}
                  </>
                ) : mode === "signup" ? (
                  t("auth.createAccountBtn")
                ) : (
                  t("auth.signInBtn")
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {mode === "signup" ? (
                  <>
                    {t("auth.alreadyAccount")}{" "}
                    <button
                      onClick={() => setMode("signin")}
                      className="text-purple hover:text-purple-light font-medium transition-colors"
                    >
                      {t("auth.signInLink")}
                    </button>
                  </>
                ) : (
                  <>
                    {t("auth.noAccount")}{" "}
                    <button
                      onClick={() => setMode("signup")}
                      className="text-purple hover:text-purple-light font-medium transition-colors"
                    >
                      {t("auth.signUpLink")}
                    </button>
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
