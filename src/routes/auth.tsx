import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In · Task Tracker" },
      { name: "description", content: "Sign in to Task Tracker" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword, user, recoveryMode } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (user && !recoveryMode) {
      navigate({ to: "/" });
    }
  }, [user, recoveryMode, navigate]);

  if (user && !recoveryMode) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "login") {
      const msg = await signIn(email, password);
      if (msg) {
        setError(msg);
        return;
      }
      navigate({ to: "/" });
    } else {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      const msg = await signUp(email, password, name);
      if (msg) {
        setError(msg);
        return;
      }
      setSuccess("Account created! Check your email to confirm, then sign in.");
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setResetting(true);
    setError(null);
    setSuccess(null);
    const msg = await resetPassword(email);
    if (msg) {
      setError(msg);
    } else {
      setSuccess("Password reset link sent! Check your email.");
    }
    setResetting(false);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim()) {
      setError("Enter a new password");
      return;
    }
    setUpdating(true);
    setError(null);
    setSuccess(null);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    if (err) {
      setError(err.message);
    } else {
      setSuccess("Password updated! You can now sign in.");
      await supabase.auth.signOut();
    }
    setUpdating(false);
  }

  if (recoveryMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold italic text-lg mx-auto mb-3">
              TT
            </div>
            <h1 className="text-xl font-bold">Reset Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your new password</p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                autoFocus
                required
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-green-600 bg-green-500/5 border border-green-500/20 rounded-md px-3 py-2">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={updating}
              className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {updating ? "Updating..." : "Update Password"}
            </button>
          </form>

          {success && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setMode("login");
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold italic text-lg mx-auto mb-3">
            TT
          </div>
          <h1 className="text-xl font-bold">Task Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
              autoFocus={mode === "login"}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
              required
            />
          </div>

          {mode === "login" && (
            <div className="text-right">
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {resetting ? "Sending..." : "Forgot password?"}
              </button>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-600 bg-green-500/5 border border-green-500/20 rounded-md px-3 py-2">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition-all"
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setSuccess(null);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {mode === "login"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
