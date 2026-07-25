import { useEffect, useState } from "react";

export type Chapter = {
  id: string;
  title: string;
  prepared: boolean;
};

export type ExamPrep = {
  overview: string;
  studyGuide: Array<{
    chapter: string;
    summary: string;
    keyConcepts: string[];
    tips: string[];
  }>;
  notes: string;
  lectures: Array<{ title: string; searchQuery: string }>;
  quiz: Array<{
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  }>;
  generatedAt: string;
};

export type Exam = {
  id: string;
  subject: string;
  date: string; // yyyy-mm-dd
  chapters: Chapter[];
  pdfName?: string;
  pdfDataUrl?: string; // data:application/pdf;base64,...
  prep?: ExamPrep;
  createdAt: string;
};

const E_KEY = "studyflow.exams.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useExams() {
  const [items, setItems] = useState<Exam[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setItems(read<Exam[]>(E_KEY, []));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(E_KEY, JSON.stringify(items));
    } catch {
      // storage full (e.g. large PDFs); silently ignore
    }
  }, [items, ready]);
  return { items, setItems, ready };
}
