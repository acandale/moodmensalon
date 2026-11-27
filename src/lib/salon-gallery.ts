export interface ParsedHeroMedia {
  primaryImage: string;
  galleryImages: string[];
}

export function parseHeroMedia(heroImageUrl: string | null | undefined): ParsedHeroMedia {
  const raw = (heroImageUrl || "").trim();
  if (!raw) {
    return { primaryImage: "", galleryImages: [] };
  }

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { primary?: unknown; gallery?: unknown };
      const primaryImage = typeof parsed.primary === "string" ? parsed.primary.trim() : "";
      const galleryImages = Array.isArray(parsed.gallery)
        ? parsed.gallery.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      return { primaryImage, galleryImages };
    } catch {
      return { primaryImage: raw, galleryImages: [] };
    }
  }

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown[];
      const items = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      return {
        primaryImage: items[0] || "",
        galleryImages: items.slice(1),
      };
    } catch {
      return { primaryImage: raw, galleryImages: [] };
    }
  }

  return { primaryImage: raw, galleryImages: [] };
}

export function serializeHeroMedia(primaryImage: string, galleryImages: string[]): string {
  const cleanPrimary = primaryImage.trim();
  const cleanGallery = galleryImages.map((item) => item.trim()).filter(Boolean);

  if (cleanGallery.length === 0) {
    return cleanPrimary;
  }

  return JSON.stringify({
    primary: cleanPrimary,
    gallery: cleanGallery,
  });
}

export function getSalonSlides(
  heroImageUrl: string | null | undefined,
  fallbackHeroImage: string,
): string[] {
  const { primaryImage, galleryImages } = parseHeroMedia(heroImageUrl);
  const firstSlide = primaryImage || fallbackHeroImage;
  return [firstSlide, ...galleryImages];
}

export function compressImageFile(
  file: File,
  maxWidth = 1440,
  quality = 0.86,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nu s-a putut citi fișierul imagine."));
    reader.onload = () => {
      const originalDataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("Fișierul selectat nu este o imagine validă."));
      img.onload = () => {
        // Keep exact initial resolution and pixels for already compact images
        if (file.size <= 350_000 && img.width <= 1920 && img.height <= 1920) {
          resolve(originalDataUrl);
          return;
        }

        const renderAt = (targetWidth: number, targetQuality: number) => {
          const scale = img.width > targetWidth ? targetWidth / img.width : 1;
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) return null;

          ctx.drawImage(img, 0, 0, width, height);
          const webpData = canvas.toDataURL("image/webp", targetQuality);
          return webpData.startsWith("data:image/webp")
            ? webpData
            : canvas.toDataURL("image/jpeg", targetQuality);
        };

        const firstPass = renderAt(maxWidth, quality);
        if (!firstPass) {
          reject(new Error("Nu s-a putut procesa imaginea."));
          return;
        }

        if (firstPass.length > 350_000) {
          const secondPass = renderAt(1080, 0.75);
          resolve(secondPass || firstPass);
          return;
        }

        resolve(firstPass);
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function compressLogoFile(
  file: File,
  maxDimension = 512,
  quality = 0.9,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nu s-a putut citi fișierul imagine."));
    reader.onload = () => {
      const originalDataUrl = reader.result as string;

      if (file.type === "image/svg+xml" && file.size <= 150_000) {
        resolve(originalDataUrl);
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error("Fișierul selectat nu este o imagine validă."));
      img.onload = () => {
        if (file.size <= 150_000 && img.width <= maxDimension && img.height <= maxDimension) {
          resolve(originalDataUrl);
          return;
        }

        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Nu s-a putut procesa imaginea."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const webpData = canvas.toDataURL("image/webp", quality);
        resolve(
          webpData.startsWith("data:image/webp")
            ? webpData
            : canvas.toDataURL("image/png"),
        );
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
