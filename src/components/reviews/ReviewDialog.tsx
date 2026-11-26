import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { StarRating } from "@/components/reviews/StarRating";

export interface ReviewTargetAppointment {
  id: string;
  serviceId?: string | null;
  specialistId?: string | null;
  serviceName: string;
  specialistName?: string | null;
  dateLabel: string;
  existingReview?: SalonReview | null;
  initialRating?: number;
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
  const [authorName, setAuthorName] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    if (appointment?.existingReview) {
      setRating(appointment.existingReview.rating);
      setAuthorName(appointment.existingReview.author_name);
      setComment(appointment.existingReview.comment || "");
    } else {
      const nextInitial = appointment?.initialRating;
      setRating(
        typeof nextInitial === "number" && nextInitial >= 1 && nextInitial <= 5
          ? Math.round(nextInitial)
          : 5
      );
      setAuthorName(formatReviewerShortName(profile?.full_name || user?.email));
      setComment("");
    }
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
          {/* Interactive 5-Star Visual Rating */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>{isRo ? "Evaluare (1–5 stele)" : "Rating (1–5 stars)"}</Label>
              <span className="text-xs text-muted-foreground">
                {isRo ? "Apasă pe o stea" : "Click a star"}
              </span>
            </div>
            <div className="rounded-xl border border-amber-400/25 bg-muted/40 p-3.5 flex items-center justify-between gap-3">
              <StarRating
                value={rating}
                onChange={setRating}
                size="lg"
                showScore
                showDescriptor
              />
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
