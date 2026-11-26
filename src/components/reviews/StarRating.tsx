import { useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  showScore?: boolean;
  showDescriptor?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<StarRatingProps["size"]>, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const RATING_LABELS_RO: Record<number, string> = {
  1: "Slab",
  2: "Acceptabil",
  3: "Bun",
  4: "Foarte bun",
  5: "Excelent",
};

const RATING_LABELS_EN: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

export function StarRating({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  size = "md",
  showScore = false,
  showDescriptor = false,
  className,
}: StarRatingProps) {
  const { language } = useLanguage();
  const isRo = language === "ro";
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const isInteractive = !readOnly && !disabled && typeof onChange === "function";
  const activeRating = isInteractive ? hoveredRating ?? value : value;
  const clampedRating = Math.max(0, Math.min(5, Math.round(activeRating)));
  const labels = isRo ? RATING_LABELS_RO : RATING_LABELS_EN;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive || !onChange) return;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, (value || 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, (value || 1) - 1));
    } else if (e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      onChange(Number(e.key));
    }
  };

  return (
    <div
      className={cn("inline-flex flex-wrap items-center gap-2", className)}
      onMouseLeave={() => {
        if (isInteractive) setHoveredRating(null);
      }}
    >
      <div
        role={isInteractive ? "radiogroup" : "img"}
        aria-label={
          isInteractive
            ? isRo
              ? "Selectează evaluarea de la 1 la 5 stele"
              : "Select rating from 1 to 5 stars"
            : `${clampedRating} ${isRo ? "din" : "out of"} 5`
        }
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex items-center",
          size === "lg" ? "gap-1.5" : size === "md" ? "gap-1" : "gap-0.5"
        )}
      >
        {[1, 2, 3, 4, 5].map((starValue) => {
          const isFilled = starValue <= activeRating;
          const isHovered = hoveredRating !== null && starValue <= hoveredRating;

          if (!isInteractive) {
            return (
              <Star
                key={starValue}
                className={cn(
                  SIZE_CLASSES[size],
                  isFilled
                    ? "text-amber-400 fill-amber-400"
                    : "text-muted-foreground/30"
                )}
              />
            );
          }

          return (
            <button
              key={starValue}
              type="button"
              role="radio"
              aria-checked={value === starValue}
              aria-label={
                isRo
                  ? `${starValue} ${starValue === 1 ? "stea" : "stele"} (${labels[starValue]})`
                  : `${starValue} ${starValue === 1 ? "star" : "stars"} (${labels[starValue]})`
              }
              title={`${starValue}/5 — ${labels[starValue]}`}
              onMouseEnter={() => setHoveredRating(starValue)}
              onFocus={() => setHoveredRating(starValue)}
              onBlur={() => setHoveredRating(null)}
              onClick={() => onChange(starValue)}
              className={cn(
                "group relative rounded-lg p-1 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer",
                isHovered ? "scale-110 bg-amber-400/10" : "hover:scale-110 active:scale-95"
              )}
            >
              <Star
                className={cn(
                  SIZE_CLASSES[size],
                  "transition-all duration-150",
                  isFilled
                    ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]"
                    : "text-muted-foreground/35 group-hover:text-amber-400/70"
                )}
              />
            </button>
          );
        })}
      </div>

      {(showScore || showDescriptor) && clampedRating > 0 && (
        <div className="inline-flex items-center gap-1.5 text-sm">
          {showScore && (
            <span className="font-semibold text-foreground tabular-nums">
              {clampedRating} {isRo ? "din" : "of"} 5
            </span>
          )}
          {showDescriptor && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-300">
              {labels[clampedRating]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
