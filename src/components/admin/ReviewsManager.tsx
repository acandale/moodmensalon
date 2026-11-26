import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ro as roLocale } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  getInitials,
  REVIEWS_MIGRATION_SQL,
  useAdminReviews,
  useReplyToReview,
  useToggleReviewVisibility,
} from "@/hooks/useReviews";
import { StarRating } from "@/components/reviews/StarRating";
import { cn } from "@/lib/utils";

interface ReviewsManagerProps {
  restrictToSpecialistId?: string | null;
}

export function ReviewsManager({ restrictToSpecialistId }: ReviewsManagerProps) {
  const { language } = useLanguage();
  const isRo = language === "ro";
  const { toast } = useToast();

  const { data, isLoading } = useAdminReviews(restrictToSpecialistId);
  const replyMutation = useReplyToReview();
  const toggleVisibilityMutation = useToggleReviewVisibility();

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const reviews = data?.reviews || [];
  const tableMissing = data?.tableMissing ?? false;

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(REVIEWS_MIGRATION_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      toast({
        title: isRo ? "Copiere nereușită" : "Copy failed",
        variant: "destructive",
      });
    }
  };

  const handleSaveReply = async (reviewId: string) => {
    try {
      await replyMutation.mutateAsync({
        reviewId,
        reply: replyDrafts[reviewId] ?? "",
      });
      setEditingReplyId(null);
      toast({
        title: isRo ? "Răspuns salvat" : "Reply saved",
        description: isRo
          ? "Răspunsul salonului apare acum sub recenzie."
          : "Your salon reply is now visible under the review.",
      });
    } catch (err) {
      toast({
        title: isRo ? "Eroare la salvare" : "Failed to save reply",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-purple" />
          {isRo ? "Recenzii clienți" : "Client Reviews"}
        </CardTitle>
        <CardDescription>
          {isRo
            ? "Vezi evaluările lăsate de clienți și răspunde oficial în numele salonului."
            : "View client reviews and post official salon replies."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tableMissing && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {isRo ? "Tabelul reviews lipsește în Supabase" : "reviews table missing in Supabase"}
            </AlertTitle>
            <AlertDescription className="space-y-3 mt-2">
              <p>
                {isRo
                  ? "Rulează SQL-ul de mai jos o singură dată în Supabase → SQL Editor pentru a activa sistemul de recenzii:"
                  : "Run this SQL once in Supabase → SQL Editor to enable the reviews system:"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySql}
                className="bg-background text-foreground"
              >
                {copiedSql ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copiedSql
                  ? isRo
                    ? "SQL copiat!"
                    : "SQL copied!"
                  : isRo
                  ? "Copiază SQL pentru Supabase"
                  : "Copy SQL for Supabase"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!tableMissing && reviews.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {isRo ? "Nu există recenzii încă." : "No reviews yet."}
          </p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const isEditing = editingReplyId === review.id;
              const draft = replyDrafts[review.id] ?? review.salon_reply ?? "";

              return (
                <div
                  key={review.id}
                  className={cn(
                    "rounded-xl border p-4 space-y-3 bg-card",
                    !review.is_published && "opacity-60"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-purple/15 text-purple font-bold text-xs flex items-center justify-center shrink-0">
                        {getInitials(review.author_name)}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{review.author_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StarRating value={review.rating} readOnly size="xs" />
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(review.created_at), "d MMM yyyy", { locale: roLocale })}
                          </span>
                          {(review.services?.name || review.specialists?.name) && (
                            <span className="text-xs text-muted-foreground">
                              • {[review.services?.name, review.specialists?.name].filter(Boolean).join(" / ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toggleVisibilityMutation.mutate({
                            reviewId: review.id,
                            isPublished: !review.is_published,
                          })
                        }
                        title={
                          review.is_published
                            ? isRo
                              ? "Ascunde de pe pagina principală"
                              : "Hide from homepage"
                            : isRo
                            ? "Afișează pe pagina principală"
                            : "Publish to homepage"
                        }
                      >
                        {review.is_published ? (
                          <Eye className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (isEditing) {
                            setEditingReplyId(null);
                          } else {
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [review.id]: review.salon_reply ?? "",
                            }));
                            setEditingReplyId(review.id);
                          }
                        }}
                      >
                        {review.salon_reply
                          ? isRo
                            ? "Editează răspuns"
                            : "Edit reply"
                          : isRo
                          ? "Răspunde"
                          : "Reply"}
                      </Button>
                    </div>
                  </div>

                  {review.comment && (
                    <p className="text-sm text-foreground/90 leading-relaxed pl-[52px]">
                      {review.comment}
                    </p>
                  )}

                  {review.salon_reply && !isEditing && (
                    <div className="ml-[52px] rounded-lg bg-muted/60 border p-3 text-sm">
                      <p className="text-xs font-semibold text-purple mb-1">
                        {isRo ? "Răspunsul salonului:" : "Salon reply:"}
                      </p>
                      <p className="text-muted-foreground">{review.salon_reply}</p>
                    </div>
                  )}

                  {isEditing && (
                    <div className="ml-[52px] space-y-2 pt-1">
                      <Textarea
                        value={draft}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                        }
                        rows={2}
                        placeholder={
                          isRo
                            ? "Scrie răspunsul oficial al salonului..."
                            : "Write the official salon reply..."
                        }
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingReplyId(null)}
                        >
                          {isRo ? "Anulează" : "Cancel"}
                        </Button>
                        <Button
                          type="button"
                          variant="hero"
                          size="sm"
                          disabled={replyMutation.isPending}
                          onClick={() => void handleSaveReply(review.id)}
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {isRo ? "Salvează răspunsul" : "Save reply"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
