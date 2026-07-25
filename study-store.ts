import { useEffect, useState } from "react";

export type Assignment = {
  id: string;
  title: string;
  subject: string;
  dueDate: string; // yyyy-mm-dd
  difficulty: number; // 1-5
  estimatedHours: number;
  progress: number; // 0-100
  createdAt: string;
};

export type ScheduleSession = {
  date: string;
  assignmentId: string;
  assignmentTitle: string;
  hours: number;
  reason: string;
};

export type Schedule = {
  strategy: string;
  sessions: ScheduleSession[];
  warnings: string[];
  generatedAt: string;
};

const A_KEY = "studyflow.assignments.v1";
const S_KEY = "studyflow.schedule.v1";
const H_KEY = "studyflow.hoursPerDay.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useAssignments() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Migrate old records missing `subject`
    const raw = read<Array<Partial<Assignment>>>(A_KEY, []);
    setItems(
      raw.map((a) => ({
        id: String(a.id ?? crypto.randomUUID()),
        title: String(a.title ?? ""),
        subject: String(a.subject ?? "General"),
        dueDate: String(a.dueDate ?? todayISO()),
        difficulty: Number(a.difficulty ?? 3),
        estimatedHours: Number(a.estimatedHours ?? 1),
        progress: Number(a.progress ?? 0),
        createdAt: String(a.createdAt ?? new Date().toISOString()),
      })),
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(A_KEY, JSON.stringify(items));
  }, [items, ready]);
  return { items, setItems, ready };
}

export function useSchedule() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSchedule(read<Schedule | null>(S_KEY, null));
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(S_KEY, JSON.stringify(schedule));
  }, [schedule, ready]);
  return { schedule, setSchedule, ready };
}

export function useHoursPerDay() {
  const [hours, setHours] = useState(3);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setHours(read<number>(H_KEY, 3));
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(H_KEY, JSON.stringify(hours));
  }, [hours, ready]);
  return { hours, setHours };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(dateISO: string) {
  const today = new Date(todayISO());
  const d = new Date(dateISO);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

/**
 * AI-style priority score (0-100). Blends urgency (days until due),
 * remaining effort, and difficulty. Overdue items pin to 100. Done items go to 0.
 */
export function priorityScore(a: Assignment): number {
  if (a.progress >= 100) return 0;
  const days = daysUntil(a.dueDate);
  if (days < 0) return 100;
  const remaining = a.estimatedHours * (1 - a.progress / 100);
  const urgency = Math.max(0, Math.min(1, (14 - days) / 14));
  const effort = Math.max(0, Math.min(1, remaining / 20));
  const diff = a.difficulty / 5;
  const raw = urgency * 0.6 + effort * 0.25 + diff * 0.15;
  return Math.round(raw * 100);
}

export function priorityLabel(score: number): { text: string; tone: "critical" | "high" | "medium" | "low" | "done" } {
  if (score === 0) return { text: "Done", tone: "done" };
  if (score >= 80) return { text: "Critical", tone: "critical" };
  if (score >= 60) return { text: "High", tone: "high" };
  if (score >= 35) return { text: "Medium", tone: "medium" };
  return { text: "Low", tone: "low" };
}
