import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  BookOpen,
  Plus,
  Sparkles,
  Trash2,
  AlertTriangle,
  Calendar as CalendarIcon,
  TrendingUp,
  Loader2,
  CheckCircle2,
  Search,
  Bell,
  BellOff,
  Sun,
  Moon,
  Flame,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  useAssignments,
  useSchedule,
  useHoursPerDay,
  todayISO,
  daysUntil,
  priorityScore,
  priorityLabel,
  type Assignment,
} from "@/lib/study-store";
import { generateSchedule } from "@/lib/schedule.functions";
import { ExamsTab } from "@/components/ExamsTab";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AiLoadingOverlay } from "@/components/AiLoadingOverlay";
import { useDarkMode } from "@/lib/theme";
import {
  notificationPermission,
  requestNotificationPermission,
  useDeadlineReminders,
} from "@/lib/notifications";

export const Route = createFileRoute("/")({
  component: StudyFlowAI,
});

function urgencyLabel(days: number) {
  if (days < 0) return { text: "Overdue", tone: "danger" as const };
  if (days === 0) return { text: "Due today", tone: "danger" as const };
  if (days <= 2) return { text: `${days}d left`, tone: "danger" as const };
  if (days <= 5) return { text: `${days}d left`, tone: "warning" as const };
  return { text: `${days}d left`, tone: "muted" as const };
}

type DueFilter = "all" | "overdue" | "today" | "week" | "later";
type StatusFilter = "all" | "active" | "done";
type SortMode = "priority" | "due" | "difficulty";

function StudyFlowAI() {
  const { items, setItems } = useAssignments();
  const { schedule, setSchedule } = useSchedule();
  const { hours, setHours } = useHoursPerDay();
  const runGenerate = useServerFn(generateSchedule);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState("assignments");
  const { dark, toggle: toggleDark } = useDarkMode();

  // Reminders
  useDeadlineReminders(items);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" ? notificationPermission() : "default",
  );
  const enableNotifs = async () => {
    const p = await requestNotificationPermission();
    setNotifPerm(p);
    if (p === "granted") toast.success("Reminders enabled");
    else if (p === "denied") toast.error("Reminders blocked — enable in browser settings");
  };

  // Filters
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const a of items) if (a.subject) set.add(a.subject);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = items.filter((a) => {
      if (q && !`${a.title} ${a.subject}`.toLowerCase().includes(q)) return false;
      if (subjectFilter !== "all" && a.subject !== subjectFilter) return false;
      if (difficultyFilter !== "all" && String(a.difficulty) !== difficultyFilter) return false;
      const done = a.progress >= 100;
      if (statusFilter === "done" && !done) return false;
      if (statusFilter === "active" && done) return false;
      const d = daysUntil(a.dueDate);
      if (dueFilter === "overdue" && !(d < 0 && !done)) return false;
      if (dueFilter === "today" && d !== 0) return false;
      if (dueFilter === "week" && (d < 0 || d > 7)) return false;
      if (dueFilter === "later" && d <= 7) return false;
      return true;
    });
    if (sortMode === "priority") arr.sort((a, b) => priorityScore(b) - priorityScore(a));
    else if (sortMode === "due") arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    else arr.sort((a, b) => b.difficulty - a.difficulty);
    return arr;
  }, [items, query, subjectFilter, dueFilter, difficultyFilter, statusFilter, sortMode]);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((a) => a.progress >= 100).length;
    const totalHours = items.reduce((s, a) => s + a.estimatedHours, 0);
    const remainingHours = items.reduce(
      (s, a) => s + a.estimatedHours * (1 - a.progress / 100),
      0,
    );
    const avgProgress = total ? items.reduce((s, a) => s + a.progress, 0) / total : 0;
    const overdue = items.filter((a) => daysUntil(a.dueDate) < 0 && a.progress < 100).length;
    return { total, done, totalHours, remainingHours, avgProgress, overdue };
  }, [items]);

  const addAssignment = (a: Omit<Assignment, "id" | "createdAt" | "progress">) => {
    const next: Assignment = {
      ...a,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      progress: 0,
    };
    setItems((prev) => [...prev, next]);
    toast.success("Assignment added");
  };

  const removeAssignment = (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
    toast.success("Assignment deleted");
  };

  const updateProgress = (id: string, progress: number) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, progress } : a)));
  };

  const handleGenerate = async () => {
    if (items.length === 0) {
      toast.error("Add at least one assignment first");
      return;
    }
    setGenerating(true);
    try {
      const result = await runGenerate({
        data: {
          assignments: items.map((a) => ({
            id: a.id,
            title: a.title,
            subject: a.subject,
            dueDate: a.dueDate,
            difficulty: a.difficulty,
            estimatedHours: a.estimatedHours,
            progress: a.progress,
          })),
          hoursPerDay: hours,
          today: todayISO(),
        },
      });
      setSchedule({ ...result, generatedAt: new Date().toISOString() });
      setTab("schedule");
      toast.success("Schedule ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors />
      {generating && <AiLoadingOverlay label="Planning your week…" />}

      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold leading-none tracking-tight">
                STUDYFLOW AI
              </h1>
              <p className="text-xs text-muted-foreground">AI-powered study planner</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={enableNotifs}
              title={
                notifPerm === "granted"
                  ? "Reminders enabled"
                  : notifPerm === "unsupported"
                    ? "Notifications not supported"
                    : "Enable reminders"
              }
              aria-label="Toggle reminders"
            >
              {notifPerm === "granted" ? (
                <Bell className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Toggle dark mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={handleGenerate} disabled={generating} size="sm" className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="hidden sm:inline">{schedule ? "Reprioritize" : "Plan with AI"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Assignments" value={String(stats.total)} icon={<BookOpen className="h-4 w-4" />} />
          <StatCard label="Completed" value={`${stats.done}/${stats.total || 0}`} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard label="Hours left" value={stats.remainingHours.toFixed(1)} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard
            label="Overdue"
            value={String(stats.overdue)}
            tone={stats.overdue > 0 ? "danger" : "default"}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </section>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="exams">Exams</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl font-semibold">Your assignments</h2>
                <p className="text-sm text-muted-foreground">
                  Add what's on your plate. AI ranks and schedules it.
                </p>
              </div>
              <AddAssignmentDialog onAdd={addAssignment} knownSubjects={subjects} />
            </div>

            <FilterBar
              query={query}
              setQuery={setQuery}
              subjects={subjects}
              subjectFilter={subjectFilter}
              setSubjectFilter={setSubjectFilter}
              dueFilter={dueFilter}
              setDueFilter={setDueFilter}
              difficultyFilter={difficultyFilter}
              setDifficultyFilter={setDifficultyFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              sortMode={sortMode}
              setSortMode={setSortMode}
            />

            {items.length === 0 ? (
              <EmptyState />
            ) : filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No assignments match your filters.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onRemove={() => removeAssignment(a.id)}
                    onProgress={(p) => updateProgress(a.id, p)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="mt-6 space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Study capacity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Hours per day</Label>
                  <span className="font-display text-2xl font-semibold">{hours}h</span>
                </div>
                <Slider
                  value={[hours]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={(v) => setHours(v[0])}
                  className="mt-3"
                />
              </CardContent>
            </Card>

            {!schedule ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Sparkles className="h-8 w-8 text-accent" />
                  <p className="font-display text-xl font-semibold">No plan yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Tap "Plan with AI" to generate a schedule tuned to your due dates and workload.
                  </p>
                  <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Plan with AI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <ScheduleView schedule={schedule} />
            )}
          </TabsContent>

          <TabsContent value="exams" className="mt-6">
            <ExamsTab />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-6 space-y-4">
            <Dashboard items={filtered.length ? filtered : items} onProgress={updateProgress} stats={stats} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function FilterBar({
  query,
  setQuery,
  subjects,
  subjectFilter,
  setSubjectFilter,
  dueFilter,
  setDueFilter,
  difficultyFilter,
  setDifficultyFilter,
  statusFilter,
  setStatusFilter,
  sortMode,
  setSortMode,
}: {
  query: string;
  setQuery: (v: string) => void;
  subjects: string[];
  subjectFilter: string;
  setSubjectFilter: (v: string) => void;
  dueFilter: DueFilter;
  setDueFilter: (v: DueFilter) => void;
  difficultyFilter: string;
  setDifficultyFilter: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or subject…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any due date</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Due today</SelectItem>
              <SelectItem value="week">Next 7 days</SelectItem>
              <SelectItem value="later">Later</SelectItem>
            </SelectContent>
          </Select>
          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any difficulty</SelectItem>
              <SelectItem value="1">1 — Easy</SelectItem>
              <SelectItem value="2">2 — Light</SelectItem>
              <SelectItem value="3">3 — Moderate</SelectItem>
              <SelectItem value="4">4 — Hard</SelectItem>
              <SelectItem value="5">5 — Brutal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">In progress</SelectItem>
              <SelectItem value="done">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Sort: AI priority</SelectItem>
              <SelectItem value="due">Sort: Due date</SelectItem>
              <SelectItem value="difficulty">Sort: Difficulty</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs uppercase tracking-wide">{label}</span>
          <span>{icon}</span>
        </div>
        <div
          className={
            "mt-2 font-display text-3xl font-semibold " +
            (tone === "danger" ? "text-destructive" : "text-foreground")
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground" />
        <p className="font-display text-xl font-semibold">Nothing added yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add your first assignment to start building an AI study plan.
        </p>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ score }: { score: number }) {
  const { text, tone } = priorityLabel(score);
  const cls =
    tone === "critical"
      ? "bg-destructive text-destructive-foreground"
      : tone === "high"
        ? "bg-warning text-warning-foreground"
        : tone === "medium"
          ? "bg-accent/20 text-foreground border border-accent/40"
          : tone === "done"
            ? "bg-success text-success-foreground"
            : "bg-secondary text-secondary-foreground";
  return (
    <Badge className={`gap-1 ${cls}`}>
      <Flame className="h-3 w-3" />
      {text} · {score}
    </Badge>
  );
}

function AssignmentCard({
  assignment,
  onRemove,
  onProgress,
}: {
  assignment: Assignment;
  onRemove: () => void;
  onProgress: (p: number) => void;
}) {
  const d = daysUntil(assignment.dueDate);
  const u = urgencyLabel(d);
  const done = assignment.progress >= 100;
  const score = priorityScore(assignment);

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-display text-lg font-semibold">{assignment.title}</h3>
              {done ? (
                <Badge className="bg-success text-success-foreground hover:bg-success">Done</Badge>
              ) : (
                <PriorityBadge score={score} />
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                {assignment.subject}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {assignment.dueDate}
              </span>
              <span
                className={
                  u.tone === "danger"
                    ? "text-destructive font-medium"
                    : u.tone === "warning"
                      ? "text-warning font-medium"
                      : ""
                }
              >
                {u.text}
              </span>
              <span>Difficulty {"★".repeat(assignment.difficulty)}{"☆".repeat(5 - assignment.difficulty)}</span>
              <span>{assignment.estimatedHours}h est.</span>
            </div>
          </div>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Delete assignment?"
            description={`"${assignment.title}" will be removed. This can't be undone.`}
            onConfirm={onRemove}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-medium text-foreground">{assignment.progress}%</span>
          </div>
          <Slider
            value={[assignment.progress]}
            min={0}
            max={100}
            step={5}
            onValueChange={(v) => onProgress(v[0])}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AddAssignmentDialog({
  onAdd,
  knownSubjects,
}: {
  onAdd: (a: Omit<Assignment, "id" | "createdAt" | "progress">) => void;
  knownSubjects: string[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [difficulty, setDifficulty] = useState("3");
  const [estimatedHours, setEstimatedHours] = useState("4");

  const reset = () => {
    setTitle("");
    setSubject("");
    setDueDate(todayISO());
    setDifficulty("3");
    setEstimatedHours("4");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return toast.error("Give the assignment a title");
    const s = subject.trim() || "General";
    const h = Number(estimatedHours);
    if (!h || h <= 0) return toast.error("Estimated hours must be greater than 0");
    onAdd({
      title: t.slice(0, 120),
      subject: s.slice(0, 40),
      dueDate,
      difficulty: Number(difficulty),
      estimatedHours: h,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">New assignment</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chem lab report"
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Chemistry"
              list="known-subjects"
              maxLength={40}
            />
            <datalist id="known-subjects">
              {knownSubjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">Est. hours</Label>
              <Input
                id="hours"
                type="number"
                min={0.5}
                step={0.5}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — Easy</SelectItem>
                <SelectItem value="2">2 — Light</SelectItem>
                <SelectItem value="3">3 — Moderate</SelectItem>
                <SelectItem value="4">4 — Hard</SelectItem>
                <SelectItem value="5">5 — Brutal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full">Add assignment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleView({ schedule }: { schedule: { strategy: string; sessions: Array<{ date: string; assignmentId: string; assignmentTitle: string; hours: number; reason: string }>; warnings: string[]; generatedAt: string } }) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof schedule.sessions>();
    for (const s of schedule.sessions) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [schedule]);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
            <div className="text-sm text-foreground/90">{schedule.strategy}</div>
          </div>
        </CardContent>
      </Card>

      {schedule.warnings.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-2 p-4 sm:p-5">
            {schedule.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                <span>{w}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {grouped.map(([date, sessions]) => {
          const total = sessions.reduce((s, x) => s + x.hours, 0);
          const d = daysUntil(date);
          const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
          return (
            <Card key={date} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="font-display text-lg font-semibold">{label}</CardTitle>
                <span className="text-xs text-muted-foreground">{total.toFixed(1)}h planned</span>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-secondary/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.assignmentTitle}</span>
                      <Badge variant="outline" className="shrink-0">{s.hours}h</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Generated {new Date(schedule.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function Dashboard({
  items,
  onProgress,
  stats,
}: {
  items: Assignment[];
  onProgress: (id: string, p: number) => void;
  stats: { total: number; done: number; totalHours: number; remainingHours: number; avgProgress: number; overdue: number };
}) {
  if (items.length === 0) return <EmptyState />;
  const completedPct = stats.totalHours > 0 ? ((stats.totalHours - stats.remainingHours) / stats.totalHours) * 100 : 0;
  const sorted = [...items].sort((a, b) => priorityScore(b) - priorityScore(a));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold">Overall progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={completedPct} />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{(stats.totalHours - stats.remainingHours).toFixed(1)}h done</span>
            <span>{stats.remainingHours.toFixed(1)}h left</span>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {sorted.map((a) => {
          const d = daysUntil(a.dueDate);
          const u = urgencyLabel(d);
          const score = priorityScore(a);
          const done = a.progress >= 100;
          return (
            <Card key={a.id} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{a.title}</span>
                    {!done && <PriorityBadge score={score} />}
                  </div>
                  <span
                    className={
                      "text-xs " +
                      (u.tone === "danger"
                        ? "text-destructive font-medium"
                        : u.tone === "warning"
                          ? "text-warning font-medium"
                          : "text-muted-foreground")
                    }
                  >
                    {u.text}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Progress value={a.progress} className="flex-1" />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{a.progress}%</span>
                </div>
                <div className="mt-3">
                  <Slider
                    value={[a.progress]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(v) => onProgress(a.id, v[0])}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
