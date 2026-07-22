"use client";

import { useEffect, useMemo, useState } from "react";

type FatalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function safeMessage(error: Error) {
  return (error.message || "Unexpected application error")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export default function AppError({ error, reset }: FatalErrorProps) {
  const [notice, setNotice] = useState("");
  const [timestamp] = useState(() => new Date().toISOString());
  const entry = useMemo(() => ({
    id: error.digest || `fatal-${timestamp}`,
    timestamp,
    area: "app",
    code: "fatal_render_error",
    message: safeMessage(error),
    context: { digest: error.digest || "not-provided" },
  }), [error, timestamp]);

  useEffect(() => {
    try {
      const existing = JSON.parse(localStorage.getItem("valeta-error-log-v1") || "[]");
      const entries = Array.isArray(existing) ? existing : [];
      if (!entries.some((item) => item?.id === entry.id)) localStorage.setItem("valeta-error-log-v1", JSON.stringify([entry, ...entries].slice(0, 50)));
    } catch {}
  }, [entry]);

  function createReport() {
    let errors = [entry];
    try {
      const stored = JSON.parse(localStorage.getItem("valeta-error-log-v1") || "[]");
      if (Array.isArray(stored)) errors = stored;
    } catch {}
    return JSON.stringify({ product: "V's Job Seeker", build: "2026.07-learning-r2", generatedAt: new Date().toISOString(), privacy: "No résumé text, approved facts, raw documents, profile fields, credentials, or API keys are included.", errors }, null, 2);
  }

  function downloadReport() {
    const url = URL.createObjectURL(new Blob([createReport()], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `v-jobs-error-report-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <main className="fatal-error">
    <section>
      <span>V’S JOB SEEKER DIAGNOSTICS</span>
      <h1>Something interrupted the app.</h1>
      <p>Your local career data has not been deleted. Try the page again, or download the privacy-safe error report and send that JSON file for support.</p>
      <code>{entry.code}{error.digest ? ` · ${error.digest}` : ""}</code>
      <div><button className="primary" onClick={reset}>Try again</button><button onClick={downloadReport}>Download error report</button><button onClick={() => navigator.clipboard.writeText(createReport()).then(() => setNotice("Report copied"))}>Copy report</button></div>
      {notice && <strong>{notice}</strong>}
    </section>
  </main>;
}
