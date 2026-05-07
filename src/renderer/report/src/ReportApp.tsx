import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

type Loaded = {
  title: string;
  markdown: string;
  createdAt: string;
};

export const ReportApp: React.FC = () => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id?.trim()) {
      setError("Missing report id.");
      return;
    }
    void window.reportAPI
      .loadReport(id.trim())
      .then((res) => {
        if (!res) {
          setError("Report not found or expired.");
          return;
        }
        setLoaded({
          title: res.title,
          markdown: res.markdown,
          createdAt: res.createdAt,
        });
        document.title = res.title || "Report";
      })
      .catch(() => setError("Could not load report."));
  }, []);

  if (error) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[rgb(var(--border))]/80 px-6 py-4 bg-[rgb(var(--muted))]/30">
        <h1 className="text-xl font-semibold tracking-tight">{loaded.title}</h1>
        <p className="text-xs text-[rgb(var(--muted-foreground))] mt-1">
          {new Date(loaded.createdAt).toLocaleString()}
        </p>
      </header>
      <article
        className="max-w-3xl mx-auto px-6 py-10 prose prose-sm dark:prose-invert max-w-none
        prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground
        prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground
        prose-a:text-violet-600 dark:prose-a:text-violet-400 hover:prose-a:underline
        prose-code:bg-[rgb(var(--muted))] prose-code:px-1 prose-code:py-0.5 prose-code:rounded
        prose-pre:bg-[rgb(var(--muted))] prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {loaded.markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
};
