import { useEffect, useState } from "react";

const KEY = "studyflow.theme.v1";

export function useDarkMode() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    const prefers =
      saved === "dark" ||
      (saved === null && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(prefers);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark, ready]);

  return { dark, setDark, toggle: () => setDark((v) => !v) };
}
