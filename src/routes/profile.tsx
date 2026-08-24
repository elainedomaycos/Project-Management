import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/console";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  UserCircle,
  Plus,
  X,
  Loader2,
  Save,
  Pencil,
  ExternalLink,
  Github,
  Globe,
  Palette,
  Smartphone,
  FileText,
  LinkIcon,
  Briefcase,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile · Task Tracker" },
      { name: "description", content: "Manage your profile and projects." },
    ],
  }),
  component: ProfilePage,
});

type LinkType = "live_demo" | "github" | "figma" | "play_store" | "case_study" | "website";

const LINK_TYPES: { value: LinkType; label: string; icon: typeof ExternalLink }[] = [
  { value: "live_demo", label: "Live Demo", icon: ExternalLink },
  { value: "github", label: "GitHub", icon: Github },
  { value: "figma", label: "Figma", icon: Palette },
  { value: "play_store", label: "Play Store", icon: Smartphone },
  { value: "case_study", label: "Case Study", icon: FileText },
  { value: "website", label: "Website", icon: Globe },
];

const PROJECT_TYPES = [
  { value: "personal", label: "Personal" },
  { value: "hackathon", label: "Hackathon" },
  { value: "freelance", label: "Freelance" },
];

const PROJECT_STATUSES = [
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

const profileSchema = z.object({
  display_name: z.string().min(1, "Name is required"),
  role_title: z.string().optional(),
  bio: z.string().optional(),
  team: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

type ProfileData = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  role_title: string | null;
  team: string | null;
  skills: string[] | null;
  links: { type: LinkType; url: string }[] | null;
};

type ProjectData = {
  id: string;
  name: string;
  short_description: string | null;
  project_type: string | null;
  role: string | null;
  technologies: string[] | null;
  image_url: string | null;
  status: string | null;
  links: { link_type: LinkType; url: string }[];
};

type ProjectForm = {
  name: string;
  short_description: string;
  project_type: string;
  role: string;
  technologies: string;
  image_url: string;
  status: string;
};

const EMPTY_PROJECT_FORM: ProjectForm = {
  name: "",
  short_description: "",
  project_type: "personal",
  role: "",
  technologies: "",
  image_url: "",
  status: "completed",
};

function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectForm>(EMPTY_PROJECT_FORM);
  const [projectLinks, setProjectLinks] = useState<{ type: LinkType; url: string }[]>([]);
  const [profileSkills, setProfileSkills] = useState<string[]>([]);
  const [profileLinks, setProfileLinks] = useState<{ type: LinkType; url: string }[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [newLinkType, setNewLinkType] = useState<LinkType>("github");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newProjLinkType, setNewProjLinkType] = useState<LinkType>("github");
  const [newProjLinkUrl, setNewProjLinkUrl] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async (): Promise<ProfileData | null> => {
      if (!user?.id) return null;
      const { data } = await db().from("profiles").select("*").eq("id", user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["my-projects", user?.id],
    queryFn: async (): Promise<ProjectData[]> => {
      if (!user?.id) return [];
      const { data: memberProjects } = await db()
        .from("member_projects")
        .select("id")
        .eq("owner_id", user.id);

      if (!memberProjects?.length) return [];

      const ids = memberProjects.map((p: { id: string }) => p.id);
      const [projRes, linkRes] = await Promise.all([
        db().from("member_projects").select("*").in("id", ids),
        db().from("project_links").select("*").in("project_id", ids),
      ]);

      const linksByProject = new Map<string, { link_type: LinkType; url: string }[]>();
      for (const link of linkRes.data ?? []) {
        const list = linksByProject.get(link.project_id) ?? [];
        list.push(link);
        linksByProject.set(link.project_id, list);
      }

      return (projRes.data ?? []).map((p: Omit<ProjectData, "links">) => ({
        ...p,
        links: linksByProject.get(p.id) ?? [],
      }));
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile) {
      setProfileSkills(profile.skills ?? []);
      setProfileLinks(profile.links ?? []);
    }
  }, [profile]);

  const profileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const { error } = await db()
        .from("profiles")
        .update({
          display_name: data.display_name,
          role_title: data.role_title ?? "",
          bio: data.bio ?? "",
          team: data.team ?? "",
          skills: profileSkills,
          links: profileLinks,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      setEditingProfile(false);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const projectMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      links,
    }: {
      id?: string;
      data: ProjectForm;
      links: { type: LinkType; url: string }[];
    }) => {
      const techs = data.technologies
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (id) {
        await db()
          .from("member_projects")
          .update({
            name: data.name,
            short_description: data.short_description,
            project_type: data.project_type,
            role: data.role,
            technologies: techs,
            image_url: data.image_url,
            status: data.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        await db().from("project_links").delete().eq("project_id", id);
        if (links.length > 0) {
          await db()
            .from("project_links")
            .insert(links.map((l) => ({ project_id: id, link_type: l.type, url: l.url })));
        }
      } else {
        const { data: newProj } = await db()
          .from("member_projects")
          .insert({
            owner_id: user!.id,
            name: data.name,
            short_description: data.short_description,
            project_type: data.project_type,
            role: data.role,
            technologies: techs,
            image_url: data.image_url,
            status: data.status,
          })
          .select("id")
          .single();

        if (newProj && links.length > 0) {
          await db()
            .from("project_links")
            .insert(links.map((l) => ({ project_id: newProj.id, link_type: l.type, url: l.url })));
        }
      }
    },
    onSuccess: () => {
      toast.success("Project saved");
      setEditingProject(null);
      setShowNewProject(false);
      setProjectForm(EMPTY_PROJECT_FORM);
      setProjectLinks([]);
      queryClient.invalidateQueries({ queryKey: ["my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: () => toast.error("Failed to save project"),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await db().from("project_links").delete().eq("project_id", id);
      await db().from("project_members").delete().eq("project_id", id);
      await db().from("member_projects").delete().eq("id", id);
    },
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({ queryKey: ["my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: () => toast.error("Failed to delete project"),
  });

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      display_name: profile?.display_name ?? "",
      role_title: profile?.role_title ?? "",
      bio: profile?.bio ?? "",
      team: profile?.team ?? "",
    },
  });

  if (profileLoading) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Task Tracker" }, { label: "My Profile" }]} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 text-muted-foreground animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Task Tracker" }, { label: "My Profile" }]}
        actions={
          !editingProfile ? (
            <button
              onClick={() => setEditingProfile(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-2 transition-colors"
            >
              <Pencil className="size-3" />
              Edit Profile
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 w-full max-w-3xl mx-auto">
          {/* Profile Section */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Profile Information
              </h2>
            </div>

            <div className="p-5">
              {editingProfile ? (
                <form
                  onSubmit={profileForm.handleSubmit((data) => profileMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" error={profileForm.formState.errors.display_name?.message}>
                      <input
                        {...profileForm.register("display_name")}
                        className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                      />
                    </Field>
                    <Field label="Role Title">
                      <input
                        {...profileForm.register("role_title")}
                        placeholder="e.g. UI/UX Designer"
                        className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                      />
                    </Field>
                  </div>

                  <Field label="Team">
                    <input
                      {...profileForm.register("team")}
                      placeholder="e.g. Engineering"
                      className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    />
                  </Field>

                  <Field label="Bio">
                    <textarea
                      {...profileForm.register("bio")}
                      rows={3}
                      placeholder="Tell us about yourself..."
                      className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
                    />
                  </Field>

                  {/* Skills */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">
                      Skills
                    </label>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {profileSkills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-surface-2 border border-border rounded"
                        >
                          {skill}
                          <button
                            type="button"
                            onClick={() =>
                              setProfileSkills((prev) => prev.filter((s) => s !== skill))
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newSkill.trim()) {
                            e.preventDefault();
                            setProfileSkills((prev) => [...prev, newSkill.trim()]);
                            setNewSkill("");
                          }
                        }}
                        placeholder="Add skill..."
                        className="flex-1 px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newSkill.trim()) {
                            setProfileSkills((prev) => [...prev, newSkill.trim()]);
                            setNewSkill("");
                          }
                        }}
                        className="px-2 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Profile Links */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">
                      Links
                    </label>
                    <div className="space-y-2 mt-2">
                      {profileLinks.map((link, idx) => {
                        const cfg = LINK_TYPES.find((l) => l.value === link.type);
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-20 shrink-0">
                              {cfg?.label ?? link.type}
                            </span>
                            <span className="text-xs truncate flex-1">{link.url}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setProfileLinks((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <select
                        value={newLinkType}
                        onChange={(e) => setNewLinkType(e.target.value as LinkType)}
                        className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
                      >
                        {LINK_TYPES.map((lt) => (
                          <option key={lt.value} value={lt.value}>
                            {lt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newLinkUrl.trim()) {
                            setProfileLinks((prev) => [
                              ...prev,
                              { type: newLinkType, url: newLinkUrl.trim() },
                            ]);
                            setNewLinkUrl("");
                          }
                        }}
                        className="px-2 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfile(false);
                        setProfileSkills(profile?.skills ?? []);
                        setProfileLinks(profile?.links ?? []);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={profileMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 disabled:opacity-50"
                    >
                      {profileMutation.isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Save className="size-3" />
                      )}
                      Save Profile
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name}
                        className="size-16 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="size-16 rounded-full bg-primary/10 border border-primary/20 grid place-items-center text-xl font-bold text-primary">
                        {profile?.display_name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) ?? "??"}
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold">{profile?.display_name}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {profile?.role_title && <span>{profile.role_title}</span>}
                        {profile?.role_title && profile?.team && <span>·</span>}
                        {profile?.team && <span>{profile.team}</span>}
                      </div>
                    </div>
                  </div>

                  {profile?.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>}

                  {profileSkills.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        Skills
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {profileSkills.map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 text-[10px] font-mono bg-surface-2 border border-border rounded"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {profileLinks.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        Links
                      </span>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {profileLinks.map((link, idx) => {
                          const cfg = LINK_TYPES.find((l) => l.value === link.type);
                          const Icon = cfg?.icon ?? LinkIcon;
                          return (
                            <a
                              key={idx}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground bg-surface-2 border border-border rounded transition-colors"
                            >
                              <Icon className="size-3" />
                              {cfg?.label ?? link.type}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Projects Section */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                My Projects
              </h2>
              <button
                onClick={() => {
                  setShowNewProject(true);
                  setEditingProject(null);
                  setProjectForm(EMPTY_PROJECT_FORM);
                  setProjectLinks([]);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase text-primary border border-primary/30 hover:bg-primary/5 transition-colors rounded"
              >
                <Plus className="size-3" />
                Add Project
              </button>
            </div>

            <div className="p-5">
              {projectsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 text-muted-foreground animate-spin" />
                </div>
              ) : !projects?.length && !showNewProject ? (
                <div className="text-center py-12">
                  <Briefcase className="size-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No projects yet. Add your first project to showcase your work.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects?.map((project) => (
                    <div key={project.id}>
                      {editingProject === project.id ? (
                        <ProjectFormCard
                          form={projectForm}
                          setForm={setProjectForm}
                          links={projectLinks}
                          setLinks={setProjectLinks}
                          newLinkType={newProjLinkType}
                          setNewLinkType={setNewProjLinkType}
                          newLinkUrl={newProjLinkUrl}
                          setNewLinkUrl={setNewProjLinkUrl}
                          onSave={() =>
                            projectMutation.mutate({
                              id: project.id,
                              data: projectForm,
                              links: projectLinks,
                            })
                          }
                          onCancel={() => {
                            setEditingProject(null);
                            setProjectForm(EMPTY_PROJECT_FORM);
                            setProjectLinks([]);
                          }}
                          isPending={projectMutation.isPending}
                        />
                      ) : (
                        <div className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-lg group">
                          <div className="flex items-center gap-3 min-w-0">
                            {project.image_url ? (
                              <img
                                src={project.image_url}
                                alt={project.name}
                                className="size-10 rounded object-cover border border-border shrink-0"
                              />
                            ) : (
                              <div className="size-10 rounded bg-primary/10 border border-primary/20 grid place-items-center text-sm font-bold text-primary shrink-0">
                                {project.name.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{project.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {project.short_description || "No description"}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {project.project_type && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-primary/10 text-primary border border-primary/20 rounded">
                                    {project.project_type}
                                  </span>
                                )}
                                {project.technologies?.slice(0, 3).map((tech) => (
                                  <span
                                    key={tech}
                                    className="px-1 py-0.5 text-[9px] font-mono text-muted-foreground bg-background border border-border rounded"
                                  >
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingProject(project.id);
                                setShowNewProject(false);
                                setProjectForm({
                                  name: project.name,
                                  short_description: project.short_description ?? "",
                                  project_type: project.project_type ?? "personal",
                                  role: project.role ?? "",
                                  technologies: project.technologies?.join(", ") ?? "",
                                  image_url: project.image_url ?? "",
                                  status: project.status ?? "completed",
                                });
                                setProjectLinks(
                                  project.links.map((l) => ({
                                    type: l.link_type,
                                    url: l.url,
                                  })),
                                );
                              }}
                              className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-background transition-colors"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Delete this project?")) {
                                  deleteProjectMutation.mutate(project.id);
                                }
                              }}
                              className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-background transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {showNewProject && (
                    <ProjectFormCard
                      form={projectForm}
                      setForm={setProjectForm}
                      links={projectLinks}
                      setLinks={setProjectLinks}
                      newLinkType={newProjLinkType}
                      setNewLinkType={setNewProjLinkType}
                      newLinkUrl={newProjLinkUrl}
                      setNewLinkUrl={setNewProjLinkUrl}
                      onSave={() =>
                        projectMutation.mutate({ data: projectForm, links: projectLinks })
                      }
                      onCancel={() => {
                        setShowNewProject(false);
                        setProjectForm(EMPTY_PROJECT_FORM);
                        setProjectLinks([]);
                      }}
                      isPending={projectMutation.isPending}
                    />
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

function ProjectFormCard({
  form,
  setForm,
  links,
  setLinks,
  newLinkType,
  setNewLinkType,
  newLinkUrl,
  setNewLinkUrl,
  onSave,
  onCancel,
  isPending,
}: {
  form: ProjectForm;
  setForm: React.Dispatch<React.SetStateAction<ProjectForm>>;
  links: { type: LinkType; url: string }[];
  setLinks: React.Dispatch<React.SetStateAction<{ type: LinkType; url: string }[]>>;
  newLinkType: LinkType;
  setNewLinkType: (v: LinkType) => void;
  newLinkUrl: string;
  setNewLinkUrl: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="p-4 bg-surface-2 border border-border rounded-lg space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project Name *">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. BirdDex"
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="Project Type">
          <select
            value={form.project_type}
            onChange={(e) => setForm((p) => ({ ...p, project_type: e.target.value }))}
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
          >
            {PROJECT_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Short Description">
        <input
          value={form.short_description}
          onChange={(e) => setForm((p) => ({ ...p, short_description: e.target.value }))}
          placeholder="A brief description of the project..."
          className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your Role">
          <input
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            placeholder="e.g. UI/UX Designer"
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
          >
            {PROJECT_STATUSES.map((ps) => (
              <option key={ps.value} value={ps.value}>
                {ps.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Technologies (comma-separated)">
        <input
          value={form.technologies}
          onChange={(e) => setForm((p) => ({ ...p, technologies: e.target.value }))}
          placeholder="React, Expo, AI"
          className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
        />
      </Field>

      <Field label="Project Image URL">
        <input
          value={form.image_url}
          onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
          placeholder="https://... (or leave empty for gradient placeholder)"
          className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-primary"
        />
      </Field>

      {/* Project Links */}
      <div>
        <label className="text-[10px] font-mono uppercase text-muted-foreground">
          Project Links
        </label>
        <div className="space-y-1.5 mt-2">
          {links.map((link, idx) => {
            const cfg = LINK_TYPES.find((l) => l.value === link.type);
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  {cfg?.label ?? link.type}
                </span>
                <span className="text-xs truncate flex-1">{link.url}</span>
                <button
                  type="button"
                  onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <select
            value={newLinkType}
            onChange={(e) => setNewLinkType(e.target.value as LinkType)}
            className="px-2 py-1.5 rounded-md bg-background border border-border text-xs focus:outline-none focus:border-primary"
          >
            {LINK_TYPES.map((lt) => (
              <option key={lt.value} value={lt.value}>
                {lt.label}
              </option>
            ))}
          </select>
          <input
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-3 py-1.5 rounded-md bg-background border border-border text-xs focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => {
              if (newLinkUrl.trim()) {
                setLinks((prev) => [...prev, { type: newLinkType, url: newLinkUrl.trim() }]);
                setNewLinkUrl("");
              }
            }}
            className="px-2 py-1.5 text-xs rounded border border-border hover:bg-background"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-background"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!form.name.trim() || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
          Save Project
        </button>
      </div>
    </div>
  );
}
