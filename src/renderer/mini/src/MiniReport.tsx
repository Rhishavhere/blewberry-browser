import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

type Loaded = {
  id: string;
  title: string;
  markdown: string;
  createdAt: string;
};

function makeMarkdownComponents(): Components {
  return {
    h1: ({ children }) => (
      <h1 className="text-[2rem] font-serif leading-tight tracking-tight mt-0 mb-6 text-gray-900 dark:text-gray-100">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="flex items-center gap-3 text-[1.2rem] font-semibold tracking-tight mt-10 mb-4 text-gray-900 dark:text-gray-100 border-l-[3px] border-blue-500 pl-4">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-[1rem] font-semibold mt-6 mb-3 text-gray-500 dark:text-gray-400 uppercase tracking-widest text-xs">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="my-4 leading-[1.7] text-[0.95rem] text-gray-700 dark:text-gray-300">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="my-4 space-y-2 pl-0 list-none">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-4 space-y-2 pl-6 list-decimal text-gray-700 dark:text-gray-300">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="flex gap-3 items-start text-gray-700 dark:text-gray-300 leading-[1.6]">
        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
        <span>{children}</span>
      </li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic text-gray-500 dark:text-gray-400">{children}</em>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 pl-4 py-2 border-l-[4px] border-blue-500 bg-blue-500/5 text-gray-600 dark:text-gray-400 italic text-[0.9rem] rounded-r-md">
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isBlock = className?.startsWith("language-");
      if (isBlock) {
        return (
          <code className="block rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 text-[0.85rem] font-mono overflow-x-auto text-gray-600 dark:text-gray-300">
            {children}
          </code>
        );
      }
      return (
        <code className="rounded px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-[0.85em] font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-6 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full border-collapse text-[0.85rem]">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-50 dark:bg-gray-800 text-[0.7rem] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th className="px-4 py-3 text-left">{children}</th>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">{children}</tbody>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{children}</td>
    ),
  };
}

export const MiniReport: React.FC<{ reportId: string }> = ({ reportId }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const components = useRef(makeMarkdownComponents()).current;

  useEffect(() => {
    if (!reportId) {
      setError("No report ID provided.");
      return;
    }
    // mini.ts injects reportAPI into window.reportAPI
    const api = (window as any).reportAPI;
    if (!api || !api.loadReport) {
      setError("Report API not found.");
      return;
    }

    void api.loadReport(reportId).then((res: any) => {
      if (!res) {
        setError("Report not found or expired.");
        return;
      }
      setLoaded(res);
    }).catch(() => {
      setError("Failed to load report.");
    });
  }, [reportId]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-black/90">
        <p className="text-red-500 font-medium">{error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-black/90">
        <div className="size-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading report...</p>
      </div>
    );
  }

  const dateLabel = new Date(loaded.createdAt).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="w-full min-h-full bg-white dark:bg-[#111111] p-8 sm:p-12 font-sans selection:bg-blue-200 dark:selection:bg-blue-900/40">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <span className="text-[0.75rem] font-medium text-gray-400 dark:text-gray-500">{dateLabel}</span>
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={components}
        >
          {loaded.markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};
