import moodLogoSrc from "@/assets/mood_logo.png";
import { Link } from "react-router-dom";
import { Scissors, MapPin, Phone, Mail, Clock } from "lucide-react";
import { useSalonSettings, DEFAULT_FOOTER_DESCRIPTION } from "@/hooks/useSalonSettings";
import { useWorkHours } from "@/hooks/useWorkHours";
import { useLanguage } from "@/hooks/useLanguage";

export function Footer() {
  const { data: settings } = useSalonSettings();
  const { t } = useLanguage();
  const { data: workHours = [] } = useWorkHours();

  const salonName = settings?.salon_name || "BarberPro";
  const footerDescription =
    settings?.footer_description !== undefined
      ? settings.footer_description
      : DEFAULT_FOOTER_DESCRIPTION;
  const quickLinks = settings?.quick_links || [
    { label: "Services", href: "/#services" },
    { label: "About Us", href: "/#about" },
    { label: "Book Now", href: "/auth" },
  ];
  const address = settings?.footer_address || "123 Style Street, City";
  const phone = settings?.footer_phone || "(555) 123-4567";
  const email = settings?.footer_email || "hello@barberpro.com";

  const days = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

  function formatTime(t: string) {
    return t?.slice(0, 5) || "";
  }

  const handleScrollToServices = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById('services');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  function getLiveStatus() {
    if (!workHours || workHours.length === 0) return "Închis";
    const now = new Date();
    const currentDay = now.getDay(); 
    const wh = workHours.find(h => h.day_of_week === currentDay);

    if (!wh || !wh.is_working_day) return "Închis";

    const [startH, startM] = wh.start_time.split(":").map(Number);
    const [endH, endM] = wh.end_time.split(":").map(Number);

    const startTime = new Date(now);
    startTime.setHours(startH, startM, 0, 0);
    const endTime = new Date(now);
    endTime.setHours(endH, endM, 0, 0);

    return now >= startTime && now <= endTime ? "Deschis" : "Închis";
  }

  return (
    <footer className="bg-navy text-white">
      {/* Redus py-16 la py-8 pentru a fi mai scund */}
      <div className="container mx-auto px-4 py-8">
        {/* Redus gap-12 la gap-8 pentru coloane mai apropiate */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <img
                src={settings?.logo_url || moodLogoSrc}
                alt="Logo"
                className="h-10 w-10 rounded-lg object-cover"
              />
              <span className="font-bold text-xl">{salonName}</span>
            </Link>
            <p className="text-white/60 text-sm leading-relaxed">
              {footerDescription}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">{t("footer.quickLinks")}</h4>
            <ul className="space-y-3">
              {quickLinks.map((link, i) => (
                <li key={i}>
                  {link.label === "Services" || link.href.includes("#services") ? (
                    <button 
                      onClick={handleScrollToServices}
                      className="text-white/60 hover:text-white text-sm transition-colors text-left"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link to={link.href} className="text-white/60 hover:text-white text-sm transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4">{t("footer.contact")}</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-white/60 text-sm">
                <MapPin className="h-4 w-4 text-purple" />
                <span>{address}</span>
              </li>
              <li className="flex items-center gap-3 text-white/60 text-sm">
                <Phone className="h-4 w-4 text-purple" />
                <span>{phone}</span>
              </li>
              <li className="flex items-center gap-3 text-white/60 text-sm">
                <Mail className="h-4 w-4 text-purple" />
                <span>{email}</span>
              </li>
            </ul>
          </div>

          {/* Hours Section */}
          <div>
            <h4 className="font-semibold mb-4">{t("footer.workingHours")}</h4>
            
            <div className={`mb-4 flex items-center gap-2 font-bold text-lg ${
              getLiveStatus() === "Deschis" ? "text-green-400" : "text-red-500"
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                getLiveStatus() === "Deschis" ? "bg-green-400 animate-pulse" : "bg-red-500"
              }`} />
              {getLiveStatus()}
            </div>

            <ul className="space-y-3">
              {[...workHours]
                .sort((a, b) => (a.day_of_week === 0 ? 7 : a.day_of_week) - (b.day_of_week === 0 ? 7 : b.day_of_week))
                .map((wh) => (
                  <li key={wh.id} className="flex items-center gap-3 text-white/60 text-sm">
                    <Clock className="h-4 w-4 text-purple" />
                    <span>
                      {days[wh.day_of_week]}: {wh.is_working_day
                        ? `${formatTime(wh.start_time)} - ${formatTime(wh.end_time)}`
                        : "Închis"}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        {/* Redus mt-12 la mt-8 */}
        <div className="border-t border-white/10 mt-8 pt-6 text-center">
          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} {salonName}. {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}