import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

export type ActivityAction =
  | "task_created"
  | "task_status"
  | "task_completed"
  | "task_assigned"
  | "document_uploaded"
  | "document_deleted"
  | "feedback_added"
  | "feedback_addressed"
  | "feedback_updated"
  | "feedback_deleted"
  | "feedback_task"
  | "deliverable_updated"
  | "deliverable_approved"
  | "deliverable_rejected"
  | "defense_date_set"
  | "health_changed";

export const ACTION_LABELS: Record<string, string> = {
  task_created: "created task",
  task_status: "updated task status",
  task_completed: "completed task",
  task_assigned: "assigned task",
  document_uploaded: "uploaded document",
  document_deleted: "deleted document",
  feedback_added: "left feedback",
  feedback_addressed: "addressed feedback",
  feedback_updated: "updated feedback",
  feedback_deleted: "deleted feedback",
  feedback_task: "converted feedback to task",
  deliverable_updated: "updated deliverable",
  deliverable_approved: "approved deliverable",
  deliverable_rejected: "rejected deliverable",
  defense_date_set: "set final defense date",
  health_changed: "changed group health",
};

let cachedName: string | null = null;
let cachedId: string | null = null;

async function currentUser(): Promise<{ id: string; name: string } | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    if (cachedId === user.id && cachedName) return { id: cachedId, name: cachedName };
    const { data } = await db().from("profiles").select("display_name").eq("id", user.id).single();
    const name = data?.display_name || user.email?.split("@")[0] || "";
    cachedId = user.id;
    cachedName = name;
    return { id: user.id, name };
  } catch {
    return null;
  }
}

/**
 * Append-only activity entry. Never throws — logging must not break UX.
 */
export async function logActivity(
  projectId: string | null | undefined,
  action: ActivityAction,
  detail: string,
  entityType = "",
  entityId = "",
): Promise<void> {
  if (!projectId) return;
  try {
    const u = await currentUser();
    if (!u) return;
    await db().from("activity_log").insert({
      project_id: projectId,
      user_id: u.id,
      user_name: u.name,
      action,
      entity_type: entityType,
      entity_id: entityId,
      detail,
    });
  } catch {
    /* best-effort */
  }
}
