import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SectionTitle } from "@/components/console";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Users, Code2, FlaskConical, X, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";

export const Route = createFileRoute("/members")({
  head: () => ({
    meta: [
      { title: "Members · Project Management" },
      { name: "description", content: "Manage project members." },
    ],
  }),
  component: MembersPage,
});

function UserCombobox({
  users,
  excluded,
  placeholder,
  onAdd,
}: {
  users: string[];
  excluded: string[];
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ex = new Set(excluded.map((e) => e.toLowerCase()));
    return users.filter((u) => !ex.has(u.toLowerCase()) && (!q || u.toLowerCase().includes(q)));
  }, [users, excluded, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors focus:outline-none focus:border-primary text-left">
          <Search className="size-3 shrink-0" />
          <span className="truncate">{placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search users..."
            className="h-9"
          />
          <CommandList>
            {matches.length === 0 ? (
              <CommandEmpty>No matching users.</CommandEmpty>
            ) : (
              matches.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    onAdd(name);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {name}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MemberList({
  names,
  onRemove,
  emptyLabel,
}: {
  names: string[];
  onRemove: (name: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-1.5 mb-3 max-h-56 overflow-y-auto no-scrollbar">
      {names.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">{emptyLabel}</p>
      ) : (
        names.map((n) => (
          <div
            key={n}
            className="flex items-center justify-between p-2.5 bg-card border border-border rounded text-sm"
          >
            <span className="truncate">{n}</span>
            <button
              onClick={() => onRemove(n)}
              className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-destructive shrink-0"
              aria-label={`Remove ${n}`}
            >
              <X className="size-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function MembersPage() {
  const {
    currentProject,
    developers,
    qaUsers,
    addDeveloper,
    removeDeveloper,
    addQaUser,
    removeQaUser,
  } = useProject();
  const { isLeader } = useAuth();
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setUsersLoading(true);
        const { data } = await supabase.from("profiles").select("display_name");
        if (!cancelled && data?.length) {
          setAllUsers(
            data
              .map((p) => p.display_name || "")
              .filter(Boolean)
              .sort(),
          );
        }
      } catch {
        /* ignore — profiles may be restricted */
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isLeader) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Project Management" }, { label: "Members" }]} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                You don't have permission to manage members.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const excluded = [...developers, ...qaUsers];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Project Management" }, { label: "Members" }]}
        status={{ label: currentProject?.name ?? "No project selected", tone: "info" }}
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {!currentProject ? (
            <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
              Select a project from the sidebar to manage its members. Users assigned to the project
              by an admin appear here automatically.
            </div>
          ) : (
            <>
              {/* Developers */}
              <section>
                <SectionTitle
                  hint={`${developers.length} member${developers.length === 1 ? "" : "s"}`}
                >
                  <span className="flex items-center gap-1.5">
                    <Code2 className="size-3.5" /> Developers
                  </span>
                </SectionTitle>
                <MemberList
                  names={developers}
                  onRemove={removeDeveloper}
                  emptyLabel="No developers assigned yet."
                />
                <div className="flex gap-2">
                  <UserCombobox
                    users={usersLoading ? [] : allUsers}
                    excluded={excluded}
                    placeholder={usersLoading ? "Loading users..." : "Search to add a developer..."}
                    onAdd={addDeveloper}
                  />
                </div>
              </section>

              {/* QA Engineers */}
              <section>
                <SectionTitle hint={`${qaUsers.length} member${qaUsers.length === 1 ? "" : "s"}`}>
                  <span className="flex items-center gap-1.5">
                    <FlaskConical className="size-3.5" /> QA Engineers
                  </span>
                </SectionTitle>
                <MemberList
                  names={qaUsers}
                  onRemove={removeQaUser}
                  emptyLabel="No QA engineers assigned yet."
                />
                <div className="flex gap-2">
                  <UserCombobox
                    users={usersLoading ? [] : allUsers}
                    excluded={excluded}
                    placeholder={
                      usersLoading ? "Loading users..." : "Search to add a QA engineer..."
                    }
                    onAdd={addQaUser}
                  />
                </div>
              </section>

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Users className="size-3.5" />
                Members are set per project. Use the project selector in the sidebar to switch
                projects — or{" "}
                <Link to="/admin" className="text-primary hover:underline">
                  ask an admin to assign users
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
