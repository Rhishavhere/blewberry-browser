import React, { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Download, Mail } from "lucide-react";
import { Button } from "@common/components/Button";

type Loaded = {
  id: string;
  title: string;
  markdown: string;
  createdAt: string;
};

export const ReportApp: React.FC = () => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const id = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";

  useEffect(() => {
    if (!id) {
      setError("Missing report id.");
      return;
    }
    void window.reportAPI
      .loadReport(id)
      .then((res) => {
        if (!res) {
          setError("Report not found or expired.");
          return;
        }
        setLoaded({
          id,
          title: res.title,
          markdown: res.markdown,
          createdAt: res.createdAt,
        });
        document.title = res.title || "Research report";
      })
      .catch(() => setError("Could not load report."));
  }, [id]);

  const onDownload = useCallback(async () => {
    if (!id) return;
    const r = await window.reportAPI.saveReportAs(id);
    if (!r.ok && r.error !== "cancelled") {
      console.error("Save failed", r.error);
    }
  }, [id]);

  const onGmail = useCallback(async () => {
    if (!loaded) return;
    const intro =
      "Full report is in this tab (Blueberry). For long content, use Download to save the .md file and attach it in Gmail.";
    await window.reportAPI.openGmailDraft(
      loaded.title || "Research report",
      intro,
    );
  }, [loaded]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-6">
        <p className="text-sm text-zinc-600">{error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-6">
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  const dateLabel = new Date(loaded.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 flex flex-col">
      <header className="shrink-0 border-b border-zinc-200 bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block size-2 rounded-sm bg-amber-500 shrink-0"
              aria-hidden
            />
            <span className="font-semibold text-sm sm:text-base truncate">
              Research report
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void onDownload()}
            >
              <Download className="size-4" />
              Download
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void onGmail()}
            >
              <Mail className="size-4" />
              Send with Gmail
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-8 sm:py-10">
        <article
          className="max-w-3xl mx-auto bg-white rounded-xl shadow-md border border-zinc-100/80 px-6 sm:px-12 py-10 sm:py-12
            prose prose-zinc prose-sm max-w-none
            prose-headings:font-semibold prose-headings:text-zinc-900 prose-headings:tracking-tight
            prose-p:text-zinc-700 prose-strong:text-zinc-900
            prose-ul:text-zinc-700 prose-ol:text-zinc-700 prose-li:text-zinc-700
            prose-a:text-violet-700 prose-a:no-underline hover:prose-a:underline
            prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-zinc-900
            prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-100 prose-pre:rounded-lg prose-pre:overflow-x-auto
            prose-table:text-sm prose-th:bg-zinc-100 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-tr:border-zinc-200"
        >
          <div className="flex justify-between items-start gap-4 mb-8 not-prose text-sm text-zinc-500">
            <time dateTime={loaded.createdAt}>{dateLabel}</time>
            <span className="flex items-center gap-1.5 font-medium text-zinc-700">
              <span className="inline-block size-1.5 rounded-sm bg-amber-500" />
              Blueberry
            </span>
          </div>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
            {loaded.markdown}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
};
