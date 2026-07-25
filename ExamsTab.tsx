import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  GraduationCap,
  FileText,
  Youtube,
  BookMarked,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

import { useExams, type Exam, type Chapter, type ExamPrep } from "@/lib/exam-store";
import { generateExamPrep } from "@/lib/exam-prep.functions";
import { daysUntil, todayISO } from "@/lib/study-store";

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

export function ExamsTab() {
  const { items, setItems } = useExams();
  const runPrep = useServerFn(generateExamPrep);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.date.localeCompare(b.date)),
    [items],
  );

  const addExam = (e: Omit<Exam, "id" | "createdAt">) => {
    setItems((prev) => [
      ...prev,
      { ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
    ]);
    toast.success("Exam added");
  };

  const removeExam = (id: string) => {
    setItems((prev) => prev.filter((e) => e.id !== id));
  };

  const toggleChapter = (examId: string, chapterId: string) => {
    setItems((prev) =>
      prev.map((e) =>
        e.id === examId
          ? {
              ...e,
              chapters: e.chapters.map((c) =>
                c.id === chapterId ? { ...c, prepared: !c.prepared } : c,
              ),
            }
          : e,
      ),
    );
  };

  const generatePrep = async (exam: Exam) => {
    if (exam.chapters.length === 0) {
      toast.error("Add at least one chapter first");
      return;
    }
    setBusyId(exam.id);
    try {
      const prep = await runPrep({
        data: {
          subject: exam.subject,
          examDate: exam.date,
          today: todayISO(),
          chapters: exam.chapters.map((c) => ({ title: c.title, prepared: c.prepared })),
          pdfDataUrl: exam.pdfDataUrl,
          pdfName: exam.pdfName,
        },
      });
      const withStamp: ExamPrep = { ...prep, generatedAt: new Date().toISOString() };
      setItems((prev) => prev.map((e) => (e.id === exam.id ? { ...e, prep: withStamp } : e)));
      toast.success("Study prep ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate prep");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">Exams</h2>
          <p className="text-sm text-muted-foreground">
            Track exam dates, mark prepared chapters, get AI study prep.
          </p>
        </div>
        <AddExamDialog onAdd={addExam} />
      </div>

      {sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
            <p className="font-display text-xl">No exams yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add an exam with its date, chapters, and (optionally) your textbook PDF.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              busy={busyId === exam.id}
              onRemove={() => removeExam(exam.id)}
              onToggleChapter={(cid) => toggleChapter(exam.id, cid)}
              onGenerate={() => generatePrep(exam)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamCard({
  exam,
  busy,
  onRemove,
  onToggleChapter,
  onGenerate,
}: {
  exam: Exam;
  busy: boolean;
  onRemove: () => void;
  onToggleChapter: (chapterId: string) => void;
  onGenerate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const days = daysUntil(exam.date);
  const preparedCount = exam.chapters.filter((c) => c.prepared).length;
  const total = exam.chapters.length;
  const pct = total ? (preparedCount / total) * 100 : 0;

  const dayLabel =
    days < 0
      ? `${Math.abs(days)}d ago`
      : days === 0
        ? "Today"
        : days === 1
          ? "Tomorrow"
          : `${days} days left`;
  const dayTone =
    days < 0
      ? "text-muted-foreground"
      : days <= 3
        ? "text-destructive"
        : days <= 7
          ? "text-warning"
          : "text-foreground";

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-display text-lg">{exam.subject}</h3>
              {exam.pdfName && (
                <Badge variant="outline" className="gap-1">
                  <FileText className="h-3 w-3" />
                  PDF
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{exam.date}</span>
              <span className={"font-medium " + dayTone}>{dayLabel}</span>
              <span>
                {preparedCount}/{total} chapters ready
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove exam">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3">
          <Progress value={pct} />
        </div>

        {total > 0 && (
          <div className="mt-4 space-y-1.5">
            {exam.chapters.map((c) => (
              <button
                key={c.id}
                onClick={() => onToggleChapter(c.id)}
                className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60"
              >
                {c.prepared ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={c.prepared ? "line-through text-muted-foreground" : ""}>
                  {c.title}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={busy} size="sm" className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {exam.prep ? "Regenerate prep" : "Generate AI prep"}
          </Button>
          {exam.prep && (
            <Button
              onClick={() => setOpen((v) => !v)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {open ? "Hide prep" : "View prep"}
            </Button>
          )}
        </div>

        {exam.prep && open && <PrepView prep={exam.prep} />}
      </CardContent>
    </Card>
  );
}

function PrepView({ prep }: { prep: ExamPrep }) {
  return (
    <div className="mt-5 space-y-4 border-t border-border/60 pt-5">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-sm">{prep.overview}</p>
        </CardContent>
      </Card>

      {prep.studyGuide.length > 0 && (
        <div>
          <SectionTitle icon={<BookMarked className="h-4 w-4" />} title="Study guide" />
          <div className="mt-2 space-y-3">
            {prep.studyGuide.map((g, i) => (
              <Card key={i} className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-base">{g.chapter}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-foreground/90">{g.summary}</p>
                  {g.keyConcepts.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Key concepts
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.keyConcepts.map((k, j) => (
                          <Badge key={j} variant="secondary" className="font-normal">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {g.tips.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {g.tips.map((t, j) => (
                        <li key={j}>{t}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {prep.notes && (
        <div>
          <SectionTitle icon={<FileText className="h-4 w-4" />} title="Notes" />
          <Card className="mt-2 border-border/60">
            <CardContent className="p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                {prep.notes}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      {prep.lectures.length > 0 && (
        <div>
          <SectionTitle icon={<Youtube className="h-4 w-4" />} title="Recommended lectures" />
          <div className="mt-2 space-y-2">
            {prep.lectures.map((l, i) => (
              <a
                key={i}
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(l.searchQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-sm transition-colors hover:bg-secondary/60"
              >
                <span>{l.title}</span>
                <Youtube className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}

      {prep.quiz.length > 0 && (
        <Quiz quiz={prep.quiz} />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Generated {new Date(prep.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function Quiz({ quiz }: { quiz: ExamPrep["quiz"] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);
  const score = revealed
    ? quiz.reduce((s, q, i) => (answers[i] === q.answerIndex ? s + 1 : s), 0)
    : 0;

  return (
    <div>
      <SectionTitle icon={<GraduationCap className="h-4 w-4" />} title="Practice quiz" />
      <div className="mt-2 space-y-3">
        {quiz.map((q, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium">
                {i + 1}. {q.question}
              </p>
              <div className="space-y-1.5">
                {q.options.map((opt, j) => {
                  const picked = answers[i] === j;
                  const correct = revealed && j === q.answerIndex;
                  const wrong = revealed && picked && j !== q.answerIndex;
                  return (
                    <button
                      key={j}
                      onClick={() => !revealed && setAnswers((a) => ({ ...a, [i]: j }))}
                      disabled={revealed}
                      className={
                        "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                        (correct
                          ? "border-success bg-success/10"
                          : wrong
                            ? "border-destructive bg-destructive/10"
                            : picked
                              ? "border-primary bg-primary/5"
                              : "border-border/50 bg-secondary/20 hover:bg-secondary/50")
                      }
                    >
                      <span className="text-xs font-semibold text-muted-foreground">
                        {String.fromCharCode(65 + j)}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <p className="pt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Why: </span>
                  {q.explanation}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {revealed ? (
          <>
            <span className="text-sm">
              Score:{" "}
              <span className="font-display text-lg">
                {score}/{quiz.length}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAnswers({});
                setRevealed(false);
              }}
            >
              Retry
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setRevealed(true)} className="ml-auto">
            Check answers
          </Button>
        )}
      </div>
    </div>
  );
}

function AddExamDialog({ onAdd }: { onAdd: (e: Omit<Exam, "id" | "createdAt">) => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(todayISO());
  const [chaptersText, setChaptersText] = useState("");
  const [preparedText, setPreparedText] = useState("");
  const [pdfName, setPdfName] = useState<string | undefined>();
  const [pdfDataUrl, setPdfDataUrl] = useState<string | undefined>();
  const [reading, setReading] = useState(false);

  const reset = () => {
    setSubject("");
    setDate(todayISO());
    setChaptersText("");
    setPreparedText("");
    setPdfName(undefined);
    setPdfDataUrl(undefined);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF");
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      toast.error("PDF must be under 8 MB");
      return;
    }
    setReading(true);
    try {
      const url = await readFileAsDataUrl(f);
      setPdfDataUrl(url);
      setPdfName(f.name);
    } catch {
      toast.error("Couldn't read that file");
    } finally {
      setReading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = subject.trim();
    if (!s) return toast.error("Give the exam a subject");
    const preparedSet = new Set(
      preparedText
        .split(/[\n,]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    );
    const chapters: Chapter[] = chaptersText
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((title) => ({
        id: crypto.randomUUID(),
        title: title.slice(0, 160),
        prepared: preparedSet.has(title.toLowerCase()),
      }));
    onAdd({ subject: s.slice(0, 120), date, chapters, pdfName, pdfDataUrl });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Exam
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New exam</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Organic Chemistry"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-date">Date</Label>
              <Input
                id="exam-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapters">All chapters</Label>
            <textarea
              id="chapters"
              value={chaptersText}
              onChange={(e) => setChaptersText(e.target.value)}
              placeholder="One per line, e.g.&#10;Ch. 1 — Atomic structure&#10;Ch. 2 — Bonding"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prepared">Chapters already prepared</Label>
            <textarea
              id="prepared"
              value={preparedText}
              onChange={(e) => setPreparedText(e.target.value)}
              placeholder="Paste the exact titles you've already studied (one per line)"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              You can also toggle each chapter from the exam card later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdf">Textbook PDF (optional, ≤ 8 MB)</Label>
            <Input id="pdf" type="file" accept="application/pdf" onChange={onFile} />
            {reading && <p className="text-xs text-muted-foreground">Reading PDF…</p>}
            {pdfName && !reading && (
              <p className="text-xs text-muted-foreground">
                Attached: <span className="text-foreground">{pdfName}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full">
              Add exam
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
