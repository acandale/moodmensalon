import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  formatReviewerShortName,
  SalonReview,
  useUpsertReview,
} from "@/hooks/useReviews";
import { cn } from "@/lib/utils";

export interface ReviewTargetAppointment {
  id: string;
  serviceId?: string | null;
  specialistId?: string | null;
  serviceName: string;
  specialistName?: string | null;
  dateLabel: string;
  existingReview?: SalonReview | null;
}

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: ReviewTargetAppointment | null;
}

export function ReviewDialog({
  open,
  onOpenChange,
  appointment,
}: ReviewDialogProps) {
  const { profile, user } = useAuth();
  const { language } = useLanguage();
  const isRo = language === "ro";
  const { toast } = useToast();
  const upsertMutation = useUpsertReview();

  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    if (appointment?.existingReview) {
      setRating(appointment.existingReview.rating);
      setAuthorName(appointment.existingReview.author_name);
      setComment(appointment.existingReview.comment || "");
    } else {
      setRating(5);
      setAuthorName(formatReviewerShortName(profile?.full_name || user?.email));
      setComment("");
    }
    setHoveredRating(null);
  }, [open, appointment, profile?.full_name, user?.email]);

  const handleSubmit = async () => {
    if (!appointment) return;
    if (!comment.trim()) {
      toast({
        title: isRo ? "Scrie câteva cuvinte" : "Write a short comment",
        description: isRo
          ? "Te rugăm să adaugi un scurt mesaj pentru recenzia ta."
          : "Please include a brief comment for your review.",
        variant: "destructive",
      });
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        appointmentId: appointment.id,
        serviceId: appointment.serviceId,
        specialistId: appointment.specialistId,
        rating,
        comment,
        authorName,
      });
      toast({
        title: appointment.existingReview
          ? isRo
            ? "Recenzie actualizată"
            : "Review updated"
          : isRo
          ? "Mulțumim pentru recenzie!"
          : "Thank you for your review!",
        description: isRo
          ? "Recenzia ta este vizibilă pe pagina principală a salonului."
          : "Your review is now visible on the salon homepage.",
      });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: isRo ? "Eroare la salvare" : "Could not save review",
        description:
          msg === "REVIEWS_TABLE_MISSING"
            ? isRo
              ? "Tabelul reviews nu este încă creat în Supabase. Contactează administratorul salonului."
              : "The reviews table has not been created in Supabase yet."
            : msg || (isRo ? "Nu s-a putut salva recenzia." : "Failed to save review."),
        variant: "destructive",
      });
    }
  };

  const activeStars = hoveredRating ?? rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {appointment?.existingReview
              ? isRo
                ? "Editează recenzia"
                : "Edit review"
              : isRo
              ? "Lasă o recenzie"
              : "Leave a review"}
          </DialogTitle>
          {appointment && (
            <DialogDescription>
              {[appointment.serviceName, appointment.specialistName, appointment.dateLabel]
                .filter(Boolean)
                .join(" • ")}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Star selector */}
          <div className="space-y-2">
            <Label>{isRo ? "Evaluare" : "Rating"}</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((starValue) => (
                <button
                  key={starValue}
                  type="button"
                  onMouseEnter={() => setHoveredRating(starValue)}
                  onMouseLeave={() => setHoveredRating(null)}
                  onClick={() => setRating(starValue)}
                  aria-label={`${starValue} / 5`}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-7 w-7 transition-colors",
                      starValue <= activeStars
                        ? "text-amber-400 fill-amber-400"
                        : "text-muted-foreground/30"
                    )}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-semibold text-foreground">
                {activeStars} {isRo ? "din" : "of"} 5
              </span>
            </div>
          </div>

          {/* Display name */}
          <div className="space-y-2">
            <Label htmlFor="review-author-name">
              {isRo ? "Nume afișat public" : "Public display name"}
            </Label>
            <Input
              id="review-author-name"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={50}
              placeholder={isRo ? "ex: Darius G." : "e.g. John D."}
            />
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="review-comment">
              {isRo ? "Părerea ta" : "Your feedback"}
            </Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder={
                isRo
                  ? "Cum a fost tunsoarea și experiența ta la salon?"
                  : "How was your haircut and experience at the salon?"
              }
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {isRo ? "Anulează" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="hero"
            disabled={upsertMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            {upsertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isRo ? "Publică recenzia" : "Publish review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
