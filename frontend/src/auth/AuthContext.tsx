import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { syncProfile } from "../api";
import { profileLabelFromUserMetadata, signupUserMetadata } from "./accountProfile";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

interface AuthContextValue {
  accessToken: string | null;
  authConfigured: boolean;
  loading: boolean;
  session: Session | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  signUp(email: string, password: string, redirectTo: string, username: string): Promise<void>;
  user: User | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const username = profileLabelFromUserMetadata(session?.user.user_metadata);
    if (!session?.access_token || !username) {
      return;
    }
    void syncProfile(username, session.access_token).catch(() => {
      // Profile sync is retried on the next auth state refresh.
    });
  }, [session?.access_token, session?.user.user_metadata]);

  const value = useMemo<AuthContextValue>(() => ({
    accessToken: session?.access_token ?? null,
    authConfigured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    async signIn(email: string, password: string) {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
    },
    async signOut() {
      if (!supabase) {
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    },
    async signUp(email: string, password: string, redirectTo: string, username: string) {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: signupUserMetadata(username),
          emailRedirectTo: redirectTo
        }
      });
      if (error) {
        throw error;
      }
    }
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
