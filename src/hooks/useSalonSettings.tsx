import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_FOOTER_DESCRIPTION =
  "Premium grooming services for the modern gentleman.";

const FOOTER_DESC_META_KEY = "footer_description";
const LOGO_URL_META_KEY = "logo_url";

interface FooterHoursMetaEntry {
  __meta?: string;
  value?: string | null;
  label?: string;
}

function extractMetaMap(rawHours: unknown): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (!Array.isArray(rawHours)) return map;
  for (const item of rawHours as FooterHoursMetaEntry[]) {
    if (item && typeof item === "object" && typeof item.__meta === "string") {
      map.set(item.__meta, typeof item.value === "string" ? item.value : null);
    }
  }
  return map;
}

function extractFooterDescription(
  rawRow: Record<string, unknown>,
  rawHours: unknown
): string {
  if (typeof rawRow.footer_description === "string") {
    return rawRow.footer_description;
  }
  const metaVal = extractMetaMap(rawHours).get(FOOTER_DESC_META_KEY);
  if (typeof metaVal === "string") {
    return metaVal;
  }
  return DEFAULT_FOOTER_DESCRIPTION;
}

function extractLogoUrl(
  rawRow: Record<string, unknown>,
  rawHours: unknown
): string | null {
  if (typeof rawRow.logo_url === "string" && rawRow.logo_url.trim().length > 0) {
    return rawRow.logo_url.trim();
  }
  const metaVal = extractMetaMap(rawHours).get(LOGO_URL_META_KEY);
  if (typeof metaVal === "string" && metaVal.trim().length > 0) {
    return metaVal.trim();
  }
  return null;
}

function stripMetaHours(rawHours: unknown): { label: string }[] {
  if (!Array.isArray(rawHours)) return [];
  return (rawHours as FooterHoursMetaEntry[])
    .filter((item) => item && typeof item === "object" && !item.__meta && typeof item.label === "string")
    .map((item) => ({ label: item.label as string }));
}

export interface SalonSettings {
  id: string;
  salon_name: string;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_badge_text: string;
  hero_image_url: string | null;
  about_title: string;
  about_description: string;
  about_features: string[];
  about_cards: { icon: string; title: string; description: string }[];
  footer_description: string;
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
      const raw = data as unknown as Record<string, unknown>;
      return {
        ...data,
        logo_url: extractLogoUrl(raw, data.footer_hours),
        about_features: data.about_features as unknown as string[],
        about_cards: data.about_cards as unknown as SalonSettings["about_cards"],
        footer_description: extractFooterDescription(raw, data.footer_hours),
        footer_hours: stripMetaHours(data.footer_hours),
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
      // Get the current settings ID & existing footer_hours first
      const { data: current, error: selectError } = await supabase
        .from("salon_settings")
        .select("id, footer_hours")
        .limit(1)
        .single();

      if (selectError) throw selectError;
      if (!current) throw new Error("No salon settings found");

      // Preserve existing metadata entries inside footer_hours even on direct updates
      const existingMeta = extractMetaMap(current.footer_hours);
      const buildMergedHours = (
        baseHours: unknown,
        extraMeta: { footer_description?: string; logo_url?: string | null }
      ): FooterHoursMetaEntry[] => {
        const cleanHours = stripMetaHours(baseHours);
        const merged = new Map(existingMeta);
        if (extraMeta.footer_description !== undefined) {
          merged.set(FOOTER_DESC_META_KEY, extraMeta.footer_description);
        }
        if (extraMeta.logo_url !== undefined) {
          if (extraMeta.logo_url && extraMeta.logo_url.trim().length > 0) {
            merged.set(LOGO_URL_META_KEY, extraMeta.logo_url.trim());
          } else {
            merged.delete(LOGO_URL_META_KEY);
          }
        }
        const metaEntries: FooterHoursMetaEntry[] = Array.from(merged.entries()).map(
          ([key, value]) => ({ __meta: key, value })
        );
        return [...cleanHours, ...metaEntries];
      };

      const directPayload: Record<string, unknown> = { ...updates };
      if (updates.footer_hours !== undefined && existingMeta.size > 0) {
        directPayload.footer_hours = buildMergedHours(updates.footer_hours, {});
      }

      const { error } = await supabase
        .from("salon_settings")
        .update(directPayload as never)
        .eq("id", current.id);

      if (!error) return;

      const msg = (error.message || "").toLowerCase();
      const isMissingExtendedCol =
        (updates.footer_description !== undefined || updates.logo_url !== undefined) &&
        (error.code === "PGRST204" ||
          error.code === "42703" ||
          msg.includes("footer_description") ||
          msg.includes("logo_url"));

      if (!isMissingExtendedCol) {
        throw error;
      }

      // Fallback before SQL migrations are run: persist extended fields inside footer_hours JSONB
      const { footer_description, logo_url, footer_hours, ...restUpdates } = updates;
      const nextHours = buildMergedHours(
        footer_hours !== undefined ? footer_hours : current.footer_hours,
        { footer_description, logo_url }
      );

      const { error: fallbackError } = await supabase
        .from("salon_settings")
        .update({
          ...restUpdates,
          footer_hours: nextHours,
        } as never)
        .eq("id", current.id);

      if (fallbackError) throw fallbackError;
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

