import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SalonReview {
  id: string;
  user_id: string;
  appointment_id: string;
  specialist_id: string | null;
  service_id: string | null;
  author_name: string;
  rating: number;
  comment: string;
  salon_reply: string | null;
  replied_at: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  services?: { name: string } | null;
  specialists?: { name: string } | null;
}

export const REVIEWS_MIGRATION_SQL = `-- Run once in Supabase -> SQL Editor
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  specialist_id uuid REFERENCES public.specialists(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL DEFAULT '',
  salon_reply text,
  replied_at timestamptz,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_published_created
  ON public.reviews (is_published, created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view published reviews" ON public.reviews;
CREATE POLICY "Anyone can view published reviews"
  ON public.reviews FOR SELECT
  USING (
    is_published = true
    OR auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  );

DROP POLICY IF EXISTS "Clients can create review for own appointment" ON public.reviews;
CREATE POLICY "Clients can create review for own appointment"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND a.user_id = auth.uid() AND a.status <> 'cancelled'
    )
  );

DROP POLICY IF EXISTS "Authors and staff can update reviews" ON public.reviews;
CREATE POLICY "Authors and staff can update reviews"
  ON public.reviews FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  );

DROP POLICY IF EXISTS "Authors and admins can delete reviews" ON public.reviews;
CREATE POLICY "Authors and admins can delete reviews"
  ON public.reviews FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP TRIGGER IF EXISTS update_reviews_updated_at ON public.reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();`;

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; status?: number };
  const msg = (e.message || "").toLowerCase();
  return (
    e.code === "PGRST205" ||
    e.code === "42P01" ||
    e.status === 404 ||
    msg.includes("could not find the table") ||
    msg.includes("does not exist")
  );
}

export function formatReviewerShortName(fullName: string | null | undefined): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export function getInitials(name: string | null | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export function usePublicReviews() {
  return useQuery({
    queryKey: ["public-reviews"],
    queryFn: async (): Promise<{ reviews: SalonReview[]; tableMissing: boolean }> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*, services(name), specialists(name)")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        if (isMissingTableError(error)) {
          return { reviews: [], tableMissing: true };
        }
        throw error;
      }

      return { reviews: (data || []) as SalonReview[], tableMissing: false };
    },
    staleTime: 60 * 1000,
  });
}

export function useMyReviews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-reviews", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<{ reviews: SalonReview[]; tableMissing: boolean }> => {
      if (!user?.id) return { reviews: [], tableMissing: false };
      const { data, error } = await supabase
        .from("reviews")
        .select("*, services(name), specialists(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          return { reviews: [], tableMissing: true };
        }
        throw error;
      }

      return { reviews: (data || []) as SalonReview[], tableMissing: false };
    },
  });
}

export function useAdminReviews(specialistId?: string | null) {
  const { user, isAdmin, isSpecialist } = useAuth();
  return useQuery({
    queryKey: ["admin-reviews", specialistId || "all"],
    enabled: !!user && (isAdmin || isSpecialist),
    queryFn: async (): Promise<{ reviews: SalonReview[]; tableMissing: boolean }> => {
      let query = supabase
        .from("reviews")
        .select("*, services(name), specialists(name)")
        .order("created_at", { ascending: false });

      if (specialistId) {
        query = query.eq("specialist_id", specialistId);
      }

      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) {
          return { reviews: [], tableMissing: true };
        }
        throw error;
      }

      return { reviews: (data || []) as SalonReview[], tableMissing: false };
    },
  });
}

export function useUpsertReview() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      appointmentId: string;
      specialistId?: string | null;
      serviceId?: string | null;
      rating: number;
      comment: string;
      authorName?: string;
    }) => {
      if (!user?.id) throw new Error("Trebuie să fii autentificat.");

      const authorName =
        input.authorName?.trim() || formatReviewerShortName(profile?.full_name || user.email);

      const { error } = await supabase.from("reviews").upsert(
        {
          user_id: user.id,
          appointment_id: input.appointmentId,
          specialist_id: input.specialistId ?? null,
          service_id: input.serviceId ?? null,
          author_name: authorName,
          rating: input.rating,
          comment: input.comment.trim(),
          is_published: true,
        },
        { onConflict: "appointment_id" }
      );

      if (error) {
        if (isMissingTableError(error)) {
          throw new Error("REVIEWS_TABLE_MISSING");
        }
        throw new Error(error.message || "Nu s-a putut salva recenzia.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
  });
}

export function useReplyToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      reply,
    }: {
      reviewId: string;
      reply: string;
    }) => {
      const trimmed = reply.trim();
      const { error } = await supabase
        .from("reviews")
        .update({
          salon_reply: trimmed || null,
          replied_at: trimmed ? new Date().toISOString() : null,
        })
        .eq("id", reviewId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
  });
}

export function useToggleReviewVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      isPublished,
    }: {
      reviewId: string;
      isPublished: boolean;
    }) => {
      const { error } = await supabase
        .from("reviews")
        .update({ is_published: isPublished })
        .eq("id", reviewId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
  });
}
