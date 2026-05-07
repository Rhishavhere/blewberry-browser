import React, { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";
import { Download, Mail } from "lucide-react";

type Loaded = {
  id: string;
  title: string;
  markdown: string;
  createdAt: string;
};

const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="my-8 overflow-x-auto rounded-xl border border-zinc-200/90 bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-[0.9375rem]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-zinc-200 bg-zinc-100/95 text-[0.8125rem] font-semibold uppercase tracking-wide text-zinc-600">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-3 font-semibold normal-case tracking-normal text-zinc-800">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-zinc-100 px-4 py-3 text-zinc-700">
      {children}
    </td>
  ),
  hr: () => <hr className="my-10 border-t border-zinc-200" />,
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-l-[3px] border-amber-500/70 pl-5 text-[0.95rem] italic text-zinc-600">
      {children}
    </blockquote>
  ),
};

export const ReportApp: React.FC = () => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const id =
    new URLSearchParams(window.location.search).get("id")?.trim() ?? "";

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
      <div className="min-h-screen bg-[#f0f1f3] flex items-center justify-center p-8">
        <p className="text-sm font-medium text-zinc-600">{error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#f0f1f3] flex items-center justify-center p-8">
        <p className="text-sm font-medium text-zinc-500">Loading…</p>
      </div>
    );
  }

  const dateLabel = new Date(loaded.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#f0f1f3] text-zinc-900 flex flex-col antialiased selection:bg-amber-200/50">
      <header className="sticky top-0 z-20 shrink-0 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex h-[3.75rem] max-w-6xl items-center justify-between gap-6 px-5 sm:px-8 lg:max-w-[1200px]">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/icon.png"
              alt=""
              width={26}
              height={26}
              className="size-[26px] shrink-0 rounded-md object-cover shadow-sm ring-1 ring-black/5"
            />
            <span className="truncate text-[0.9375rem] font-semibold tracking-tight text-zinc-900">
              Here's Your 5 Min-Read
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => void onDownload()}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[0.8125rem] font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50/80 active:bg-zinc-50"
            >
              <Download className="size-4 text-zinc-600" strokeWidth={2} />
              Download
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <article
          className="report-document prose prose-zinc w-full max-w-[min(720px,calc(100vw-2rem))]
            rounded-2xl border border-zinc-200/70 bg-white px-7 py-10 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12),0_4px_16px_-4px_rgba(15,23,42,0.06)]
            sm:px-12 sm:py-12 lg:max-w-[760px]
            prose-headings:text-zinc-900 prose-headings:font-semibold prose-headings:tracking-tight
            prose-h1:mb-5 prose-h1:mt-0 prose-h1:text-[1.75rem] prose-h1:font-bold prose-h1:leading-snug sm:prose-h1:text-[2rem]
            prose-h2:mb-3 prose-h2:mt-12 prose-h2:text-[1.15rem] prose-h2:first:mt-10
            prose-h3:mt-8 prose-h3:mb-2 prose-h3:text-base
            prose-p:text-[1.0625rem] prose-p:leading-[1.7] prose-p:text-zinc-700
            prose-ul:my-5 prose-ul:list-disc prose-ul:pl-6 prose-ul:text-zinc-700
            prose-ol:my-5 prose-ol:list-decimal prose-ol:pl-6 prose-ol:text-zinc-700
            prose-li:my-1 prose-li:marker:text-zinc-400
            prose-strong:font-semibold prose-strong:text-zinc-900
            prose-a:font-medium prose-a:text-blue-700 prose-a:no-underline prose-a:decoration-blue-700/35 hover:prose-a:underline hover:prose-a:underline-offset-4
            prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:font-normal prose-code:text-zinc-900
            prose-pre:my-6 prose-pre:rounded-xl prose-pre:border prose-pre:border-zinc-100 prose-pre:bg-zinc-50/90 prose-pre:shadow-inner
          "
        >
          <div className="not-prose mb-10 flex flex-wrap items-start justify-between gap-6 border-b border-zinc-100 pb-8">
            <time
              dateTime={loaded.createdAt}
              className="text-[0.8125rem] font-medium uppercase tracking-[0.12em] text-zinc-500"
            >
              {dateLabel}
            </time>
            <span className="flex items-center gap-2 font-semibold tracking-tight text-zinc-800">
              <img
                src="/icon.png"
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0 rounded-lg object-cover ring-1 ring-zinc-900/10"
              />
              Blueberry
            </span>
          </div>

          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={markdownComponents}
          >
            {loaded.markdown}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
};
