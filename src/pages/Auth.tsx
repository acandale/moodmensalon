import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Scissors, ArrowLeft, Mail, Lock, User, Phone, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";

const DEVICE_ID_KEY = "barber_device_id";
const REGISTERED_DEVICE_KEY = "barber_registered_device";

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

const getOrCreateDeviceId = (): string => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const hasDeviceRegistered = (): boolean => {
  return localStorage.getItem(REGISTERED_DEVICE_KEY) === "true";
};

const markDeviceAsRegistered = () => {
  localStorage.setItem(REGISTERED_DEVICE_KEY, "true");
};

const generatePin = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup" | "verify">(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [isLoading, setIsLoading] = useState(false);
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
  const [deviceRestricted, setDeviceRestricted] = useState(false);

  const { signIn, signUp, user, isLoading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    getOrCreateDeviceId();
    if (hasDeviceRegistered() && mode === "signup") {
      setDeviceRestricted(true);
    }
  }, [mode]);

  useEffect(() => {
    if (!authLoading && user && mode !== "verify") {
      checkUserVerification();
    }
  }, [user, authLoading, mode]);

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

    if (mode === "signup" && hasDeviceRegistered()) {
      setDeviceRestricted(true);
      toast({
        title: t("auth.deviceLimit"),
        description: t("auth.deviceLimitDesc"),
        variant: "destructive",
      });
      return;
    }

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
          markDeviceAsRegistered();
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
            {deviceRestricted && mode === "signup" && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("auth.deviceWarning")}
                </AlertDescription>
              </Alert>
            )}

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
                        disabled={deviceRestricted}
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
                        disabled={deviceRestricted}
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
                    disabled={mode === "signup" && deviceRestricted}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="pl-10"
                    disabled={mode === "signup" && deviceRestricted}
                  />
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
                disabled={isLoading || (mode === "signup" && deviceRestricted)}
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
                      onClick={() => {
                        setMode("signin");
                        setDeviceRestricted(false);
                      }}
                      className="text-purple hover:text-purple-light font-medium transition-colors"
                    >
                      {t("auth.signInLink")}
                    </button>
                  </>
                ) : (
                  <>
                    {t("auth.noAccount")}{" "}
                    <button
                      onClick={() => {
                        setMode("signup");
                        if (hasDeviceRegistered()) {
                          setDeviceRestricted(true);
                        }
                      }}
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
