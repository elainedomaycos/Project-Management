import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

/** Role inside a capstone group (group_memberships.role). */
export type GroupRole = "leader" | "developer" | "viewer";

export const SYSTEM_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Block Coordinator",
  adviser: "Adviser",
  leader: "Group Leader",
  developer: "Member",
  viewer: "Viewer",
};

export const GROUP_ROLE_LABELS: Record<GroupRole, string> = {
  leader: "Leader",
  developer: "Member",
  viewer: "Viewer",
};

const ROLE_RANK: Record<UserRole, number> = {
  admin: 4,
  leader: 3,
  developer: 2,
  viewer: 1,
  adviser: 0, // reviewer role — access comes from project assignment, not rank
};

export function atLeast(role: UserRole | null | undefined, min: UserRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Effective permission over a specific project, combining the system role
 * with the user's group_memberships row for that project.
 */
export type ProjectAccess = {
  /** Can configure/delete the project and manage its membership. */
  manage: boolean;
  /** Can create/edit/assign tasks and post timeline items. */
  coordinate: boolean;
  /** Can move own/dev-assigned tasks through statuses (developer+ / leader / admin). */
  work: boolean;
  /** Read-only visibility (everyone with any access, incl. viewers). */
  view: boolean;
};

export function accessFor(
  systemRole: UserRole | null | undefined,
  groupRole: GroupRole | null | undefined,
): ProjectAccess {
  // System admins transcend group rows.
  if (systemRole === "admin") {
    return { manage: true, coordinate: true, work: true, view: true };
  }
  switch (groupRole ?? null) {
    case "leader":
      return { manage: false, coordinate: true, work: true, view: true };
    case "developer":
      return { manage: false, coordinate: false, work: true, view: true };
    case "viewer":
      return { manage: false, coordinate: false, work: false, view: true };
    default:
      // No group row: leaders keep global read/work via system role.
      if (atLeast(systemRole, "leader")) {
        return { manage: false, coordinate: atLeast(systemRole, "leader"), work: true, view: true };
      }
      return { manage: false, coordinate: false, work: false, view: false };
  }
}

// Generated Supabase types don't include group_memberships yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

/**
 * Current user's group role for a project. Falls back to their system role
 * semantics when no membership row exists.
 */
export function useGroupRole(projectId: string | null | undefined, systemRole: UserRole | null) {
  const [groupRole, setGroupRole] = useState<GroupRole | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setGroupRole(null);
    if (!projectId || systemRole === "admin") return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await db()
          .from("group_memberships")
          .select("role")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setGroupRole((data?.role as GroupRole | undefined) ?? null);
      } catch {
        /* table may not exist pre-migration */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, systemRole]);

  return accessFor(systemRole, groupRole);
}
