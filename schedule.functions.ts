import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AssignmentInput = z.object({
  id: z.string(),
  title: z.string(),
  subject: z.string().optional(),
  dueDate: z.string(),
  difficulty: z.number(),
  estimatedHours: z.number(),
  progress: z.number(),
});

const Input = z.object({
  assignments: z.array(AssignmentInput),
  hoursPerDay: z.number(),
  today: z.string(),
});

type ScheduleResult = {
  strategy: string;
  sessions: Array<{
    date: string;
    assignmentId: string;
    assignmentTitle: string;
    hours: number;
    reason: string;
  }>;
  warnings: string[];
};

export const generateSchedule = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<ScheduleResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const systemPrompt = `You are a study planner. Return ONLY valid JSON matching:
{
  "strategy": string (2-3 sentence overall plan),
  "sessions": [ { "date": "yyyy-mm-dd", "assignmentId": string, "assignmentTitle": string, "hours": number (0.5-3), "reason": string } ],
  "warnings": string[] (empty if student is on track; otherwise concise warnings about at-risk work)
}
No prose outside the JSON.`;

    const userPrompt = `Today is ${data.today}. Student can study ${data.hoursPerDay}h per day.

Assignments (remaining = estimatedHours * (1 - progress/100)):
${data.assignments
  .map(
    (a) =>
      `- [${a.id}] "${a.title}"${a.subject ? ` (${a.subject})` : ""} | due ${a.dueDate} | difficulty ${a.difficulty}/5 | est ${a.estimatedHours}h | progress ${a.progress}%`,
  )
  .join("\n")}

Build a day-by-day schedule from today through the last due date. Break work into focused 0.5-3h sessions. Prioritize by urgency, difficulty, and remaining effort. If a student is behind, front-load at-risk work and add a warning. Never exceed ${data.hoursPerDay}h in one day.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit — please wait a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in your workspace.");
      throw new Error(`Scheduling failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        strategy: "The AI response couldn't be parsed. Try regenerating.",
        sessions: [],
        warnings: ["AI returned unstructured output."],
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return {
        strategy: "The AI response wasn't valid JSON. Try regenerating.",
        sessions: [],
        warnings: ["Could not parse AI JSON."],
      };
    }

    return {
      strategy: typeof parsed.strategy === "string" ? parsed.strategy : "AI-generated schedule.",
      sessions: Array.isArray(parsed.sessions)
        ? (parsed.sessions as Array<Record<string, unknown>>)
            .map((s) => ({
              date: String(s.date ?? ""),
              assignmentId: String(s.assignmentId ?? ""),
              assignmentTitle: String(s.assignmentTitle ?? ""),
              hours: Number(s.hours ?? 0) || 0,
              reason: String(s.reason ?? ""),
            }))
            .filter((s) => s.date && s.assignmentTitle && s.hours > 0)
        : [],
      warnings: Array.isArray(parsed.warnings)
        ? (parsed.warnings as unknown[]).map(String).filter(Boolean)
        : [],
    };
  });
