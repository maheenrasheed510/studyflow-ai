import { useEffect } from "react";
import { toast } from "sonner";
import { daysUntil, type Assignment } from "./study-store";

const LAST_KEY = "studyflow.notifiedDate.v1";

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

/**
 * Fire browser notifications for assignments due within 3 days.
 * Runs at most once per calendar day per assignment to avoid spam.
 */
export function useDeadlineReminders(items: Assignment[]) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(LAST_KEY);
    const seen: Record<string, string> = raw ? JSON.parse(raw) : {};
    let changed = false;

    const urgent = items.filter(
      (a) => a.progress < 100 && daysUntil(a.dueDate) <= 3 && daysUntil(a.dueDate) >= -1,
    );

    for (const a of urgent) {
      if (seen[a.id] === today) continue;
      const d = daysUntil(a.dueDate);
      const when =
        d < 0 ? "is overdue" : d === 0 ? "is due today" : d === 1 ? "is due tomorrow" : `is due in ${d} days`;
      const title = `${a.subject}: ${a.title}`;
      const body = `${title} ${when}.`;

      toast.warning(title, { description: `${when.charAt(0).toUpperCase() + when.slice(1)}.` });

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("STUDYFLOW AI reminder", { body });
        } catch {
          // ignore
        }
      }
      seen[a.id] = today;
      changed = true;
    }

    if (changed) localStorage.setItem(LAST_KEY, JSON.stringify(seen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
}
