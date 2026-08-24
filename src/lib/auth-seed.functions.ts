import { createServerFn } from "@tanstack/react-start";

export type DemoAccount = {
  email: string;
  password: string;
  display_name: string;
  role: "pm" | "developer" | "qa";
  team: string;
  role_title: string;
  bio: string;
  skills: string[];
  links: { type: string; url: string }[];
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "pm@scrum.demo",
    password: "demo1234!",
    display_name: "Elaine Thorne",
    role: "pm",
    team: "Delivery",
    role_title: "Project Manager",
    bio: "Passionate about delivering great products on time. Experienced in agile methodologies and cross-functional team leadership.",
    skills: ["Agile", "Scrum", "Jira", "Figma", "Notion"],
    links: [
      { type: "linkedin", url: "https://linkedin.com/in/elaine-thorne" },
      { type: "website", url: "https://elaine-thorne.dev" },
    ],
  },
  {
    email: "dev@scrum.demo",
    password: "demo1234!",
    display_name: "John Alvarez",
    role: "developer",
    team: "Engineering",
    role_title: "Full-Stack Developer",
    bio: "Building performant web and mobile applications. Loves React, TypeScript, and clean architecture.",
    skills: ["React", "TypeScript", "Node.js", "React Native", "Tailwind CSS", "Supabase"],
    links: [
      { type: "github", url: "https://github.com/johnalvarez" },
      { type: "live_demo", url: "https://johnalvarez.dev" },
    ],
  },
  {
    email: "qa@scrum.demo",
    password: "demo1234!",
    display_name: "Sara Petrov",
    role: "qa",
    team: "Quality",
    role_title: "QA Engineer",
    bio: "Ensuring software quality through meticulous testing. Expertise in manual and automated testing strategies.",
    skills: ["Cypress", "Playwright", "Jest", "Manual Testing", "Bug Reporting"],
    links: [{ type: "linkedin", url: "https://linkedin.com/in/sara-petrov" }],
  },
];

export const ensureDemoAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (const acct of DEMO_ACCOUNTS) {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = existing?.users.find((u) => u.email?.toLowerCase() === acct.email.toLowerCase());

    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: acct.email,
        password: acct.password,
        email_confirm: true,
        user_metadata: { display_name: acct.display_name },
      });
      if (error) {
        console.error("createUser failed", acct.email, error);
        continue;
      }
      user = created.user!;
    }

    await supabaseAdmin.from("profiles").upsert(
      {
        id: user.id,
        display_name: acct.display_name,
        team: acct.team,
        role_title: acct.role_title,
        bio: acct.bio,
        skills: acct.skills,
        links: acct.links,
      },
      { onConflict: "id" },
    );

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: acct.role }, { onConflict: "user_id,role" });
  }

  return { ok: true, accounts: DEMO_ACCOUNTS.map(({ password: _pw, ...rest }) => rest) };
});
