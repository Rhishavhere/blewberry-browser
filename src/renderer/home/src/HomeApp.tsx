import React, { useState } from "react";
import { Bot, Compass, ListTodo, PanelRight } from "lucide-react";
import { cn } from "@common/lib/utils";
import { useDarkMode } from "@common/hooks/useDarkMode";

type PanelId = "discover" | "agent" | "routines";

function queryToNavigateUrl(raw: string): string {
  const q = raw.trim();
  if (!q) return "https://www.google.com";
  if (/^https?:\/\//i.test(q)) return q;
  const dotted = /\.[a-z]{2,}([/:?#]|$)/i.test(q);
  if (dotted && !q.includes(" "))
    return q.startsWith("http") ? q : `https://${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

const NavChip: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted/80 text-muted-foreground hover:bg-muted"
    )}
  >
    {icon}
    {label}
  </button>
);

export const HomeApp: React.FC = () => {
  useDarkMode();
  const [panel, setPanel] = useState<PanelId>("discover");
  const [searchQuery, setSearchQuery] = useState("");

  const onSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = queryToNavigateUrl(searchQuery);
    await window.homeAPI.navigateFromSearch(url);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border px-8 py-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Blueberry</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Search and workflows live here. AI chat stays in the sidebar (Ctrl+E).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void window.homeAPI.toggleSidebar()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-border bg-muted/50 hover:bg-muted"
            >
              <PanelRight className="size-4" />
              Side rail
            </button>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          <NavChip
            active={panel === "discover"}
            onClick={() => setPanel("discover")}
            icon={<Compass className="size-3.5" />}
            label="Discover"
          />
          <NavChip
            active={panel === "agent"}
            onClick={() => setPanel("agent")}
            icon={<Bot className="size-3.5" />}
            label="Agent"
          />
          <NavChip
            active={panel === "routines"}
            onClick={() => setPanel("routines")}
            icon={<ListTodo className="size-3.5" />}
            label="Routines"
          />
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8 max-w-2xl mx-auto w-full">
        {panel === "discover" && (
          <div className="space-y-8 animate-fade-in">
            <form onSubmit={(e) => void onSearchSubmit(e)} className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Search the web
              </label>
              <div
                className={cn(
                  "flex gap-2 p-2 rounded-2xl border border-border shadow-sm bg-card",
                  "focus-within:ring-1 focus-within:ring-ring"
                )}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="keyword, URL, or question"
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl px-4 py-2 text-sm bg-primary text-primary-foreground hover:opacity-90"
                >
                  Go
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Opens in this tab. Non-URLs use Google results.
              </p>
            </form>
          </div>
        )}

        {panel === "agent" && (
          <PlaceholderCard
            title="Computer-use agent"
            body="Planner + DOM/JS acting loop lands here — see docs/product.md. Use the sidebar for AI chat meanwhile."
          />
        )}

        {panel === "routines" && (
          <PlaceholderCard
            title="Named routines"
            body={`Save workflows ("@morning-brief") and replay from chat. Stored under userData JSON — outlined in docs/product.md.`}
          />
        )}
      </main>
    </div>
  );
};

const PlaceholderCard: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
    <h2 className="text-lg font-medium">{title}</h2>
    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
  </div>
);
