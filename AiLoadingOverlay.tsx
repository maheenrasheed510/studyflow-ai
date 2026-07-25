import { Loader2, Sparkles } from "lucide-react";

export function AiLoadingOverlay({ label = "AI is thinking…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card px-8 py-7 shadow-xl">
        <div className="relative">
          <Sparkles className="h-8 w-8 text-primary" />
          <Loader2 className="absolute -right-6 top-1 h-5 w-5 animate-spin text-accent" />
        </div>
        <p className="font-display text-xl text-foreground">{label}</p>
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          Analyzing deadlines, difficulty and effort to build your plan.
        </p>
      </div>
    </div>
  );
}
