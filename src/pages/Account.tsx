import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-10 max-w-lg">
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

        <div className="mt-8">
          <PushNotificationBanner />
        </div>
      </main>
    </div>
  );
}
