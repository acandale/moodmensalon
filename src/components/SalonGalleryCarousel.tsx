import { useState, useRef, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-barber.jpg";
import { useSalonSettings } from "@/hooks/useSalonSettings";
import { useLanguage } from "@/hooks/useLanguage";
import { getSalonSlides } from "@/lib/salon-gallery";
import { cn } from "@/lib/utils";

interface SalonGalleryCarouselProps {
  onManageClick?: () => void;
  canManage?: boolean;
}

export function SalonGalleryCarousel({ onManageClick, canManage }: SalonGalleryCarouselProps) {
  const { data: settings } = useSalonSettings();
  const { language } = useLanguage();
  const isRo = language === "ro";

  const slides = getSalonSlides(settings?.hero_image_url, heroImage);
  const [activeIndex, setActiveIndex] = useState(0);
  const [naturalSizes, setNaturalSizes] = useState<Record<number, { width: number; height: number }>>({});
  const touchStartX = useRef<number | null>(null);

  const safeIndex = activeIndex >= slides.length ? 0 : activeIndex;

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || slides.length <= 1) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 40) {
      goNext();
    } else if (diff < -40) {
      goPrev();
    }
    touchStartX.current = null;
  };

  return (
    <Card variant="elevated" className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Images className="h-5 w-5 text-purple" />
          {isRo ? "Galerie Salon" : "Salon Gallery"}
        </CardTitle>
        <div className="flex items-center gap-3">
          {slides.length > 1 && (
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {safeIndex + 1} / {slides.length}
            </span>
          )}
          {canManage && onManageClick && (
            <Button variant="outline" size="sm" onClick={onManageClick}>
              {isRo ? "Editează galeria" : "Edit gallery"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          className="relative h-72 sm:h-96 md:h-[460px] w-full overflow-hidden bg-navy select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {slides.map((src, idx) => {
            const measured = naturalSizes[idx];
            const isFullBleedPrimary =
              idx === 0 && (!measured || measured.width >= 1000);
            const isActive = idx === safeIndex;

            return (
              <div
                key={`${idx}-${src.slice(0, 48)}`}
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-out",
                  isActive ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
              >
                {!isFullBleedPrimary && (
                  <>
                    <img
                      src={src}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-35 pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-navy/45 pointer-events-none" />
                  </>
                )}

                <img
                  src={src}
                  alt={`${settings?.salon_name || "Salon"} ${idx + 1}`}
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    setNaturalSizes((prev) => {
                      const existing = prev[idx];
                      if (existing && existing.width === naturalWidth && existing.height === naturalHeight) {
                        return prev;
                      }
                      return { ...prev, [idx]: { width: naturalWidth, height: naturalHeight } };
                    });
                  }}
                  className={cn(
                    "relative z-[1] transition-transform duration-500 ease-out",
                    isFullBleedPrimary
                      ? cn("w-full h-full object-cover", isActive ? "scale-100" : "scale-105")
                      : "max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl"
                  )}
                />
              </div>
            );
          })}

          <div className="absolute inset-x-0 bottom-0 h-20 z-[2] bg-gradient-to-t from-navy/90 via-navy/40 to-transparent pointer-events-none" />

          {/* Left / Right Swipe Buttons */}
          <button
            type="button"
            onClick={goPrev}
            disabled={slides.length <= 1}
            aria-label={isRo ? "Imaginea anterioară" : "Previous image"}
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-navy/60 backdrop-blur-md border border-white/20 text-white transition-all shadow-lg",
              slides.length > 1
                ? "hover:bg-purple hover:border-purple cursor-pointer"
                : "opacity-40 cursor-default"
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={slides.length <= 1}
            aria-label={isRo ? "Imaginea următoare" : "Next image"}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-navy/60 backdrop-blur-md border border-white/20 text-white transition-all shadow-lg",
              slides.length > 1
                ? "hover:bg-purple hover:border-purple cursor-pointer"
                : "opacity-40 cursor-default"
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Bottom bar with salon caption and dots */}
          <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-white/95 truncate">
              {settings?.salon_name || "MOOD MEN SALON"}
            </p>
            {slides.length > 1 && (
              <div className="flex items-center gap-1.5">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`${isRo ? "Imaginea" : "Image"} ${idx + 1}`}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      idx === safeIndex
                        ? "w-6 bg-purple-light"
                        : "w-2 bg-white/40 hover:bg-white/70"
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
