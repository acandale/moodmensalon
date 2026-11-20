import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ThemeProvider } from "@/hooks/useTheme"; // Importul pentru tema
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Booking from "./pages/Booking";
import Admin from "./pages/Admin";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import Account from "./pages/Account";
import MyAppointments from "./pages/MyAppointments";
import ClientHistory from "./pages/ClientHistory";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* ThemeProvider trebuie să fie sus pentru a controla culorile întregii aplicații */}
    <ThemeProvider> 
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <LanguageProvider>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/book" element={<Booking />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/install" element={<Install />} />
                <Route path="/account" element={<Account />} />
                <Route path="/my-appointments" element={<MyAppointments />} />
                <Route path="/client-history" element={<ClientHistory />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </LanguageProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;