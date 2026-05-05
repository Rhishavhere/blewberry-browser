import React, { useState } from "react";
import { Bot, PanelRight, Search } from "lucide-react";
import { cn } from "@common/lib/utils";
import { useDarkMode } from "@common/hooks/useDarkMode";

type QueryMode = "search" | "agent";

function queryToNavigateUrl(raw: string): string {
  const q = raw.trim();
  if (!q) return "https://www.google.com";
  if (/^https?:\/\//i.test(q)) return q;
  const dotted = /\.[a-z]{2,}([/:?#]|$)/i.test(q);
  if (dotted && !q.includes(" "))
    return q.startsWith("http") ? q : `https://${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

const ModePill: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : "bg-muted/70 text-muted-foreground hover:bg-muted"
    )}
  >
    {icon}
    {label}
  </button>
);

export const HomeApp: React.FC = () => {
  useDarkMode();
  const [queryMode, setQueryMode] = useState<QueryMode>("search");
  const [searchQuery, setSearchQuery] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (queryMode === "search") {
      const url = queryToNavigateUrl(q);
      await window.homeAPI.navigateFromSearch(url);
    } else {
      await window.homeAPI.openSidebarWithChat({
        message: q,
        messageId: Date.now().toString(),
      });
      setSearchQuery("");
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-background">
      <button
        type="button"
        onClick={() => void window.homeAPI.toggleSidebar()}
        className="absolute top-4 right-6 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-border bg-card/80 hover:bg-muted backdrop-blur-sm"
      >
        <PanelRight className="size-4" />
        Sidebar
      </button>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center space-y-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Blueberry</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Search the web with autonomous agents
            </p>
          </div>

          <form
            onSubmit={(e) => void onSubmit(e)}
            className="w-full space-y-4"
          >
            <div
              className={cn(
                "flex gap-2 p-2 rounded-2xl border border-border shadow-sm bg-card text-left",
                "focus-within:ring-1 focus-within:ring-ring"
              )}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  queryMode === "search"
                    ? "Enter URL or Google Search"
                    : "Ask the agent…"
                }
                className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl px-5 py-2 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
              >
                {queryMode === "search" ? "Go" : "Send"}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <ModePill
                active={queryMode === "search"}
                onClick={() => setQueryMode("search")}
                icon={<Search className="size-4" />}
                label="Search"
              />
              <ModePill
                active={queryMode === "agent"}
                onClick={() => setQueryMode("agent")}
                icon={<Bot className="size-4" />}
                label="Agent"
              />
            </div>

            {queryMode === "agent" && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Make Blueberry drive itself and get things done.
                </p>
              </div>
            )}

            {queryMode === "search" && (
              <p className="text-xs text-muted-foreground">
                Search the Internet. Paste an URL or Query
              </p>
            )}
          </form>

          <div className="pt-4 border-t border-border/60 w-full max-w-sm">
          </div>
        </div>
      </main>
    </div>
  );
};
