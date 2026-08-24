import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/local-cache";
import type { User } from "@supabase/supabase-js";

export type UserRole = "super_admin" | "developer" | "qa";

export type Profile = {
  id: string;
  email: string;
  name: string;
  display_name: string;
  role: UserRole;
};

const SUPER_ADMIN_EMAILS = [
  "edomaycos@gmail.com",
  "abellajoshua18@gmail.com",
  "allenmartillan715@gmail.com",
];

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  isSuperAdmin: boolean;
  isDeveloper: boolean;
  isQa: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

// Generated Supabase types don't match this app's actual profiles/invitations/settings
// schema (see supabase/migrations/00002_auth.sql) — same workaround as project-context.tsx.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
        ),
      ]);
    }

    async function init() {
      try {
        const {
          data: { session },
          error,
        } = await withTimeout(supabase.auth.getSession(), 10000);
        if (cancelled) return;
        if (error) {
          console.warn("[Auth] getSession error:", error.message);
          return;
        }
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const cached = readCache<Profile>(`profile:${u.id}`);
          if (cached) setProfile(cached);
          try {
            await loadProfile(u.id, u.email ?? "");
          } catch (e) {
            console.warn("[Auth] loadProfile error:", e);
          }
        }
      } catch (e: unknown) {
        const errMsg = errorMessage(e);
        console.warn("[Auth] init error:", errMsg || e);
        if (errMsg.includes("Timeout")) {
          const attempts = parseInt(sessionStorage.getItem("auth_retries") ?? "0", 10);
          if (attempts >= 2) {
            console.warn("[Auth] Supabase unreachable after retries — showing error");
            sessionStorage.removeItem("auth_retries");
          } else {
            console.warn(
              "[Auth] Supabase unreachable — clearing stale session, retry",
              attempts + 1,
            );
            sessionStorage.setItem("auth_retries", String(attempts + 1));
            localStorage.clear();
            window.location.reload();
            return;
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        try {
          await loadProfile(u.id, u.email ?? "");
        } catch (e) {
          console.warn("[Auth] loadProfile error on auth change:", e);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId: string, email: string) {
    const { data, error } = await db().from("profiles").select("*").eq("id", userId).single();

    if (error) {
      console.warn("[Auth] profile query error:", error.message);
    }

    const isSuper = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
    let finalProfile: Profile;

    if (data) {
      const authName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || "";
      const profileName = data.display_name || authName || data.name || email.split("@")[0];
      if (isSuper && data.role !== "super_admin") {
        finalProfile = {
          ...data,
          name: profileName,
          display_name: profileName,
          role: "super_admin" as const,
        } as Profile;
        await db()
          .from("profiles")
          .upsert({ id: userId, display_name: profileName, role: "super_admin", email });
      } else {
        finalProfile = {
          ...data,
          name: profileName,
          display_name: profileName,
          role: (data.role || "developer") as UserRole,
        } as Profile;
        if (!data.display_name || data.display_name.trim() === "") {
          await db().from("profiles").upsert({ id: userId, display_name: profileName });
        }
      }
    } else {
      let role: UserRole = isSuper ? "super_admin" : "developer";
      let inviteName = "";
      if (!isSuper) {
        try {
          const { data: invite } = await db()
            .from("invitations")
            .select("role, name")
            .eq("email", email.toLowerCase())
            .maybeSingle();
          if (invite) {
            role = invite.role as UserRole;
            inviteName = invite.name;
          }
        } catch {
          // invitations table may not exist
        }
      }
      const authName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || "";
      const displayName = inviteName || authName || email.split("@")[0];
      finalProfile = { id: userId, email, name: displayName, display_name: displayName, role };
      try {
        await db().from("profiles").upsert({ id: userId, display_name: displayName, role, email });
      } catch (e) {
        console.warn("[Auth] failed to create profile:", e);
      }
    }

    setProfile(finalProfile);
    writeCache(`profile:${userId}`, finalProfile);
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    } catch (e: unknown) {
      return errorMessage(e) || "Failed to connect. Please try again.";
    }
  }

  async function signUp(email: string, password: string, name: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } },
      });
      if (error) return error.message;
      if (data.user) {
        const isSuper = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
        let role: UserRole = isSuper ? "super_admin" : "developer";
        let profileName = name;
        if (!isSuper) {
          const { data: invite } = await db()
            .from("invitations")
            .select("role, name")
            .eq("email", email.toLowerCase())
            .maybeSingle();
          if (invite) {
            role = invite.role as UserRole;
            profileName = invite.name;
          }
        }
        const displayName = profileName || email.split("@")[0];
        const newProfile: Profile = {
          id: data.user.id,
          email,
          name: displayName,
          display_name: displayName,
          role,
        };
        await db()
          .from("profiles")
          .upsert({ id: data.user.id, display_name: displayName, role, email });
        try {
          if (role === "developer" || role === "qa") {
            const key = role === "developer" ? "developers" : "qa_users";
            const { data: existing } = await db()
              .from("settings")
              .select("value")
              .eq("key", key)
              .maybeSingle();
            const list: string[] = existing?.value ?? [];
            if (!list.some((n) => n.toLowerCase() === displayName.toLowerCase())) {
              await db()
                .from("settings")
                .upsert({ key, value: [...list, displayName] });
            }
          }
        } catch {
          /* settings may not exist yet */
        }
        setProfile(newProfile);
      }
      return null;
    } catch (e: unknown) {
      return errorMessage(e) || "Failed to connect. Please try again.";
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {
      /* best-effort */
    }
    setUser(null);
    setProfile(null);
  }

  async function resetPassword(email: string): Promise<string | null> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      return error?.message ?? null;
    } catch (e: unknown) {
      return errorMessage(e) || "Failed to connect. Please try again.";
    }
  }

  const value: AuthContextType = {
    user,
    profile,
    loading,
    recoveryMode,
    signIn,
    signUp,
    signOut,
    resetPassword,
    isSuperAdmin: profile?.role === "super_admin",
    isDeveloper: profile?.role === "developer",
    isQa: profile?.role === "qa",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
