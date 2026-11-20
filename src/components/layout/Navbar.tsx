import moodLogoSrc from "@/assets/mood_logo.png";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { useSalonSettings } from "@/hooks/useSalonSettings";
import { Scissors, Menu, X, User, Calendar, LogOut, Settings, Download, Globe, Sun, Moon } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Navbar() {
  const { user, profile, isAdmin, isSpecialist, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { data: salonSettings } = useSalonSettings();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Eroare la logout:", error);
      navigate("/");
    }
  };

  return (
    <nav className="sticky top-0 left-0 right-0 z-50 bg-navy border-b border-white/10 shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
<img src={moodLogoSrc} alt="Logo" className="h-10 w-10 rounded-lg object-cover" />
            <span className="font-bold text-xl text-white tracking-tight">
              {salonSettings?.salon_name || "BarberPro"}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link to="/install" className="text-sm font-medium text-white/70 hover:text-white transition-colors flex items-center gap-1.5">
              <Download className="h-4 w-4" />
              {t("nav.install")}
            </Link>

            {/* Theme Toggle Button - Desktop */}
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300 outline-none"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Language Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors uppercase outline-none">
                  <Globe className="h-4 w-4" />
                  {language}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-navy border-white/10 text-white shadow-xl">
                <DropdownMenuItem onClick={() => setLanguage("ro")} className="cursor-pointer hover:bg-white/10">RO Română</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLanguage("en")} className="cursor-pointer hover:bg-white/10">EN English</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!user ? (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => navigate("/auth")}>
                  {t("nav.signIn")}
                </Button>
                <Button variant="hero" size="sm" onClick={() => navigate("/auth?mode=signup")}>
                  {t("nav.getStarted")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="hero-outline" size="sm" className="gap-2 border-white/20 text-white hover:bg-white/10 outline-none">
                      <User className="h-4 w-4" />
                      {profile?.full_name || t("nav.account")}
                    </Button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-navy border-white/10 text-white shadow-2xl">
                  <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer hover:bg-white/10 gap-2">
                    <Calendar className="h-4 w-4" /> {t("nav.dashboard")}
                  </DropdownMenuItem>
                  {!isAdmin && !isSpecialist && (
                    <>
                      <DropdownMenuItem onClick={() => navigate("/account")} className="cursor-pointer hover:bg-white/10 gap-2">
                        <User className="h-4 w-4" /> {language === "ro" ? "Detalii cont" : "Account details"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/my-appointments")} className="cursor-pointer hover:bg-white/10 gap-2">
                        <Calendar className="h-4 w-4" /> {language === "ro" ? "Programări" : "Appointments"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer hover:bg-white/10 gap-2 text-purple-light">
                      <Settings className="h-4 w-4" /> {t("nav.adminPanel")}
                    </DropdownMenuItem>
                  )}
                  {isSpecialist && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer hover:bg-white/10 gap-2 text-purple-light">
                      <Settings className="h-4 w-4" /> {t("nav.specialistPanel")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer hover:bg-red-500/20 text-red-400 gap-2">
                    <LogOut className="h-4 w-4" /> {t("nav.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            )}
          </div>

          {/* Mobile Navigation Header */}
          <div className="flex items-center gap-2 md:hidden">
            {user && <NotificationBell />}
            {/* Theme Toggle - Mobile */}
            <button 
              onClick={toggleTheme}
              className="p-2 text-white/70 bg-white/5 rounded-lg"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button className="p-2 text-white/70 flex items-center gap-1 text-xs font-bold uppercase" onClick={() => setLanguage(language === "ro" ? "en" : "ro")}>
              <Globe className="h-4 w-4" /> {language}
            </button>
            <button className="p-2 text-white bg-white/5 rounded-lg" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden py-6 border-t border-white/10 bg-navy/95 backdrop-blur-xl">
            <div className="flex flex-col gap-5 px-2">
              <Link to="/install" className="text-lg font-semibold text-white/90 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                <Download className="h-5 w-5" /> {t("nav.install")}
              </Link>
              <DropdownMenuSeparator className="bg-white/10 my-2" />
              {!user ? (
                <button className="text-lg font-semibold text-purple-light text-left flex items-center gap-2" onClick={() => { navigate("/auth"); setMobileMenuOpen(false); }}>
                  <User className="h-5 w-5" /> {t("nav.signIn")}
                </button>
              ) : (
                <>
                  <Link to="/dashboard" className="text-lg font-semibold text-white/90" onClick={() => setMobileMenuOpen(false)}>
                    {t("nav.dashboard")}
                  </Link>
                  {!isAdmin && !isSpecialist && (
                    <>
                      <Link to="/account" className="text-lg font-semibold text-white/90" onClick={() => setMobileMenuOpen(false)}>
                        {language === "ro" ? "Detalii cont" : "Account details"}
                      </Link>
                      <Link to="/my-appointments" className="text-lg font-semibold text-white/90" onClick={() => setMobileMenuOpen(false)}>
                        {language === "ro" ? "Programări" : "Appointments"}
                      </Link>
                    </>
                  )}
                  {(isAdmin || isSpecialist) && (
                    <Link to="/admin" className="text-lg font-semibold text-purple-light" onClick={() => setMobileMenuOpen(false)}>
                      <Settings className="h-5 w-5 inline mr-2" /> {isAdmin ? t("nav.adminPanel") : t("nav.specialistPanel")}
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="text-lg font-semibold text-red-400 text-left flex items-center gap-2 mt-2">
                    <LogOut className="h-5 w-5" /> {t("nav.signOut")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}