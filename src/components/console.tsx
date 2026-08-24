import type { ReactNode } from "react";

export function PageHeader({
  crumbs,
  status,
  actions,
}: {
  crumbs: Array<{ label: string; muted?: boolean }>;
  status?: { label: string; tone?: "success" | "warn" | "info" };
  actions?: ReactNode;
}) {
  const toneClass =
    status?.tone === "warn"
      ? "bg-warning/10 text-warning border-warning/20"
      : status?.tone === "info"
        ? "bg-info/10 text-info border-info/20"
        : "bg-success/10 text-success border-success/20";
  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-surface/40">
      <div className="flex items-center gap-2 text-sm min-w-0">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            <span
              className={
                c.muted || i < crumbs.length - 1
                  ? "text-muted-foreground truncate"
                  : "font-medium truncate"
              }
            >
              {c.label}
            </span>
          </span>
        ))}
        {status && (
          <span
            className={`hidden sm:inline-block ml-3 px-2 py-0.5 text-[10px] font-mono uppercase border ${toneClass}`}
          >
            {status.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
  children?: ReactNode;
}) {
  const valueClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "success"
        ? "text-success"
        : "text-foreground";
  return (
    <div className="p-4 bg-card border border-border rounded-md">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          {label}
        </span>
        {hint && <span className="text-[10px] font-mono text-muted-foreground">{hint}</span>}
      </div>
      <div className={`text-2xl font-bold mt-1 tracking-tight ${valueClass}`}>{value}</div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
        {children}
      </h2>
      {hint && <span className="text-[10px] font-mono text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full"
        style={{ width: `${pct}%`, background: tone ?? "var(--color-primary)" }}
      />
    </div>
  );
}
