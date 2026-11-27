import { useState } from "react";
import { Star, MessageSquarePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import moodLogoSrc from "@/assets/mood_logo.png";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSalonSettings } from "@/hooks/useSalonSettings";
import { useLanguage } from "@/hooks/useLanguage";
import { getInitials, SalonReview, usePublicReviews } from "@/hooks/useReviews";
import { StarRating } from "@/components/reviews/StarRating";

const INITIAL_VISIBLE = 4;
const COMMENT_TRUNCATE_LIMIT = 155;

function ReviewCardItem({
  review,
  salonName,
  logoSrc,
  isRo,
}: {
  review: SalonReview;
  salonName: string;
  logoSrc: string;
  isRo: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = review.comment.length > COMMENT_TRUNCATE_LIMIT;
  const visibleComment =
    needsTruncate && !expanded
      ? `${review.comment.slice(0, COMMENT_TRUNCATE_LIMIT).trimEnd()}...`
      : review.comment;

  return (
    <Card variant="elevated" className="border bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          {/* Initials Avatar */}
          <div className="h-11 w-11 rounded-full bg-purple/15 text-purple font-bold text-sm flex items-center justify-center shrink-0 border border-purple/25">
            {getInitials(review.author_name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground text-base leading-tight">
                {review.author_name}
              </p>
              {(review.services?.name || review.specialists?.name) && (
                <span className="text-xs text-muted-foreground">
                  {[review.services?.name, review.specialists?.name].filter(Boolean).join(" • ")}
                </span>
              )}
            </div>

            {/* Stars + "5 din 5" */}
            <div className="mt-1">
              <StarRating value={review.rating} readOnly size="sm" showScore />
            </div>

            {/* Comment text */}
            {review.comment && (
              <p className="mt-2.5 text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
                {visibleComment}{" "}
                {needsTruncate && (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => !prev)}
                    className="text-purple font-medium hover:underline inline ml-1"
                  >
                    {expanded
                      ? isRo
                        ? "mai puțin"
                        : "show less"
                      : isRo
                      ? "mai mult"
                      : "read more"}
                  </button>
                )}
              </p>
            )}

            {/* Nested Salon Reply */}
            {review.salon_reply && (
              <div className="mt-4 pt-3.5 border-t border-border/70 flex items-start gap-3">
                <img
                  src={logoSrc}
                  alt={salonName}
                  className="h-9 w-9 rounded-full object-cover shrink-0 border border-border"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                    {salonName}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {review.salon_reply}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewsSection() {
  const { data } = usePublicReviews();
  const { data: settings } = useSalonSettings();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isRo = language === "ro";

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const reviews = data?.reviews || [];
  const totalCount = reviews.length;
  const averageRating =
    totalCount > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount).toFixed(2)
      : "5.00";
  const salonName = settings?.salon_name || "MOOD MEN SALON";
  const logoSrc = settings?.logo_url || moodLogoSrc;

  const visibleReviews = reviews.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;

  return (
    <section id="reviews" className="py-20 bg-muted/30 border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header matching reference design */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              {isRo ? "Recenzii și evaluări:" : "Reviews & ratings:"}
            </h2>
            <div className="mt-3 flex items-baseline gap-4 flex-wrap">
              <span className="text-5xl font-black tracking-tight text-foreground tabular-nums">
                {averageRating}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star key={idx} className="h-4 w-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {totalCount}{" "}
                  {isRo
                    ? totalCount === 1
                      ? "evaluare"
                      : "evaluări"
                    : totalCount === 1
                    ? "review"
                    : "reviews"}
                </span>
              </div>
            </div>
          </div>

          {/* Reviews List or Empty CTA */}
          {totalCount === 0 ? (
            <Card variant="elevated" className="border bg-card">
              <CardContent className="p-8 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-purple/10 text-purple flex items-center justify-center">
                  <MessageSquarePlus className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {isRo
                    ? "Fii primul client care lasă o recenzie"
                    : "Be the first client to leave a review"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {isRo
                    ? "După fiecare programare finalizată, clienții își pot evalua experiența direct din contul lor."
                    : "After any completed appointment, clients can rate their experience right from their account."}
                </p>
                <div className="pt-2">
                  <Button variant="hero" size="sm" onClick={() => navigate("/auth")}>
                    {isRo ? "Intră în cont" : "Sign in to review"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {visibleReviews.map((review) => (
                  <ReviewCardItem
                    key={review.id}
                    review={review}
                    salonName={salonName}
                    logoSrc={logoSrc}
                    isRo={isRo}
                  />
                ))}
              </div>

              {(hasMore || visibleCount > INITIAL_VISIBLE) && (
                <div className="mt-6 flex items-center gap-4">
                  {hasMore ? (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + 6)}
                      className="text-sm font-semibold text-purple hover:underline cursor-pointer"
                    >
                      {isRo ? "Vezi mai multe recenzii" : "View more reviews"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(INITIAL_VISIBLE)}
                      className="text-sm font-semibold text-purple hover:underline cursor-pointer"
                    >
                      {isRo ? "Arată mai puține recenzii" : "Show fewer reviews"}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
