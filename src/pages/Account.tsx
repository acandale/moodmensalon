import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PushNotificationBanner } from "@/components/notifications/PushNotificationBanner";

export default function Account() {
  const { user, profile, isLoading, refreshProfile } = useAuth();
  const { language } = useLanguage();
  const ro = language === "ro";
  const navigate = useNavigate();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [editPhone, setEditPhone] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      const parts = (profile.full_name || "").trim().split(/\s+/);
      setLastName(parts[0] || "");
      setFirstName(parts.slice(1).join(" "));
      setPhone(profile.phone || "");
    }
  }, [profile]);

  if (!isLoading && !user) return <Navigate to="/auth" replace />;

  const save = async () => {
    if (!user) return;
    if (!lastName.trim()) {
      toast.error(ro ? "Numele este obligatoriu" : "Last name is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: `${lastName.trim()} ${firstName.trim()}`.trim(), phone: phone.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(ro ? "Modificările au fost salvate" : "Changes saved");
      setEditPhone(false);
      refreshProfile();
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const userEmail = profile?.email || user?.email;
    if (!user || !userEmail) return;

    if (!currentPassword) {
      toast.error(ro ? "Introdu parola curentă" : "Please enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error(ro ? "Parola nouă trebuie să aibă cel puțin 6 caractere" : "New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(ro ? "Parolele noi nu coincid" : "New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error(ro ? "Parola nouă trebuie să fie diferită de cea curentă" : "New password must differ from current password");
      return;
    }

    setChangingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (verifyError) {
        toast.error(ro ? "Parola curentă este incorectă" : "Current password is incorrect");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(ro ? "Parola a fost schimbată cu succes" : "Password changed successfully");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-10 max-w-lg space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/dashboard"))}
              aria-label={ro ? "Înapoi" : "Back"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-3xl font-bold text-foreground">{ro ? "Detalii cont" : "Account details"}</h1>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>{ro ? "Nume" : "Last name"}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label>{ro ? "Prenume" : "First name"}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label>{ro ? "Telefon mobil" : "Mobile phone"}</Label>
              {editPhone ? (
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoFocus />
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-foreground">{phone || "—"}</span>
                  <button type="button" onClick={() => setEditPhone(true)} className="text-sm font-semibold text-primary">
                    {ro ? "Modifică" : "Change"}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{ro ? "Adresă e-mail" : "Email address"}</Label>
              <Input value={profile?.email || user?.email || ""} disabled />
            </div>
            <Button className="w-full rounded-full h-12 mt-4" onClick={save} disabled={saving}>
              {saving ? (ro ? "Se salvează..." : "Saving...") : ro ? "Salvează modificări" : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Change Password Section */}
        <Card variant="elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <KeyRound className="h-5 w-5 text-purple" />
              {ro ? "Schimbă parola" : "Change password"}
            </CardTitle>
            <CardDescription>
              {ro
                ? "Actualizează parola contului tău introducând parola curentă și noua parolă."
                : "Update your account password by entering your current password and a new one."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">{ro ? "Parola curentă" : "Current password"}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={ro ? "Arată/ascunde parola curentă" : "Show/hide current password"}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-new-password">{ro ? "Parola nouă" : "New password"}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="account-new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={ro ? "Arată/ascunde parola nouă" : "Show/hide new password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-confirm-password">{ro ? "Confirmă parola nouă" : "Confirm new password"}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="account-confirm-password"
                    type={showNewPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button type="submit" variant="hero" className="w-full rounded-full h-11" disabled={changingPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {ro ? "Se actualizează..." : "Updating..."}
                  </>
                ) : ro ? (
                  "Actualizează parola"
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <PushNotificationBanner />
        </div>
      </main>
    </div>
  );
}
