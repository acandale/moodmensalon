import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { ServicesSection } from "@/components/landing/ServicesSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { Footer } from "@/components/landing/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <ServicesSection />
      <AboutSection />
      <Footer />
    </div>
  );
};

export default Index;
