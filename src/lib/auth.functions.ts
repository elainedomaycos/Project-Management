import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "pm" | "developer" | "qa";

export type MeResult = {
  userId: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  team: string | null;
  roles: AppRole[];
  primary_role: AppRole | null;
};

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MeResult> => {
    const { supabase, userId, claims } = context;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, avatar_url, team")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const roleList = (roles ?? []).map((r) => r.role as AppRole);
    const order: AppRole[] = ["pm", "developer", "qa"];
    const primary = order.find((r) => roleList.includes(r)) ?? null;

    return {
      userId,
      email: (claims as { email?: string } | null)?.email ?? null,
      display_name: profile?.display_name ?? "User",
      avatar_url: profile?.avatar_url ?? null,
      team: profile?.team ?? null,
      roles: roleList,
      primary_role: primary,
    };
  });
