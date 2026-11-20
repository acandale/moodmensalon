import { useState, useRef, TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronLeft, ChevronRight, Star } from "lucide-react";
import heroImage from "@/assets/hero-barber.jpg";
import { useSalonSettings } from "@/hooks/useSalonSettings";
import { useLanguage } from "@/hooks/useLanguage";
import { getSalonSlides } from "@/lib/salon-gallery";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const navigate = useNavigate();
  const { data: settings } = useSalonSettings();
  const { t, language } = useLanguage();
  const isRo = language === "ro";

  const slides = getSalonSlides(settings?.hero_image_url, heroImage);
  const [activeIndex, setActiveIndex] = useState(0);
  const [naturalSizes, setNaturalSizes] = useState<Record<number, { width: number; height: number }>>({});
  const touchStartX = useRef<number | null>(null);

  const safeIndex = activeIndex >= slides.length ? 0 : activeIndex;
  const activeMeasured = naturalSizes[safeIndex];
  const isFullBleedHero =
    safeIndex === 0 && (!activeMeasured || activeMeasured.width >= 1000);

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const handleTouchStart = (e: TouchEvent<HTMLElement>) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null || slides.length <= 1) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 40) {
      goNext();
    } else if (diff < -40) {
      goPrev();
    }
    touchStartX.current = null;
  };

  const renderHeroCopy = (splitMode: boolean) => (
    <div
      className={cn(
        "text-center",
        splitMode ? "max-w-xl mx-auto" : "max-w-4xl mx-auto"
      )}
    >
      {/* Badge - Afișat doar dacă există text în DB */}
      {settings?.hero_badge_text && (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-navy/40 backdrop-blur-md border border-white/10 mb-6 sm:mb-8 animate-fade-in shadow-2xl">
          <Star className="h-4 w-4 text-purple-light fill-purple-light" />
          <span className="text-sm font-semibold text-white tracking-wide uppercase">
            {settings.hero_badge_text}
          </span>
        </div>
      )}

      {/* Headline */}
      {settings?.hero_title && (
        <h1
          className={cn(
            "font-black text-white mb-5 sm:mb-6 leading-[1.08] animate-slide-up tracking-tight",
            splitMode
              ? "text-4xl sm:text-5xl xl:text-6xl"
              : "text-5xl md:text-7xl lg:text-8xl"
          )}
        >
          {settings.hero_title}
        </h1>
      )}

      {/* Subheadline */}
      {settings?.hero_subtitle && (
        <p
          className={cn(
            "text-white/90 mb-8 sm:mb-10 max-w-2xl mx-auto animate-slide-up font-medium",
            splitMode ? "text-base sm:text-xl" : "text-lg md:text-2xl"
          )}
          style={{ animationDelay: "0.1s" }}
        >
          {settings.hero_subtitle}
        </p>
      )}

      {/* CTA Buttons */}
      <div
        className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5 animate-slide-up"
        style={{ animationDelay: "0.2s" }}
      >
        <Button
          variant="hero"
          size="xl"
          onClick={() => navigate("/auth?mode=signup")}
          className="w-full sm:w-auto text-lg h-14 px-8 shadow-xl shadow-purple/20 hover:scale-105 transition-transform"
        >
          <Calendar className="h-5 w-5 mr-2" />
          {t("hero.bookAppointment")}
        </Button>
        <Button
          variant="hero-outline"
          size="xl"
          onClick={() => {
            const el = document.getElementById("services");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className="w-full sm:w-auto text-lg h-14 px-8 backdrop-blur-md border-white/20 hover:bg-white/5"
        >
          {t("hero.viewServices")}
        </Button>
      </div>

      {/* Stats */}
      {settings?.hero_stats && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center animate-fade-in",
            splitMode ? "gap-10 mt-10 sm:mt-12" : "gap-12 mt-16 sm:mt-20"
          )}
          style={{ animationDelay: "0.4s" }}
        >
          {settings.hero_stats.map((stat, i) => (
            <div key={i} className="flex flex-col items-center">
              <p className="text-4xl md:text-5xl font-black text-white">{stat.value}</p>
              <p className="text-xs uppercase tracking-widest text-white/50 font-bold mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section
      className="relative min-h-[calc(100vh-64px)] flex items-center justify-center overflow-hidden bg-navy py-14 sm:py-16"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Layer */}
      <div className="absolute inset-0">
        {slides.map((src, idx) => {
          const isActive = idx === safeIndex;
          const slideIsFullBleed =
            idx === 0 && (!naturalSizes[idx] || naturalSizes[idx].width >= 1000);

          return (
            <img
              key={`bg-${idx}-${src.slice(0, 48)}`}
              src={src}
              alt={slideIsFullBleed ? `Professional barber shop interior ${idx + 1}` : ""}
              aria-hidden={!slideIsFullBleed}
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
                "absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out pointer-events-none",
                slideIsFullBleed
                  ? isActive
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-105"
                  : isActive
                  ? "opacity-25 blur-2xl scale-110"
                  : "opacity-0 scale-110"
              )}
            />
          );
        })}
        {/* Gradient overlay */}
        <div
          className={cn(
            "absolute inset-0 transition-colors duration-500",
            isFullBleedHero
              ? "bg-gradient-to-b from-navy/60 via-transparent to-navy"
              : "bg-gradient-to-b from-navy/75 via-navy/55 to-navy"
          )}
        />
        <div className={cn("absolute inset-0", isFullBleedHero ? "bg-navy/20" : "bg-navy/30")} />
      </div>

      {/* Left / Right Swipe Controls */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label={isRo ? "Imaginea anterioară" : "Previous image"}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center bg-navy/55 backdrop-blur-md border border-white/20 text-white hover:bg-purple hover:border-purple transition-all shadow-lg cursor-pointer"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={isRo ? "Imaginea următoare" : "Next image"}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center bg-navy/55 backdrop-blur-md border border-white/20 text-white hover:bg-purple hover:border-purple transition-all shadow-lg cursor-pointer"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Foreground Content */}
      <div className="relative z-10 container mx-auto px-14 sm:px-20 pb-8">
        {isFullBleedHero ? (
          renderHeroCopy(false)
        ) : (
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-6xl mx-auto">
            <div className="order-2 lg:order-1">{renderHeroCopy(true)}</div>
            <div className="order-1 lg:order-2 flex items-center justify-center">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15 bg-navy/40 backdrop-blur-sm p-2">
                <img
                  src={slides[safeIndex]}
                  alt={`${settings?.salon_name || "Salon"} ${safeIndex + 1}`}
                  className="max-w-full max-h-[420px] sm:max-h-[480px] w-auto h-auto object-contain rounded-xl"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Dots / Scroll Indicator */}
      {slides.length > 1 ? (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-navy/50 backdrop-blur-md border border-white/10">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`${isRo ? "Imaginea" : "Image"} ${idx + 1}`}
              className={cn(
                "h-2 rounded-full transition-all",
                idx === safeIndex ? "w-6 bg-purple-light" : "w-2 bg-white/40 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      ) : (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 hidden md:block">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5">
            <div className="w-1 h-2 bg-purple-light rounded-full animate-bounce" />
          </div>
        </div>
      )}
    </section>
  );
}