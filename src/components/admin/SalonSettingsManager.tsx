import { useState, useEffect, useRef, ChangeEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Plus, Trash2, ImagePlus, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSalonSettings, useUpdateSalonSettings, SalonSettings } from "@/hooks/useSalonSettings";
import { useLanguage } from "@/hooks/useLanguage";
import { Separator } from "@/components/ui/separator";
import { SalonGalleryManager } from "./SalonGalleryManager";
import { compressLogoFile } from "@/lib/salon-gallery";
import moodLogoSrc from "@/assets/mood_logo.png";

export function SalonSettingsManager() {
  const { data: settings, isLoading } = useSalonSettings();
  const updateMutation = useUpdateSalonSettings();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [form, setForm] = useState<Partial<SalonSettings>>({});
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleLogoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("dashboard.error"),
        description: "Te rugăm să selectezi un fișier imagine (PNG, JPG, WebP, SVG).",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingLogo(true);
    try {
      const dataUrl = await compressLogoFile(file);
      setForm((prev) => ({ ...prev, logo_url: dataUrl }));
      await updateMutation.mutateAsync({ logo_url: dataUrl });
      toast({
        title: t("settingsManager.logoSaved"),
        description: t("settingsManager.savedDesc"),
      });
    } catch (err) {
      console.error("Error updating logo:", err);
      toast({
        title: t("dashboard.error"),
        description: err instanceof Error ? err.message : t("settingsManager.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setIsProcessingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleResetLogo = async () => {
    setIsProcessingLogo(true);
    try {
      setForm((prev) => ({ ...prev, logo_url: null }));
      await updateMutation.mutateAsync({ logo_url: null });
      toast({
        title: t("settingsManager.logoSaved"),
        description: t("settingsManager.savedDesc"),
      });
    } catch (err) {
      console.error("Error resetting logo:", err);
      toast({
        title: t("dashboard.error"),
        description: err instanceof Error ? err.message : t("settingsManager.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const handleSave = async () => {
    try {
      const { id, created_at, updated_at, ...updates } = form as SalonSettings & {
        created_at?: string;
        updated_at?: string;
      };
      void id;
      void created_at;
      void updated_at;
      await updateMutation.mutateAsync(updates);
      toast({ title: t("settingsManager.saved"), description: t("settingsManager.savedDesc") });
    } catch (err) {
      console.error("Error saving salon settings:", err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      toast({
        title: t("dashboard.error"),
        description: msg || t("settingsManager.saveFailed"),
        variant: "destructive",
      });
    }
  };

  const updateFeature = (index: number, value: string) => {
    const features = [...(form.about_features || [])];
    features[index] = value;
    setForm({ ...form, about_features: features });
  };

  const addFeature = () => {
    setForm({ ...form, about_features: [...(form.about_features || []), ""] });
  };

  const removeFeature = (index: number) => {
    const features = (form.about_features || []).filter((_, i) => i !== index);
    setForm({ ...form, about_features: features });
  };

  const updateQuickLink = (index: number, field: "label" | "href", value: string) => {
    const links = [...(form.quick_links || [])];
    links[index] = { ...links[index], [field]: value };
    setForm({ ...form, quick_links: links });
  };

  const addQuickLink = () => {
    setForm({ ...form, quick_links: [...(form.quick_links || []), { label: "", href: "" }] });
  };

  const removeQuickLink = (index: number) => {
    const links = (form.quick_links || []).filter((_, i) => i !== index);
    setForm({ ...form, quick_links: links });
  };

  const updateHour = (index: number, value: string) => {
    const hours = [...(form.footer_hours || [])];
    hours[index] = { label: value };
    setForm({ ...form, footer_hours: hours });
  };

  const addHour = () => {
    setForm({ ...form, footer_hours: [...(form.footer_hours || []), { label: "" }] });
  };

  const removeHour = (index: number) => {
    const hours = (form.footer_hours || []).filter((_, i) => i !== index);
    setForm({ ...form, footer_hours: hours });
  };

  const updateStat = (index: number, field: "value" | "label", value: string) => {
    const stats = [...(form.hero_stats || [])];
    stats[index] = { ...stats[index], [field]: value };
    setForm({ ...form, hero_stats: stats });
  };

  const updateAboutCard = (index: number, field: "title" | "description" | "icon", value: string) => {
    const cards = [...(form.about_cards || [])];
    cards[index] = { ...cards[index], [field]: value };
    setForm({ ...form, about_cards: cards });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("settingsManager.saveAll")}
        </Button>
      </div>

      {/* General */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t("settingsManager.general")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("settingsManager.salonName")}</Label>
            <Input value={form.salon_name || ""} onChange={(e) => setForm({ ...form, salon_name: e.target.value })} />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>{t("settingsManager.logoIcon")}</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex items-center gap-2.5 rounded-lg bg-navy px-3.5 py-2.5 border border-white/10">
                <img
                  src={form.logo_url || moodLogoSrc}
                  alt="Logo preview"
                  className="h-10 w-10 rounded-lg object-cover shrink-0"
                />
                <span className="font-bold text-lg text-white tracking-tight">
                  {form.salon_name || "MOOD MEN SALON"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessingLogo || updateMutation.isPending}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {isProcessingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {t("settingsManager.uploadLogo")}
                </Button>

                {form.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isProcessingLogo || updateMutation.isPending}
                    onClick={handleResetLogo}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("settingsManager.resetLogo")}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settingsManager.logoHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Hero Section */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t("settingsManager.heroSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("settingsManager.badgeText")}</Label>
            <Input value={form.hero_badge_text || ""} onChange={(e) => setForm({ ...form, hero_badge_text: e.target.value })} />
          </div>
          <div>
            <Label>{t("settingsManager.title")}</Label>
            <Input value={form.hero_title || ""} onChange={(e) => setForm({ ...form, hero_title: e.target.value })} />
          </div>
          <div>
            <Label>{t("settingsManager.subtitle")}</Label>
            <Textarea value={form.hero_subtitle || ""} onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })} />
          </div>

          <Separator />
          <Label className="text-base font-semibold">{t("settingsManager.stats")}</Label>
          {(form.hero_stats || []).map((stat, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>{t("settingsManager.value")}</Label>
                <Input value={stat.value} onChange={(e) => updateStat(i, "value", e.target.value)} />
              </div>
              <div className="flex-1">
                <Label>{t("settingsManager.label")}</Label>
                <Input value={stat.label} onChange={(e) => updateStat(i, "label", e.target.value)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Salon Photo Grid */}
      <SalonGalleryManager
        controlledValue={form.hero_image_url ?? ""}
        onControlledChange={(serialized) => setForm((prev) => ({ ...prev, hero_image_url: serialized }))}
      />

      {/* About Section */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t("settingsManager.aboutSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("settingsManager.title")}</Label>
            <Input value={form.about_title || ""} onChange={(e) => setForm({ ...form, about_title: e.target.value })} />
          </div>
          <div>
            <Label>{t("settingsManager.description")}</Label>
            <Textarea value={form.about_description || ""} onChange={(e) => setForm({ ...form, about_description: e.target.value })} />
          </div>

          <Separator />
          <Label className="text-base font-semibold">{t("settingsManager.featureList")}</Label>
          {(form.about_features || []).map((feature, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={feature} onChange={(e) => updateFeature(i, e.target.value)} className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => removeFeature(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addFeature}>
            <Plus className="h-4 w-4" /> {t("settingsManager.addFeature")}
          </Button>

          <Separator />
          <Label className="text-base font-semibold">{t("settingsManager.featureCards")}</Label>
          {(form.about_cards || []).map((card, i) => (
            <div key={i} className="space-y-2 p-4 border rounded-lg">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("settingsManager.icon")}</Label>
                  <Input value={card.icon} onChange={(e) => updateAboutCard(i, "icon", e.target.value)} />
                </div>
                <div>
                  <Label>{t("settingsManager.title")}</Label>
                  <Input value={card.title} onChange={(e) => updateAboutCard(i, "title", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{t("settingsManager.description")}</Label>
                <Textarea value={card.description} onChange={(e) => updateAboutCard(i, "description", e.target.value)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Footer */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t("settingsManager.footerContact")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("settingsManager.footerDescription")}</Label>
            <Textarea
              value={form.footer_description ?? ""}
              onChange={(e) => setForm({ ...form, footer_description: e.target.value })}
              placeholder="Premium grooming services for the modern gentleman."
              rows={2}
            />
          </div>
          <div>
            <Label>{t("settingsManager.address")}</Label>
            <Input value={form.footer_address || ""} onChange={(e) => setForm({ ...form, footer_address: e.target.value })} />
          </div>
          <div>
            <Label>{t("settingsManager.phone")}</Label>
            <Input value={form.footer_phone || ""} onChange={(e) => setForm({ ...form, footer_phone: e.target.value })} />
          </div>
          <div>
            <Label>{t("settingsManager.emailLabel")}</Label>
            <Input value={form.footer_email || ""} onChange={(e) => setForm({ ...form, footer_email: e.target.value })} />
          </div>

        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t("settingsManager.quickLinks")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(form.quick_links || []).map((link, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>{t("settingsManager.label")}</Label>
                <Input value={link.label} onChange={(e) => updateQuickLink(i, "label", e.target.value)} />
              </div>
              <div className="flex-1">
                <Label>{t("settingsManager.link")}</Label>
                <Input value={link.href} onChange={(e) => updateQuickLink(i, "href", e.target.value)} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeQuickLink(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addQuickLink}>
            <Plus className="h-4 w-4" /> {t("settingsManager.addLink")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
