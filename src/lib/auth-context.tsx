import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/local-cache";
import type { User } from "@supabase/supabase-js";

// Capstone hierarchy: admin (block coordinator) > leader > developer > viewer.
// Adviser is a parallel reviewer role scoped to assigned projects.
export type UserRole = "admin" | "adviser" | "leader" | "developer" | "viewer";

export type Profile = {
  id: string;
  email: string;
  name: string;
  display_name: string;
  role: UserRole;
};

// Bootstrap allowlist — mirrors the DB-side is_admin_email() helper and the
// `admin_emails` settings key. Keep in sync with src/supabase/migrations/.
const ADMIN_EMAILS = [
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
  isAdmin: boolean;
  isLeader: boolean;
  isViewer: boolean;
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
  // Flips true once init()'s server-validated getUser() settles. Until then,
  // auth events are ignored so an unverified cached session can't paint the
  // dashboard before validation completes.
  const bootedRef = useRef(false);

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
        // Fast path: nothing stored locally -> not signed in. Skip the network
        // entirely so logged-out boots land on /auth instantly.
        const {
          data: { session: cachedSession },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!cachedSession) return;

        // A token exists — verify it server-side before trusting it:
        // getSession() does NOT verify the JWT, so a stale session (e.g. left
        // over from a previous Supabase config on this origin) would paint the
        // dashboard briefly before the background refresh failed and bounced
        // the user to /auth. getUser() performs a real /auth/v1/user check.
        const {
          data: { user: u },
          error,
        } = await withTimeout(supabase.auth.getUser(), 10000);
        if (cancelled) return;
        if (error || !u) {
          if (error && !error.message.includes("session missing")) {
            console.warn("[Auth] getUser error:", error.message);
          }
          // Clear the invalid/stale token so the gate doesn't trust it again.
          try {
            await supabase.auth.signOut();
          } catch {
            /* nothing stored — fine */
          }
          return;
        }
        setUser(u);
        const cached = readCache<Profile>(`profile:${u.id}`);
        if (cached) setProfile(cached);
        try {
          await loadProfile(u.id, u.email ?? "");
        } catch (e) {
          console.warn("[Auth] loadProfile error:", e);
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
            // Scope the reset to this app's auth state instead of wiping all
            // of localStorage (other keys may belong to other tooling).
            try {
              await supabase.auth.signOut();
            } catch {
              /* best-effort */
            }
            window.location.reload();
            return;
          }
        }
      } finally {
        bootedRef.current = true;
        if (!cancelled) setLoading(false);
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
      // Boot-time truth comes solely from init()'s server-validated getUser().
      // INITIAL_SESSION replays the unverified cached session, and any event
      // racing init() would set the user before validation completes — which
      // flashed the dashboard briefly before bouncing to /auth.
      if (event === "INITIAL_SESSION" || !bootedRef.current) return;
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

    const isAdminEmail = ADMIN_EMAILS.includes(email.toLowerCase());
    let finalProfile: Profile;

    if (data) {
      const authName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || "";
      const profileName = data.display_name || authName || data.name || email.split("@")[0];
      // Self-heal allowlisted coordinators to `admin` (DB trigger permits this
      // via is_admin_email even when the row isn't admin yet).
      if (isAdminEmail && data.role !== "admin") {
        finalProfile = {
          ...data,
          name: profileName,
          display_name: profileName,
          role: "admin" as const,
        } as Profile;
        await db()
          .from("profiles")
          .upsert({ id: userId, display_name: profileName, role: "admin", email });
      } else {
        const rawRole = data.role as UserRole | undefined;
        const role: UserRole =
          rawRole === "admin" ||
          rawRole === "adviser" ||
          rawRole === "leader" ||
          rawRole === "viewer"
            ? rawRole
            : "developer";
        finalProfile = {
          ...data,
          name: profileName,
          display_name: profileName,
          role,
        } as Profile;
        if (!data.display_name || data.display_name.trim() === "") {
          await db().from("profiles").upsert({ id: userId, display_name: profileName });
        }
      }
    } else {
      let role: UserRole = isAdminEmail ? "admin" : "developer";
      let inviteName = "";
      if (!isAdminEmail) {
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
        const isAdminEmail = ADMIN_EMAILS.includes(email.toLowerCase());
        let role: UserRole = isAdminEmail ? "admin" : "developer";
        let profileName = name;
        if (!isAdminEmail) {
          const { data: invite } = await db()
            .from("invitations")
            .select("role, name")
            .eq("email", email.toLowerCase())
            .maybeSingle();
          if (invite) {
            const inviteRole = invite.role as UserRole;
            role =
              inviteRole === "admin" ||
              inviteRole === "adviser" ||
              inviteRole === "leader" ||
              inviteRole === "viewer"
                ? inviteRole
                : "developer";
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
          if (role === "developer") {
            const key = "developers";
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
    isAdmin: profile?.role === "admin",
    isLeader: profile?.role === "leader",
    isViewer: profile?.role === "viewer",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
