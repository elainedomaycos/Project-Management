import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/console";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, Pencil } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile · Capstone PM" },
      { name: "description", content: "View and edit your member profile." },
    ],
  }),
  component: ProfilePage,
});

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

const profileSchema = z.object({
  display_name: z.string().min(1, "Name is required"),
  role_title: z.string().optional(),
  bio: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const ROLE_LABELS: Record<string, string> = {
  admin: "Block Coordinator",
  leader: "Group Leader",
  developer: "Member",
  viewer: "Viewer",
};

function ProfilePage() {
  const { user, profile: authProfile } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await db().from("profiles").select("*").eq("id", user.id).single();
      return data as {
        display_name: string;
        email: string | null;
        role?: string;
        role_title?: string | null;
        bio?: string | null;
      } | null;
    },
    enabled: !!user?.id,
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      display_name: profile?.display_name ?? "",
      role_title: profile?.role_title ?? "",
      bio: profile?.bio ?? "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const { error } = await db()
        .from("profiles")
        .update({
          display_name: data.display_name,
          role_title: data.role_title ?? "",
          bio: data.bio ?? "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success("Profile updated");
      setEditing(false);
      queryClient.setQueryData(["my-profile", user?.id], (old: Record<string, unknown> | null) =>
        old ? { ...old, ...variables } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const [editing, setEditing] = useState(false);
  const role = authProfile?.role ?? "developer";
  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "?";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "??";

  if (isLoading) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Capstone PM" }, { label: "My Profile" }]} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 text-muted-foreground animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Capstone PM" }, { label: "My Profile" }]}
        actions={
          !editing ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-2 transition-colors"
            >
              <Pencil className="size-3" />
              Edit Profile
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 w-full max-w-xl mx-auto">
          <div className="bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Member Profile
              </h2>
            </div>

            <div className="p-5">
              {editing ? (
                <form
                  onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
                  className="space-y-4"
                >
                  <Field label="Name" error={form.formState.errors.display_name?.message}>
                    <input
                      {...form.register("display_name")}
                      className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    />
                  </Field>

                  <Field label="Role Title">
                    <input
                      {...form.register("role_title")}
                      placeholder="e.g. Frontend Developer"
                      className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    />
                  </Field>

                  <Field label="Bio">
                    <textarea
                      {...form.register("bio")}
                      rows={3}
                      placeholder="A short introduction..."
                      className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
                    />
                  </Field>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saveMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 disabled:opacity-50"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Save className="size-3" />
                      )}
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="size-14 rounded-full bg-primary/10 border border-primary/20 grid place-items-center text-lg font-bold text-primary shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold truncate">{displayName}</h3>
                      <div className="text-xs text-muted-foreground truncate">
                        {profile?.email ?? user?.email}
                      </div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 text-[10px] font-mono uppercase bg-primary/10 text-primary border border-primary/20 rounded shrink-0">
                      {ROLE_LABELS[profile?.role ?? role] ?? "Member"}
                    </span>
                  </div>

                  {profile?.role_title && (
                    <div>
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        Role Title
                      </span>
                      <p className="text-sm mt-0.5">{profile.role_title}</p>
                    </div>
                  )}

                  {profile?.bio && (
                    <div>
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        Bio
                      </span>
                      <p className="text-sm text-muted-foreground mt-0.5">{profile.bio}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
    </div>
  );
}
