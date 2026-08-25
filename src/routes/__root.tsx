import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Code2,
  FlaskConical,
  ExternalLink,
  Key,
  ChevronDown,
  X,
  Shield,
  LogOut,
  User as UserIcon,
  UserCircle,
  Archive,
  Settings2,
  Menu,
  Plus,
  GanttChart,
  Target,
} from "lucide-react";

import appCss from "../styles.css?url";
import { ProjectProvider, useProject, type AppView } from "@/lib/project-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { TimelineProvider } from "@/lib/timeline-context";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { NotificationCenter } from "@/components/notification-center";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Project Management — Capstone Project Management" },
      {
        name: "description",
        content: "Lightweight task tracking for small teams. No Scrum jargon, just get work done.",
      },
      { property: "og:title", content: "Project Management" },
      {
        property: "og:description",
        content: "Simple project and task management for small teams.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/logo.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
};

const ALL_ROLES = ["admin", "adviser", "leader", "developer", "viewer"];

type NavSection = { heading: string; items: readonly NavItem[] };

const NAV_SECTIONS: readonly NavSection[] = [
  {
    heading: "Work",
    items: [
      {
        to: "/tasks",
        label: "Tasks",
        icon: ListChecks,
        roles: ["admin", "leader", "developer", "viewer"],
      },
      {
        to: "/developer",
        label: "Developer",
        icon: Code2,
        roles: ["admin", "leader", "developer"],
      },
      {
        to: "/qa",
        label: "QA Review",
        icon: FlaskConical,
        roles: ["admin", "leader", "developer"],
      },
      { to: "/defense", label: "Final Defense", icon: Target, roles: ALL_ROLES },
    ],
  },
  {
    heading: "View",
    items: [
      {
        to: "/client",
        label: "Client Portal",
        icon: ExternalLink,
        roles: ["admin", "leader", "developer", "viewer"],
      },
      {
        to: "/timeline",
        label: "Project Timeline",
        icon: GanttChart,
        roles: ["admin", "leader", "developer", "viewer"],
      },
    ],
  },
  {
    heading: "Manage",
    items: [
      {
        to: "/credentials",
        label: "Credentials",
        icon: Key,
        roles: ["admin", "leader", "developer"],
      },
      { to: "/admin", label: "Admin", icon: Shield, roles: ["admin"] },
      { to: "/archive", label: "Archive", icon: Archive, roles: ["admin"] },
    ],
  },
];

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/auth";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>
          <TimelineProvider>
            <AuthGate>
              {isAuthPage ? <Outlet /> : <AppShell pathname={pathname} queryClient={queryClient} />}
            </AuthGate>
          </TimelineProvider>
        </ProjectProvider>
      </AuthProvider>
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, recoveryMode } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/auth";

  useEffect(() => {
    if (loading) return;
    if (!user && !isAuthPage) {
      router.navigate({ to: "/auth" });
    } else if (user && isAuthPage && !recoveryMode) {
      router.navigate({ to: "/" });
    }
  }, [user, loading, recoveryMode, isAuthPage, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user && !isAuthPage) return null;
  if (user && isAuthPage && !recoveryMode) return null;

  return <>{children}</>;
}

function AppShell({ pathname, queryClient }: { pathname: string; queryClient: QueryClient }) {
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? "developer";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function canSee(item: NavItem) {
    return item.roles.includes(role);
  }

  const closeNav = () => setMobileNavOpen(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="fixed top-0 inset-x-0 z-40 lg:hidden flex items-center justify-between h-12 px-3 border-b border-border bg-sidebar">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>
          <div className="size-6 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold italic text-[11px]">
            TT
          </div>
          <span className="text-sm font-bold tracking-tight">Project Management</span>
        </div>
        <NotificationCenter />
      </div>

      {/* Desktop sidebar */}
      <nav className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-sidebar overflow-hidden">
        <div className="h-14 flex items-center gap-3 px-5 border-b border-border">
          <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold italic text-sm">
            TT
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">Project Management</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              v0.2 · console
            </div>
          </div>
          <div className="ml-auto">
            <NotificationCenter />
          </div>
        </div>
        <SidebarContent
          pathname={pathname}
          canSee={canSee}
          profile={profile}
          signOut={signOut}
          onNavigate={closeNav}
        />
      </nav>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={closeNav} />
          <nav className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar border-r border-border flex flex-col shadow-xl">
            <div className="h-12 flex items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold italic text-[11px]">
                  TT
                </div>
                <span className="text-sm font-bold tracking-tight">Project Management</span>
              </div>
              <button
                onClick={closeNav}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </div>
            <SidebarContent
              pathname={pathname}
              canSee={canSee}
              profile={profile}
              signOut={signOut}
              onNavigate={closeNav}
            />
          </nav>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden pt-12 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarContent({
  pathname,
  canSee,
  profile,
  signOut,
  onNavigate,
}: {
  pathname: string;
  canSee: (item: NavItem) => boolean;
  profile: ReturnType<typeof useAuth>["profile"];
  signOut: () => void;
  onNavigate: () => void;
}) {
  return (
    <>
      <div className="px-3 pt-3 pb-1">
        <ProjectSelector />
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-2 no-scrollbar">
        {/* Dashboard always first */}
        <div className="px-1 mb-1">
          <Link
            to="/"
            onClick={onNavigate}
            className={[
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              pathname === "/"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
            ].join(" ")}
          >
            <LayoutDashboard className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">Dashboard</span>
          </Link>
        </div>

        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter(canSee);
          if (visible.length === 0) return null;
          return (
            <div key={section.heading} className="px-1 mt-4 first:mt-0">
              <div className="px-3 pb-1.5 text-[9px] font-mono uppercase text-muted-foreground/60 tracking-widest">
                {section.heading}
              </div>
              {visible.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={[
                      "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                    ].join(" ")}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border space-y-2">
        {profile && (
          <Link
            to="/profile"
            onClick={onNavigate}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
          >
            <div className="size-7 rounded-full bg-surface-2 border border-border grid place-items-center text-[9px] font-bold shrink-0">
              {profile.name?.slice(0, 2).toUpperCase() || profile.email?.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{profile.name || "User"}</div>
              <div className="text-[9px] font-mono text-muted-foreground capitalize truncate">
                {(profile.role || "developer").replace("_", " ")}
              </div>
            </div>
          </Link>
        )}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="size-3.5" />
          Sign Out
        </button>
      </div>
    </>
  );
}

function TagDropdown({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function add() {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parsed.length) return;
    onChange([...items, ...parsed].filter((v, i, a) => a.indexOf(v) === i));
    setDraft("");
  }

  return (
    <div className="mt-1" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
      >
        <span className={items.length ? "truncate" : "text-muted-foreground"}>
          {items.length ? items.join(", ") : "None"}
        </span>
        <ChevronDown
          className={`size-3 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {items.length > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-0"
                >
                  <span className="text-xs truncate">{item}</span>
                  <button
                    onClick={() => onChange(items.filter((i) => i !== item))}
                    className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    aria-label={`Remove ${item}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">No items yet</p>
          )}
          <div className="flex gap-1 p-2 border-t border-border">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={placeholder}
              className="flex-1 px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={add}
              className="shrink-0 px-2.5 rounded-md bg-primary text-primary-foreground grid place-items-center hover:brightness-110"
              aria-label="Add item"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectSelector() {
  const { projects, currentProject, setCurrentProject, addProject, updateProject, archiveProject } =
    useProject();
  const { isAdmin } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    clientName: string;
    endUsers: string[];
    modules: string[];
  }>({ name: "", clientName: "", endUsers: [], modules: [] });
  const [showManage, setShowManage] = useState(false);
  const [manageForm, setManageForm] = useState<{
    clientName: string;
    endUsers: string[];
    modules: string[];
  }>({ clientName: "", endUsers: [], modules: [] });
  const [advisers, setAdvisers] = useState<{ id: string; name: string }[]>([]);
  const [adviserId, setAdviserId] = useState<string>("");

  function openManage() {
    if (!currentProject) return;
    setManageForm({
      clientName: currentProject.clientName || "",
      endUsers: [...(currentProject.endUsers ?? [])],
      modules: [...(currentProject.modules ?? [])],
    });
    setAdviserId(currentProject.adviserId ?? "");
    setShowManage(true);
    // Load adviser accounts for assignment (RLS: profiles readable by authenticated)
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("profiles")
          .select("id, display_name, email")
          .eq("role", "adviser");
        setAdvisers(
          ((data ?? []) as { id: string; display_name: string; email: string }[]).map((p) => ({
            id: p.id,
            name: p.display_name || p.email,
          })),
        );
      } catch {
        setAdvisers([]);
      }
    })();
  }

  function handleManage() {
    if (!currentProject) return;
    updateProject(currentProject.id, {
      clientName: manageForm.clientName.trim(),
      endUsers: manageForm.endUsers,
      modules: manageForm.modules,
      adviserId: adviserId || null,
    });
    setShowManage(false);
  }

  function handleCreate() {
    if (!form.name.trim()) return;
    addProject({
      name: form.name.trim(),
      clientName: form.clientName.trim(),
      endUsers: form.endUsers,
      modules: form.modules,
    });
    setForm({ name: "", clientName: "", endUsers: [], modules: [] });
    setShowModal(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <select
          value={currentProject?.id ?? "__all__"}
          onChange={(e) => setCurrentProject(e.target.value === "__all__" ? null : e.target.value)}
          className="w-full appearance-none px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs font-medium focus:outline-none focus:border-primary cursor-pointer"
        >
          <option value="__all__">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
      </div>
      {isAdmin && (
        <div className="flex gap-1">
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
          >
            + New
          </button>
          {currentProject && (
            <button
              onClick={openManage}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase text-muted-foreground border border-border/60 hover:bg-surface-2 transition-colors"
            >
              <Settings2 className="size-2.5" />
              Manage
            </button>
          )}
          {projects.length > 1 && currentProject && (
            <button
              onClick={() => archiveProject(currentProject.id)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase text-warning border border-warning/30 hover:bg-warning/5 transition-colors"
            >
              <Archive className="size-2.5" />
              Archive
            </button>
          )}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">New Project</span>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Project Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Tourism Website"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Task IDs will be auto-generated from the project name (e.g. TS-001)
                </p>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Client Name
                </label>
                <input
                  value={form.clientName}
                  onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))}
                  placeholder="e.g. Acme Corp"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  End Users
                </label>
                <TagDropdown
                  items={form.endUsers}
                  onChange={(items) => setForm((p) => ({ ...p, endUsers: items }))}
                  placeholder="Add an end user..."
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Modules
                </label>
                <TagDropdown
                  items={form.modules}
                  onChange={(items) => setForm((p) => ({ ...p, modules: items }))}
                  placeholder="Add a module..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showManage && currentProject && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => setShowManage(false)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">Manage Project</span>
              <button
                onClick={() => setShowManage(false)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground bg-surface-2 border border-border rounded-md px-3 py-2">
                {currentProject.name}
              </p>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Client Name
                </label>
                <input
                  value={manageForm.clientName}
                  onChange={(e) => setManageForm((p) => ({ ...p, clientName: e.target.value }))}
                  placeholder="e.g. Acme Corp"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Adviser
                </label>
                <select
                  value={adviserId}
                  onChange={(e) => setAdviserId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">No adviser assigned</option>
                  {advisers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Create adviser accounts via Admin (role: Adviser), then assign them here.
                </p>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  End Users
                </label>
                <TagDropdown
                  items={manageForm.endUsers}
                  onChange={(items) => setManageForm((p) => ({ ...p, endUsers: items }))}
                  placeholder="Add an end user..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  These are the users who use the system, used when assigning tasks and credentials.
                </p>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Modules
                </label>
                <TagDropdown
                  items={manageForm.modules}
                  onChange={(items) => setManageForm((p) => ({ ...p, modules: items }))}
                  placeholder="Add a module..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Used in the module dropdown when creating tasks.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setShowManage(false)}
                className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={handleManage}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
