import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Scissors, Clock, DollarSign, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

const ServiceIcon = () => <Scissors className="h-8 w-8" />;

export function ServicesSection() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["landing-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, specialists!inner(is_active)")
        .eq("specialists.is_active", true)
        .order("price", { ascending: false });

      if (error) throw error;
      return data;
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
        ) : services.length === 0 ? (
          <p className="text-center text-muted-foreground">{t("services.noServices")}</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {services.map((service, index) => (
              <Card
                key={service.id}
                variant="elevated"
                className="group relative overflow-hidden animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
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

                <CardContent className="space-y-4">
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
                    onClick={() => navigate("/book")}
                  >
                    {t("services.bookNow")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
