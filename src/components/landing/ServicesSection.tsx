import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Scissors, Clock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

const ServiceIcon = () => <Scissors className="h-8 w-8" />;

interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  specialist_id: string | null;
}

interface SpecialistWithServices {
  id: string;
  name: string;
  title: string | null;
  services: ServiceItem[];
}

export function ServicesSection() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: specialistGroups = [], isLoading } = useQuery({
    queryKey: ["landing-services-by-specialist"],
    queryFn: async (): Promise<SpecialistWithServices[]> => {
      const [specialistsRes, servicesRes] = await Promise.all([
        supabase
          .from("specialists")
          .select("id, name, title, is_active, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("services")
          .select("id, name, description, duration_minutes, price, specialist_id")
          .order("price", { ascending: false }),
      ]);

      if (specialistsRes.error) throw specialistsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      const servicesBySpecialist = new Map<string, ServiceItem[]>();
      for (const service of servicesRes.data ?? []) {
        if (!service.specialist_id) continue;
        const list = servicesBySpecialist.get(service.specialist_id) ?? [];
        list.push(service);
        servicesBySpecialist.set(service.specialist_id, list);
      }

      return (specialistsRes.data ?? [])
        .map((specialist) => ({
          id: specialist.id,
          name: specialist.name.trim(),
          title: specialist.title?.trim() || null,
          services: servicesBySpecialist.get(specialist.id) ?? [],
        }))
        .filter((group) => group.services.length > 0);
    },
  });

  return (
    <section id="services" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">{t("services.label")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            {t("services.title")}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("services.subtitle")}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple" />
          </div>
        ) : specialistGroups.length === 0 ? (
          <p className="text-center text-muted-foreground">{t("services.noServices")}</p>
        ) : (
          <div className="space-y-16 max-w-5xl mx-auto">
            {specialistGroups.map((specialist) => (
              <div key={specialist.id} className="space-y-8">
                {/* Specialist Section Header */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple/10 border border-purple/20 flex items-center justify-center text-purple font-bold text-lg shrink-0">
                    {specialist.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="shrink-0">
                    <h3 className="text-2xl font-bold text-foreground leading-tight">
                      {specialist.name}
                    </h3>
                    {specialist.title && (
                      <p className="text-sm text-muted-foreground">{specialist.title}</p>
                    )}
                  </div>
                  <div className="h-px flex-1 bg-border/80 ml-2" />
                </div>

                {/* Specialist Services Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                  {specialist.services.map((service, index) => (
                    <Card
                      key={service.id}
                      variant="elevated"
                      className="group relative overflow-hidden animate-slide-up flex flex-col"
                      style={{ animationDelay: `${index * 0.08}s` }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple to-purple-light" />

                      <CardHeader className="text-center pb-2">
                        <div className="mx-auto mb-4 p-4 rounded-2xl bg-purple/10 text-purple group-hover:bg-purple group-hover:text-white transition-all duration-300">
                          <ServiceIcon />
                        </div>
                        <CardTitle className="text-xl">{service.name}</CardTitle>
                        <CardDescription className="min-h-[40px]">
                          {service.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-4 mt-auto">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{service.duration_minutes} {t("services.min")}</span>
                          </div>
                          <div className="flex items-center gap-2 font-bold text-2xl text-purple">
                            <span>{Number(service.price)} RON</span>
                          </div>
                        </div>

                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() =>
                            navigate(
                              `/book?specialistId=${encodeURIComponent(specialist.id)}&serviceId=${encodeURIComponent(service.id)}`
                            )
                          }
                        >
                          {t("services.bookNow")}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
