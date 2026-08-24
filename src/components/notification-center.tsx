import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, Inbox, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type AppNotification = {
  id: string;
  task_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
};

// Generated Supabase types don't include the notifications table (see
// supabase/migrations/00003_notifications.sql) — same workaround as other files.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function NotificationCenter() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left?: number; right?: number } | null>(
    null,
  );
  const channelSeq = useRef(0);

  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db()
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!cancelled && data) setItems(data as AppNotification[]);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications:${userId}:${++channelSeq.current}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            setItems((prev) => [payload.new as AppNotification, ...prev].slice(0, 50));
          },
        )
        .subscribe();
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markAllRead() {
    if (!user) return;
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await db().from("notifications").update({ read: true }).in("id", ids).eq("user_id", user.id);
    } catch {
      /* ignore */
    }
  }

  function toggleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next) {
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect) {
          const gap = 8;
          const width = 320;
          const top = rect.bottom + gap;
          const rightGap = 24;
          if (rect.right + rightGap + width <= window.innerWidth) {
            setPanelPos({ top, left: rect.right + rightGap });
          } else {
            setPanelPos({ top, right: window.innerWidth - rect.right + gap });
          }
        }
      }
      return next;
    });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={toggleOpen}
        className="relative p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, right: panelPos.right }}
            className="fixed w-80 max-w-[85vw] bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Bell className="size-3.5 text-primary" />
                Notifications
              </span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {!loaded ? (
                <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <Inbox className="size-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No notifications yet.</p>
                </div>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-2.5 border-b border-border last:border-0 text-xs ${n.read ? "opacity-60" : "bg-primary/5"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-foreground leading-snug">{n.message}</p>
                      <span className="text-[9px] font-mono text-muted-foreground shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.task_id && (
                      <span className="text-[9px] font-mono text-muted-foreground mt-0.5 inline-block">
                        {n.task_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            {items.length > 0 && (
              <button
                onClick={markAllRead}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] font-mono uppercase text-primary hover:bg-surface-2 transition-colors border-t border-border"
              >
                <CheckCheck className="size-3" />
                Mark all as read
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
