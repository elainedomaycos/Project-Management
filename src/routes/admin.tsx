import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/console";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Users, Shield, Code2, FlaskConical, GraduationCap } from "lucide-react";
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

type Project = { id: string; name: string };

type Membership = { user_id: string; project_id: string; role: string };

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Project Management" }, { name: "description", content: "User management." }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { profile, isAdmin } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameVersions, setNameVersions] = useState<Record<string, number>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [profilesRes, projectsRes, membershipsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("projects").select("id, name").order("name"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("group_memberships").select("user_id, project_id, role"),
      ]);
      if (profilesRes.data) setUsers(profilesRes.data as ManagedUser[]);
      if (projectsRes.data) setProjects(projectsRes.data as Project[]);
      if (membershipsRes.data) setMemberships(membershipsRes.data as Membership[]);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  function getUserProjectId(userId: string): string | null {
    const m = memberships.find((mem) => mem.user_id === userId);
    return m?.project_id ?? null;
  }

  async function assignProject(userId: string, projectId: string) {
    const old = memberships.find((m) => m.user_id === userId);
    if (old) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("group_memberships")
        .delete()
        .eq("user_id", userId)
        .eq("project_id", old.project_id);
    }
    if (projectId) {
      const user = users.find((u) => u.id === userId);
      const groupRole = user?.role === "leader" ? "leader" : user?.role === "viewer" ? "viewer" : "developer";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("group_memberships")
        .upsert({ user_id: userId, project_id: projectId, role: groupRole });
      if (error) {
        toast.error("Failed to assign project");
        return;
      }
    }
    setMemberships((prev) => [
      ...prev.filter((m) => m.user_id !== userId),
      ...(projectId ? [{ user_id: userId, project_id: projectId, role: "developer" }] : []),
    ]);
    toast.success(projectId ? "Project assigned" : "Project removed");
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
      toast.success("Role updated");
    } else {
      toast.error("Failed to update role");
    }
  }

  if (!isAdmin) {
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
      case "admin":
        return <Shield className="size-3.5" />;
      case "adviser":
        return <GraduationCap className="size-3.5" />;
      case "leader":
        return <Shield className="size-3.5 opacity-60" />;
      case "developer":
        return <Code2 className="size-3.5" />;
      case "viewer":
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
              <div className="bg-surface-2 border border-border rounded-lg">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] font-mono uppercase text-muted-foreground">
                      <th className="px-4 py-2 w-[25%]">Name</th>
                      <th className="px-4 py-2 w-[30%]">Email</th>
                      <th className="px-4 py-2 w-[20%]">Role</th>
                      <th className="px-4 py-2 w-[25%]">Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const effectiveRole: UserRole = (u.role as UserRole) || "developer";
                      const selectedProject = getUserProjectId(u.id);
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
                          <td className="px-4 py-2 text-muted-foreground truncate max-w-0">{u.email}</td>
                          <td className="px-4 py-2">
                            <select
                              value={effectiveRole}
                              onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                              className="px-2 py-1 rounded bg-background border border-border text-xs font-medium focus:outline-none focus:border-primary"
                            >
                              <option value="admin">Block Coordinator</option>
                              <option value="leader">Group Leader</option>
                              <option value="developer">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={selectedProject ?? ""}
                              onChange={(e) => assignProject(u.id, e.target.value)}
                              className="w-full px-2 py-1 rounded bg-background border border-border text-xs font-medium focus:outline-none focus:border-primary"
                            >
                              <option value="">No project</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
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
