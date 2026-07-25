import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ChapterInput = z.object({
  title: z.string(),
  prepared: z.boolean(),
});

const Input = z.object({
  subject: z.string(),
  examDate: z.string(),
  today: z.string(),
  chapters: z.array(ChapterInput),
  pdfDataUrl: z.string().optional(), // data:application/pdf;base64,...
  pdfName: z.string().optional(),
});

const OutputSchema = z.object({
  overview: z.string(),
  studyGuide: z.array(
    z.object({
      chapter: z.string(),
      summary: z.string(),
      keyConcepts: z.array(z.string()),
      tips: z.array(z.string()),
    }),
  ),
  notes: z.string(),
  lectures: z.array(z.object({ title: z.string(), searchQuery: z.string() })),
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).min(2).max(6),
      answerIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

export const generateExamPrep = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const remaining = data.chapters.filter((c) => !c.prepared);
    const prepared = data.chapters.filter((c) => c.prepared);
    const daysLeft = Math.ceil(
      (new Date(data.examDate).getTime() - new Date(data.today).getTime()) / 86400000,
    );

    const systemPrompt = `You are an expert study coach. Produce focused, exam-ready prep for a student. Ground the study guide, notes, and quiz in the provided textbook PDF when supplied; otherwise use accurate general knowledge of the subject. Prioritize chapters the student has NOT yet prepared. Return ONLY valid JSON matching this schema:
{
  "overview": string (2-3 sentence strategy given days left and unprepared chapters),
  "studyGuide": [ { "chapter": string, "summary": string (3-5 sentences), "keyConcepts": string[] (5-8), "tips": string[] (2-4) } ],
  "notes": string (compact markdown study notes covering the UNPREPARED chapters, with headings and bullet points),
  "lectures": [ { "title": string, "searchQuery": string (YouTube search query) } ] (3-6 recommended lecture topics),
  "quiz": [ { "question": string, "options": string[] (4), "answerIndex": number (0-3), "explanation": string } ] (6-10 questions covering unprepared chapters primarily)
}
No prose outside the JSON.`;

    const userText = `Subject: ${data.subject}
Exam date: ${data.examDate} (${daysLeft} day${daysLeft === 1 ? "" : "s"} away)
Already prepared chapters: ${prepared.length ? prepared.map((c) => c.title).join(", ") : "(none)"}
Chapters still to prepare: ${remaining.length ? remaining.map((c) => c.title).join(", ") : "(none — do a broad review)"}
${data.pdfName ? `Textbook attached: ${data.pdfName}. Base your prep on it.` : "No textbook attached — use accurate general subject knowledge."}

Build a study guide + notes + lecture suggestions + quiz. Focus on the unprepared chapters.`;

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
    if (data.pdfDataUrl && data.pdfName) {
      userContent.push({
        type: "file",
        file: { filename: data.pdfName, file_data: data.pdfDataUrl },
      });
    }

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
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit — please wait a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in your workspace.");
      throw new Error(`Exam prep failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned no JSON. Try again.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("AI response wasn't valid JSON. Try again.");
    }

    const safe = OutputSchema.safeParse(parsed);
    if (safe.success) return safe.data;

    // Best-effort salvage
    const p = parsed as Record<string, unknown>;
    return {
      overview: typeof p.overview === "string" ? p.overview : "Study plan generated (partial).",
      studyGuide: Array.isArray(p.studyGuide)
        ? (p.studyGuide as Array<Record<string, unknown>>).map((g) => ({
            chapter: String(g.chapter ?? ""),
            summary: String(g.summary ?? ""),
            keyConcepts: Array.isArray(g.keyConcepts) ? g.keyConcepts.map(String) : [],
            tips: Array.isArray(g.tips) ? g.tips.map(String) : [],
          }))
        : [],
      notes: typeof p.notes === "string" ? p.notes : "",
      lectures: Array.isArray(p.lectures)
        ? (p.lectures as Array<Record<string, unknown>>).map((l) => ({
            title: String(l.title ?? ""),
            searchQuery: String(l.searchQuery ?? l.title ?? ""),
          }))
        : [],
      quiz: Array.isArray(p.quiz)
        ? (p.quiz as Array<Record<string, unknown>>)
            .map((q) => ({
              question: String(q.question ?? ""),
              options: Array.isArray(q.options) ? q.options.map(String) : [],
              answerIndex: Number(q.answerIndex ?? 0),
              explanation: String(q.explanation ?? ""),
            }))
            .filter((q) => q.question && q.options.length >= 2)
        : [],
    };
  });
