import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useProject } from "@/lib/project-context";
import { Archive, RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Archive · Task Tracker" },
      { name: "description", content: "Restore or permanently delete archived projects." },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const { archivedProjects, restoreProject, removeProject } = useProject();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Task Tracker" }, { label: "Archive" }]}
        status={{ label: `${archivedProjects.length} archived`, tone: "warn" }}
      />
      <div className="p-6">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Archived Projects</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Archived projects are hidden from the workspace. Restore them to bring them back, or
                permanently delete them.
              </p>
            </div>
          </div>

          {archivedProjects.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-lg">
              <Archive className="size-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No archived projects.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedProjects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg"
                >
                  <div className="size-9 rounded bg-surface-2 border border-border grid place-items-center text-sm font-bold text-muted-foreground shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.archivedAt
                        ? `Archived ${new Date(p.archivedAt).toLocaleDateString()}`
                        : "Archived"}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreProject(p.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono uppercase text-success border border-success/30 hover:bg-success/5 transition-colors rounded shrink-0"
                  >
                    <RotateCcw className="size-3" />
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Permanently delete "${p.name}" and all its tasks? This cannot be undone.`,
                        )
                      ) {
                        removeProject(p.id);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono uppercase text-destructive border border-destructive/30 hover:bg-destructive/5 transition-colors rounded shrink-0"
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
