import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/console";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Users, Shield, Code2, FlaskConical } from "lucide-react";
import type { UserRole } from "@/lib/auth-context";
import { toast } from "sonner";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  display_name: string;
  role: UserRole;
  created_at: string;
};

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Task Tracker" }, { name: "description", content: "User management." }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { profile, isSuperAdmin } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameVersions, setNameVersions] = useState<Record<string, number>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setUsers(data as ManagedUser[]);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  async function updateName(userId: string, newName: string) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const oldName = user.display_name || user.name;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    const duplicate = users.some(
      (u) => u.id !== userId && u.display_name?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setNameErrors((prev) => ({ ...prev, [userId]: "Name already taken" }));
      setNameVersions((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
      setTimeout(
        () =>
          setNameErrors((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          }),
        3000,
      );
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", userId);

    if (!error) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, display_name: trimmed } : u)));

      const { data: devSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "developers")
        .maybeSingle();
      const { data: qaSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "qa_users")
        .maybeSingle();
      const devList: string[] = (devSetting?.value ?? []) as string[];
      const qaList: string[] = (qaSetting?.value ?? []) as string[];

      const replaceInList = (list: string[]) =>
        list.map((n) => (n.toLowerCase() === oldName.toLowerCase() ? trimmed : n));

      if (devList.some((n) => n.toLowerCase() === oldName.toLowerCase())) {
        await supabase
          .from("settings")
          .upsert({ key: "developers", value: replaceInList(devList) });
      }
      if (qaList.some((n) => n.toLowerCase() === oldName.toLowerCase())) {
        await supabase.from("settings").upsert({ key: "qa_users", value: replaceInList(qaList) });
      }
      toast.success("Name updated");
    } else {
      toast.error("Failed to update name");
    }
  }

  async function updateRole(userId: string, newRole: UserRole) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);

    if (!error) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));

      const userName = user.display_name || user.name;
      if (!userName) return;

      const { data: devSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "developers")
        .maybeSingle();
      const { data: qaSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "qa_users")
        .maybeSingle();
      const devList: string[] = (devSetting?.value ?? []) as string[];
      const qaList: string[] = (qaSetting?.value ?? []) as string[];

      if (newRole === "developer") {
        if (!devList.some((n) => n.toLowerCase() === userName.toLowerCase())) {
          await supabase
            .from("settings")
            .upsert({ key: "developers", value: [...devList, userName] });
        }
        if (qaList.some((n) => n.toLowerCase() === userName.toLowerCase())) {
          await supabase.from("settings").upsert({
            key: "qa_users",
            value: qaList.filter((n) => n.toLowerCase() !== userName.toLowerCase()),
          });
        }
      } else if (newRole === "qa") {
        if (!qaList.some((n) => n.toLowerCase() === userName.toLowerCase())) {
          await supabase.from("settings").upsert({ key: "qa_users", value: [...qaList, userName] });
        }
        if (devList.some((n) => n.toLowerCase() === userName.toLowerCase())) {
          await supabase.from("settings").upsert({
            key: "developers",
            value: devList.filter((n) => n.toLowerCase() !== userName.toLowerCase()),
          });
        }
      } else {
        if (devList.some((n) => n.toLowerCase() === userName.toLowerCase())) {
          await supabase.from("settings").upsert({
            key: "developers",
            value: devList.filter((n) => n.toLowerCase() !== userName.toLowerCase()),
          });
        }
        if (qaList.some((n) => n.toLowerCase() === userName.toLowerCase())) {
          await supabase.from("settings").upsert({
            key: "qa_users",
            value: qaList.filter((n) => n.toLowerCase() !== userName.toLowerCase()),
          });
        }
      }
      toast.success("Role updated");
    } else {
      toast.error("Failed to update role");
    }
  }

  if (!isSuperAdmin) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Admin" }]} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                You don't have permission to manage users.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const roleIcon = (r: string) => {
    switch (r) {
      case "super_admin":
        return <Shield className="size-3.5" />;
      case "developer":
        return <Code2 className="size-3.5" />;
      case "qa":
        return <FlaskConical className="size-3.5" />;
      default:
        return null;
    }
  };

  return (
    <>
      <PageHeader crumbs={[{ label: "Admin" }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Users */}
          <section>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Users className="size-4" />
              Registered Users
            </h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : (
              <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] font-mono uppercase text-muted-foreground">
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Role</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const effectiveRole: UserRole = (u.role as UserRole) || "developer";
                      return (
                        <tr key={u.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2">
                            <input
                              key={`${u.id}-name-${nameVersions[u.id] ?? 0}`}
                              defaultValue={u.display_name || u.name || ""}
                              onBlur={(e) => updateName(u.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-surface-2 rounded text-sm font-medium focus:outline-none"
                            />
                            {nameErrors[u.id] && (
                              <span className="text-[10px] text-destructive mt-0.5 block">
                                {nameErrors[u.id]}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-2">
                            <select
                              value={effectiveRole}
                              onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                              className="px-2 py-1 rounded bg-background border border-border text-xs font-medium focus:outline-none focus:border-primary"
                            >
                              <option value="super_admin">Super Admin</option>
                              <option value="developer">Developer</option>
                              <option value="qa">QA</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                              {roleIcon(effectiveRole)}
                              {effectiveRole.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
