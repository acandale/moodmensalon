import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  is_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isSpecialist: boolean;
  specialistId: string | null;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSpecialist, setIsSpecialist] = useState(false);
  const [specialistId, setSpecialistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() =>
    typeof window !== "undefined" &&
    (window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery"))
  );

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileData) {
      setProfile(profileData);
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    setIsAdmin(roleData?.role === "admin");
    setIsSpecialist(roleData?.role === "specialist");

    // If specialist, fetch their specialist_id
    if (roleData?.role === "specialist") {
      const { data: specData } = await supabase
        .from("specialists")
        .select("id")
        .eq("user_id", userId)
        .single();
      setSpecialistId(specData?.id || null);
    } else {
      setSpecialistId(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;
    let initialResolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        if (window.location.pathname !== "/auth") {
          navigate("/auth?mode=reset", { replace: true });
        }
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }

      if (session?.user) {
        setTimeout(() => {
          if (mounted) {
            fetchProfile(session.user.id);
          }
        }, 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsSpecialist(false);
        setSpecialistId(null);
      }

      if (initialResolved || event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setIsLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchProfile(session.user.id);
        }
      })
      .finally(() => {
        initialResolved = true;
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const signUp = async (email: string, password: string, fullName: string, phone: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          phone: phone,
        },
      },
    });

    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setIsSpecialist(false);
    setSpecialistId(null);
    setIsPasswordRecovery(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin,
        isSpecialist,
        specialistId,
        isLoading,
        isPasswordRecovery,
        clearPasswordRecovery,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
