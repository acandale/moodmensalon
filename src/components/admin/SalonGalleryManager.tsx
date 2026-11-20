import { useState, useEffect, useRef, ChangeEvent, DragEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ImagePlus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Star,
  Link as LinkIcon,
  RotateCcw,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import heroImage from "@/assets/hero-barber.jpg";
import { useSalonSettings, useUpdateGalleryMedia } from "@/hooks/useSalonSettings";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  compressImageFile,
  parseHeroMedia,
  serializeHeroMedia,
} from "@/lib/salon-gallery";
import { cn } from "@/lib/utils";

interface SalonGalleryManagerProps {
  /**
   * When rendered inside SalonSettingsManager, parent can supply controlled value & change handler
   * so "Save all settings" also persists gallery changes. Otherwise manages its own save button.
   */
  controlledValue?: string | null;
  onControlledChange?: (serialized: string) => void;
}

export function SalonGalleryManager({
  controlledValue,
  onControlledChange,
}: SalonGalleryManagerProps) {
  const { data: settings, isLoading } = useSalonSettings();
  const saveGalleryMutation = useUpdateGalleryMedia();
  const { language } = useLanguage();
  const { toast } = useToast();
  const isRo = language === "ro";

  const isControlled = controlledValue !== undefined && !!onControlledChange;
  const sourceValue = isControlled ? controlledValue : settings?.hero_image_url;

  const [primaryImage, setPrimaryImage] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [needsSqlMigration, setNeedsSqlMigration] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const specialistMigrationSql = `CREATE OR REPLACE FUNCTION public.save_salon_gallery_media(p_hero_image_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
    OR EXISTS (SELECT 1 FROM public.specialists WHERE user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to update salon gallery';
  END IF;

  SELECT id INTO v_settings_id FROM public.salon_settings LIMIT 1;
  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'No salon settings row found';
  END IF;

  UPDATE public.salon_settings
  SET hero_image_url = p_hero_image_url
  WHERE id = v_settings_id;
END;
$$;`;

  const savedParsed = parseHeroMedia(settings?.hero_image_url);
  const savedSerialized = serializeHeroMedia(savedParsed.primaryImage, savedParsed.galleryImages);
  const currentSerialized = serializeHeroMedia(primaryImage, galleryImages);
  const hasPendingGalleryChanges = hasUnsavedChanges || currentSerialized !== savedSerialized;

  useEffect(() => {
    const parsed = parseHeroMedia(sourceValue);
    setPrimaryImage(parsed.primaryImage);
    setGalleryImages(parsed.galleryImages);
    setHasUnsavedChanges(false);
  }, [sourceValue]);

  const persistGallery = async (nextPrimary: string, nextGallery: string[], successTitle?: string) => {
    const serialized = serializeHeroMedia(nextPrimary, nextGallery);
    if (isControlled && onControlledChange) {
      onControlledChange(serialized);
    }
    try {
      await saveGalleryMutation.mutateAsync(serialized);
      setHasUnsavedChanges(false);
      setNeedsSqlMigration(false);
      setLastError(null);
      toast({
        title: successTitle || (isRo ? "Galerie salvată" : "Gallery saved"),
        description: isRo
          ? "Poza principală rămâne cea a salonului, iar imaginile din galerie apar la apăsarea butonului >."
          : "Images are now live on the landing page and Dashboard.",
      });
    } catch (err) {
      console.error("Error saving gallery:", err);
      setHasUnsavedChanges(true);
      const rawMsg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err || "");
      const isSpecialistRls = rawMsg.includes("PERMISSION_DENIED_SPECIALIST");
      if (isSpecialistRls) {
        setNeedsSqlMigration(true);
        setLastError(null);
      } else {
        setLastError(rawMsg || "Eroare necunoscută la salvare");
      }
      toast({
        title: isRo ? "Nu s-a putut salva galeria" : "Could not save gallery",
        description: isSpecialistRls
          ? isRo
            ? "Contul de specialist nu are permisiune pe salon_settings până nu rulezi funcția SQL în Supabase (vezi instrucțiunile de mai jos) sau salvezi din contul Admin."
            : "Specialist accounts need the save_salon_gallery_media SQL function in Supabase, or save as Admin."
          : rawMsg || (isRo
            ? "A apărut o eroare la salvarea imaginilor."
            : "An error occurred while saving the gallery."),
        variant: "destructive",
      });
    }
  };

  const commitChange = (nextPrimary: string, nextGallery: string[], autoSave = false) => {
    setPrimaryImage(nextPrimary);
    setGalleryImages(nextGallery);
    if (isControlled && onControlledChange) {
      onControlledChange(serializeHeroMedia(nextPrimary, nextGallery));
    }
    setHasUnsavedChanges(true);
    if (autoSave) {
      void persistGallery(nextPrimary, nextGallery);
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);
    try {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        toast({
          title: isRo ? "Format invalid" : "Invalid format",
          description: isRo
            ? "Te rugăm să selectezi fișiere imagine (JPG, PNG, WebP)."
            : "Please select image files (JPG, PNG, WebP).",
          variant: "destructive",
        });
        return;
      }

      const compressed = await Promise.all(imageFiles.map((f) => compressImageFile(f)));
      const nextGallery = [...galleryImages, ...compressed];
      setPrimaryImage(primaryImage);
      setGalleryImages(nextGallery);
      await persistGallery(
        primaryImage,
        nextGallery,
        isRo
          ? `${compressed.length} ${compressed.length === 1 ? "poză salvată" : "poze salvate"} în galerie`
          : `${compressed.length} image(s) saved`,
      );
    } catch (err) {
      toast({
        title: isRo ? "Eroare la procesare" : "Processing error",
        description: err instanceof Error ? err.message : "Nu s-au putut încărca imaginile.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(e.target.files);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    commitChange(primaryImage, [...galleryImages, trimmed], true);
    setUrlInput("");
  };

  const moveGalleryImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= galleryImages.length) return;
    const next = [...galleryImages];
    [next[index], next[target]] = [next[target], next[index]];
    commitChange(primaryImage, next, true);
  };

  const removeGalleryImage = (index: number) => {
    const next = galleryImages.filter((_, i) => i !== index);
    commitChange(primaryImage, next, true);
  };

  const makePrimary = (index: number) => {
    const chosen = galleryImages[index];
    const remaining = galleryImages.filter((_, i) => i !== index);
    if (primaryImage) {
      remaining.unshift(primaryImage);
    }
    commitChange(chosen, remaining, true);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(specialistMigrationSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      toast({
        title: isRo ? "Copiere nereușită" : "Copy failed",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    await persistGallery(primaryImage, galleryImages);
  };

  if (!isControlled && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5 text-purple" />
            {isRo ? "Galerie Foto Salon (Grilă Foto)" : "Salon Photo Gallery"}
          </CardTitle>
          <CardDescription>
            {isRo
              ? "Încarcă poze în grilă. Clienții le vor putea parcurge cu butonul de swipe > atât înainte de logare, cât și în Dashboard."
              : "Upload photos to the grid. Clients can swipe through them on the landing page and Dashboard."}
          </CardDescription>
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saveGalleryMutation.isPending || isProcessingFiles}
          variant={hasPendingGalleryChanges ? "hero" : "default"}
        >
          {saveGalleryMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isRo ? "Salvează galeria" : "Save gallery"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {needsSqlMigration && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {isRo ? "Permisiune Supabase necesară pentru Specialist" : "Supabase permission required for Specialist"}
            </AlertTitle>
            <AlertDescription className="space-y-3 mt-2">
              <p>
                {isRo
                  ? "Baza de date permite momentan modificarea galeriei doar contului de Admin. Pentru a permite și conturilor de Specialist să salveze poze, rulează codul SQL de mai jos în Supabase → SQL Editor (o singură dată):"
                  : "Currently only Admins can update salon_settings. Run this SQL once in Supabase → SQL Editor to allow Specialists to save gallery photos:"}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleCopySql} className="bg-background text-foreground">
                {copiedSql ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedSql
                  ? (isRo ? "SQL copiat!" : "SQL copied!")
                  : (isRo ? "Copiază SQL pentru Supabase" : "Copy SQL for Supabase")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {lastError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{isRo ? "Eroare la salvare" : "Save error"}</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        )}
        {/* Primary Hero Image URL override */}
        <div className="space-y-2">
          <Label>{isRo ? "URL Imagine Principală (Slide #1 — opțional)" : "Primary Hero Image URL (Slide #1 — optional)"}</Label>
          <div className="flex gap-2">
            <Input
              value={primaryImage}
              onChange={(e) => commitChange(e.target.value, galleryImages)}
              placeholder={isRo ? "Lasă gol pentru imaginea implicită a salonului" : "Leave empty for default salon image"}
            />
            {primaryImage && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={isRo ? "Revino la imaginea implicită" : "Reset to default image"}
                onClick={() => commitChange("", galleryImages)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Add by URL */}
        <div className="space-y-2">
          <Label>{isRo ? "Adaugă imagine prin link (URL)" : "Add image by URL"}</Label>
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
              placeholder="https://..."
            />
            <Button type="button" variant="outline" onClick={handleAddUrl} disabled={!urlInput.trim()}>
              <LinkIcon className="h-4 w-4" />
              {isRo ? "Adaugă" : "Add"}
            </Button>
          </div>
        </div>

        {/* Photo Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              {isRo
                ? `Grilă foto (${1 + galleryImages.length} ${1 + galleryImages.length === 1 ? "imagine" : "imagini"})`
                : `Photo Grid (${1 + galleryImages.length} images)`}
            </Label>
            {hasPendingGalleryChanges && (
              <span className="text-xs font-medium text-purple">
                {isRo ? "Modificări nesalvate" : "Unsaved changes"}
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {/* Slide #1: Primary Image */}
            <div className="group relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-purple/50 bg-muted">
              <img
                src={primaryImage || heroImage}
                alt="Imagine principală"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple text-white text-[11px] font-semibold">
                <Star className="h-3 w-3 fill-white" />
                {isRo ? "Principală #1" : "Primary #1"}
              </div>
              {primaryImage && (
                <button
                  type="button"
                  onClick={() => commitChange("", galleryImages)}
                  title={isRo ? "Resetează la imaginea implicită" : "Reset to default"}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-destructive transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white/80 truncate">
                {primaryImage ? (isRo ? "Imagine personalizată" : "Custom image") : (isRo ? "Imagine implicită salon" : "Default salon image")}
              </div>
            </div>

            {/* Additional Gallery Slides */}
            {galleryImages.map((imgSrc, index) => (
              <div
                key={`${index}-${imgSrc.slice(0, 40)}`}
                className="group relative aspect-[4/3] rounded-xl overflow-hidden border bg-muted"
              >
                <img
                  src={imgSrc}
                  alt={`Galerie ${index + 2}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30 opacity-90 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity" />

                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[11px] font-semibold">
                  #{index + 2}
                </span>

                <button
                  type="button"
                  onClick={() => removeGalleryImage(index)}
                  title={isRo ? "Șterge imaginea" : "Delete image"}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveGalleryImage(index, -1)}
                      title={isRo ? "Mută la stânga" : "Move left"}
                      className="p-1 rounded bg-black/60 text-white hover:bg-purple disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === galleryImages.length - 1}
                      onClick={() => moveGalleryImage(index, 1)}
                      title={isRo ? "Mută la dreapta" : "Move right"}
                      className="p-1 rounded bg-black/60 text-white hover:bg-purple disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => makePrimary(index)}
                    title={isRo ? "Setează ca principală" : "Set as primary"}
                    className="px-2 py-1 rounded bg-black/60 text-[11px] font-medium text-white hover:bg-purple transition-colors"
                  >
                    {isRo ? "Principală" : "Primary"}
                  </button>
                </div>
              </div>
            ))}

            {/* Upload Tile inside the grid */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 p-4 text-center cursor-pointer transition-all",
                isDragging
                  ? "border-purple bg-purple/10 text-purple"
                  : "border-border hover:border-purple/60 hover:bg-purple/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {isProcessingFiles ? (
                <Loader2 className="h-7 w-7 animate-spin text-purple" />
              ) : (
                <ImagePlus className="h-7 w-7 text-purple" />
              )}
              <div className="text-xs font-medium">
                {isProcessingFiles
                  ? isRo ? "Se procesează..." : "Processing..."
                  : isRo ? "Încarcă poze" : "Upload photos"}
              </div>
              <div className="text-[11px] opacity-75">
                {isRo ? "Click sau trage aici" : "Click or drop here"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
