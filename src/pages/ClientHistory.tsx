import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ro as roLocale, enUS } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useSalonSettings } from "@/hooks/useSalonSettings";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface Appt {
  id: string;
  start_time: string;
  end_time: string;
  status: string | null;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  services: { name: string; price: number } | null;
  specialists: { name: string } | null;
}
type Filter = "all" | "upcoming" | "completed" | "cancelled";
const PAGE = 20;

export default function ClientHistory() {
  const { user, isAdmin, isSpecialist, specialistId, isLoading } = useAuth();
  const { language } = useLanguage();
  const { data: salon } = useSalonSettings();
  const navigate = useNavigate();
  const ro = language === "ro";
  const locale = ro ? roLocale : enUS;
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const allowed = isAdmin || isSpecialist;

  const { data, isLoading: loading } = useQuery({
    queryKey: ["client-history", isAdmin, specialistId],
    enabled: !!user && allowed && (isAdmin || !!specialistId),
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id,start_time,end_time,status,user_id,guest_name,guest_phone,services(name,price),specialists(name)")
        .order("start_time", { ascending: false });
      if (!isAdmin && specialistId) q = q.eq("specialist_id", specialistId);
      const { data, error } = await q;
      if (error) throw error;
      const appts = (data || []) as unknown as Appt[];
      const ids = [...new Set(appts.map((a) => a.user_id).filter(Boolean))] as string[];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids)
        : { data: [] as { id: string; full_name: string; phone: string }[] };
      return { appts, profs: profs || [] };
    },
  });

  const keyOf = (a: Appt) => a.user_id || `guest:${(a.guest_name || "").trim().toLowerCase()}|${a.guest_phone || ""}`;

  const clients = useMemo(() => {
    const map = new Map<string, { key: string; name: string; phone: string; count: number }>();
    const pm = new Map((data?.profs || []).map((p) => [p.id, p]));
    for (const a of data?.appts || []) {
      const k = keyOf(a);
      const p = a.user_id ? pm.get(a.user_id) : undefined;
      const cur = map.get(k) || { key: k, name: p?.full_name || a.guest_name || "—", phone: p?.phone || a.guest_phone || "", count: 0 };
      cur.count++;
      map.set(k, cur);
    }
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [data]);

  if (!isLoading && (!user || !allowed)) return <Navigate to="/auth" replace />;

  const now = new Date();
  const kind = (a: Appt): Filter =>
    a.status === "cancelled" ? "cancelled" : new Date(a.end_time) < now ? "completed" : "upcoming";
  const label = { all: ro ? "Toate" : "All", upcoming: ro ? "Viitoare" : "Upcoming", completed: ro ? "Finalizate" : "Completed", cancelled: ro ? "Anulate" : "Cancelled" };
  const tag = { upcoming: ro ? "CONFIRMAT" : "CONFIRMED", completed: ro ? "FINALIZAT" : "COMPLETED", cancelled: ro ? "ANULAT" : "CANCELLED" };

  const clientAppts = (data?.appts || []).filter((a) => keyOf(a) === selected);
  const shown = clientAppts.filter((a) => filter === "all" || kind(a) === filter);
  const pages = Math.ceil(shown.length / PAGE);
  const current = clients.find((c) => c.key === selected);
  const filteredClients = clients.filter((c) =>
    (c.name + " " + c.phone).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <button aria-label={ro ? "Înapoi" : "Back"} onClick={() => navigate("/admin")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-3xl font-bold text-foreground">{ro ? "Fișa clientului" : "Client file"}</h1>
        </div>
        {loading ? (
          <p className="text-muted-foreground">{ro ? "Se încarcă..." : "Loading..."}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <aside className="rounded-lg border border-border bg-card p-3 h-fit">
              <Input placeholder={ro ? "Caută client..." : "Search client..."} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
              <div className="max-h-[60vh] overflow-y-auto space-y-1">
                {filteredClients.length === 0 && <p className="text-sm text-muted-foreground p-2">{ro ? "Niciun client." : "No clients."}</p>}
                {filteredClients.map((c) => (
                  <button key={c.key} onClick={() => { setSelected(c.key); setPage(1); setFilter("all"); }}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm ${selected === c.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs opacity-75">{c.phone ? `${c.phone} · ` : ""}{c.count} {c.count === 1 ? (ro ? "programare" : "appointment") : (ro ? "programări" : "appointments")}</div>
                  </button>
                ))}
              </div>
            </aside>
            <section>
              {!current ? (
                <p className="text-muted-foreground">{ro ? "Alege un client din listă." : "Pick a client from the list."}</p>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-foreground">{current.name}</h2>
                  <p className="text-sm text-muted-foreground mb-4">{current.phone}</p>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {(Object.keys(label) as Filter[]).map((f) => (
                      <button key={f} onClick={() => { setFilter(f); setPage(1); }}
                        className={`px-3 py-1 rounded-full border text-sm ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                        {label[f]} ({f === "all" ? clientAppts.length : clientAppts.filter((a) => kind(a) === f).length})
                      </button>
                    ))}
                  </div>
                  {shown.length === 0 ? (
                    <p className="text-muted-foreground">{ro ? "Nicio programare." : "No appointments."}</p>
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {shown.slice((page - 1) * PAGE, page * PAGE).map((a) => {
                        const s = new Date(a.start_time), e = new Date(a.end_time), k = kind(a) as Exclude<Filter, "all">;
                        const d = format(s, "EEEEEE. d MMM yyyy", { locale });
                        return (
                          <div key={a.id} className="rounded-lg bg-card border border-border shadow-sm p-4">
                            <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${k === "cancelled" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>{tag[k]}</span>
                            <h3 className="text-lg font-bold mt-1 text-foreground">{d.charAt(0).toUpperCase() + d.slice(1)}</h3>
                            <div className="border-t border-border my-3" />
                            <div className="flex justify-between gap-2">
                              <span className="font-semibold text-foreground">{a.services?.name}</span>
                              <span className="font-bold text-foreground whitespace-nowrap">{a.services?.price} lei</span>
                            </div>
                            <p className="text-sm text-foreground/80">{a.specialists?.name} - {salon?.salon_name || "BarberPro"}</p>
                            <p className="text-sm text-muted-foreground">{format(s, "HH:mm")} - {format(e, "HH:mm")}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {pages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-6">
                      <button className="px-3 py-1 rounded border border-border text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>{ro ? "Înapoi" : "Previous"}</button>
                      <span className="text-sm text-muted-foreground">{page} / {pages}</span>
                      <button className="px-3 py-1 rounded border border-border text-sm disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>{ro ? "Înainte" : "Next"}</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
