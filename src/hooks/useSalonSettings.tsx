import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SalonSettings {
  id: string;
  salon_name: string;
  hero_title: string;
  hero_subtitle: string;
  hero_badge_text: string;
  hero_image_url: string | null;
  about_title: string;
  about_description: string;
  about_features: string[];
  about_cards: { icon: string; title: string; description: string }[];
  footer_address: string;
  footer_phone: string;
  footer_email: string;
  footer_hours: { label: string }[];
  quick_links: { label: string; href: string }[];
  hero_stats: { value: string; label: string }[];
}

export function useSalonSettings() {
  return useQuery({
    queryKey: ["salon-settings"],
    queryFn: async (): Promise<SalonSettings> => {
      const { data, error } = await supabase
        .from("salon_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;
      return {
        ...data,
        about_features: data.about_features as unknown as string[],
        about_cards: data.about_cards as unknown as SalonSettings["about_cards"],
        footer_hours: data.footer_hours as unknown as SalonSettings["footer_hours"],
        quick_links: data.quick_links as unknown as SalonSettings["quick_links"],
        hero_stats: data.hero_stats as unknown as SalonSettings["hero_stats"],
      };
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateSalonSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<SalonSettings, "id">>) => {
      // Get the current settings ID first
      const { data: current } = await supabase
        .from("salon_settings")
        .select("id")
        .limit(1)
        .single();

      if (!current) throw new Error("No salon settings found");

      const { error } = await supabase
        .from("salon_settings")
        .update(updates as any)
        .eq("id", current.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salon-settings"] });
    },
  });
}

export function useUpdateGalleryMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (heroImageUrl: string) => {
      const { data: current, error: selectError } = await supabase
        .from("salon_settings")
        .select("id")
        .limit(1)
        .single();

      if (selectError) {
        throw new Error(selectError.message || "Could not read salon settings");
      }
      if (!current) throw new Error("No salon settings found");

      // 1. Direct update works immediately for Admins without any extra RPC
      const { data: updatedRows, error: updateError } = await supabase
        .from("salon_settings")
        .update({ hero_image_url: heroImageUrl })
        .eq("id", current.id)
        .select("id");

      if (!updateError && updatedRows && updatedRows.length > 0) {
        return;
      }

      const updateDenied =
        !updateError ||
        updateError.code === "42501" ||
        (updateError.message || "").toLowerCase().includes("row-level security");

      if (!updateDenied && updateError) {
        throw new Error(updateError.message || "Could not update salon settings");
      }

      // 2. If direct update returned 0 rows / RLS denied (e.g. Specialist role), try scoped RPC
      const callGalleryRpc = supabase.rpc as unknown as (
        fn: string,
        args: { p_hero_image_url: string },
      ) => Promise<{ error: { message?: string; code?: string; details?: string } | null }>;

      const { error: rpcError } = await callGalleryRpc("save_salon_gallery_media", {
        p_hero_image_url: heroImageUrl,
      });

      if (!rpcError) return;

      const msg = (rpcError.message || "").toLowerCase();
      const isMissingRpc =
        rpcError.code === "PGRST202" ||
        rpcError.code === "42883" ||
        msg.includes("save_salon_gallery_media") ||
        msg.includes("could not find the function") ||
        msg.includes("schema cache");

      if (isMissingRpc) {
        throw new Error("PERMISSION_DENIED_SPECIALIST");
      }

      throw new Error(rpcError.message || "RPC error while saving gallery");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salon-settings"] });
    },
  });
}

