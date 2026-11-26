import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { ServicesSection } from "@/components/landing/ServicesSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { ReviewsSection } from "@/components/landing/ReviewsSection";
import { Footer } from "@/components/landing/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { user, isLoading, isPasswordRecovery } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    const search = typeof window !== "undefined" ? window.location.search : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hasRecoveryToken =
      hash.includes("type=recovery") ||
      search.includes("type=recovery") ||
      search.includes("token_hash=") ||
      hash.includes("error_code=otp_expired") ||
      search.includes("error_code=otp_expired");

    if (isPasswordRecovery || hasRecoveryToken) {
      const targetParams = new URLSearchParams(search);
      targetParams.set("mode", "reset");
      navigate(`/auth?${targetParams.toString()}${hash}`, { replace: true });
      return;
    }

    if (user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, isPasswordRecovery, navigate]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <ServicesSection />
      <AboutSection />
      <ReviewsSection />
      <Footer />
    </div>
  );
};

export default Index;
