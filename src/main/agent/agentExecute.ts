import type { Tab } from "../Tab";
import type { AgentEvent, AgentStep } from "./agentSchema";

export type VisionDims = {
  shotW: number;
  shotH: number;
  viewW: number;
  viewH: number;
};

/** Plain text from last read_page on this URL (for save_report reuse). */
export type LastReadCapture = {
  url: string;
  title: string;
  body: string;
};

export type AgentStepExecutionContext = {
  lastReadCapture: LastReadCapture | null;
};

export type ExecuteStepResult = {
  injectOncePageSnapshot?: string;
  /** After read_page — replace runner's lastReadCapture. */
  lastReadCapture?: LastReadCapture | null;
  /** After save_report — append to runner's report segments. */
  savedReportSegment?: { url: string; title: string; body: string };
};

const MAX_SEGMENT_CHARS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function capBody(s: string): string {
  if (s.length <= MAX_SEGMENT_CHARS) return s;
  return (
    s.slice(0, MAX_SEGMENT_CHARS) +
    `\n\n_[Truncated at ${MAX_SEGMENT_CHARS} characters]_\n`
  );
}

/** Injected into the tab so React controlled inputs update (plain el.value breaks React state). */
export function buildTypeIntoActiveElementScript(appendText: string): string {
  const lit = JSON.stringify(appendText);
  return `(function(){
  var t = ${lit};
  var el = document.activeElement;
  if (!el) return "no_focus";
  if (el.isContentEditable) {
    document.execCommand("insertText", false, t);
    return "contenteditable";
  }
  var tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    var proto = tag === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set && desc.get) {
      desc.set.call(el, desc.get.call(el) + t);
    } else {
      el.value = (el.value || "") + t;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return "input";
  }
  if ("value" in el && typeof el.value === "string") {
    el.value += t;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return "input_fallback";
  }
  return "unsupported";
})()`;
}

export async function executeAgentStep(
  tab: Tab,
  action: AgentStep,
  dims: VisionDims | null,
  createTabAndActivate: (url?: string) => Tab,
  emit: (event: AgentEvent) => void,
  ctx: AgentStepExecutionContext,
): Promise<ExecuteStepResult | void> {
  switch (action.action) {
    case "see":
      return;
    case "read_page": {
      const maxChars = clamp(action.maxChars ?? 16_000, 1_000, 200_000);
      const text = await tab.getTabText();
      const inner = text.slice(0, maxChars);
      let blob = `innerText (chars shown: ${inner.length}${text.length > maxChars ? ` of ${text.length} total` : ""}):\n${inner}`;
      if (action.includeHtml) {
        const htmlCap = clamp(Math.floor(maxChars / 2), 500, 100_000);
        const html = await tab.getTabHtml();
        const htmlSlice = html.slice(0, htmlCap);
        blob += `\n\nouterHTML (truncated to ${htmlSlice.length}${html.length > htmlCap ? ` of ${html.length}` : ""} chars):\n${htmlSlice}`;
        if (html.length > htmlCap) {
          blob += `\n...[HTML truncated]`;
        }
      }
      emit({
        type: "log",
        message: `[agent] read_page: innerText length ${text.length}`,
      });
      return {
        injectOncePageSnapshot: blob,
        lastReadCapture: {
          url: tab.url,
          title: tab.title,
          body: inner,
        },
      };
    }
    case "save_report": {
      const url = tab.url;
      const title = tab.title;
      let body: string;
      let reused = false;
      if (
        ctx.lastReadCapture &&
        ctx.lastReadCapture.url === url &&
        ctx.lastReadCapture.body.length > 0
      ) {
        body = ctx.lastReadCapture.body;
        reused = true;
      } else {
        body = await tab.getTabText();
      }
      if (action.includeHtml) {
        const htmlCap = 50_000;
        const html = await tab.getTabHtml();
        body += `\n\n---\nouterHTML (truncated):\n${html.slice(0, htmlCap)}${
          html.length > htmlCap ? "\n...[truncated]" : ""
        }`;
      }
      body = capBody(body);
      emit({
        type: "log",
        message: `[agent] save_report: ${reused ? "reused last read_page text" : "captured fresh tab text"} → ${body.length} chars for reporting agent`,
      });
      return {
        savedReportSegment: { url, title, body },
      };
    }
    case "new_tab": {
      const u = action.url?.trim();
      createTabAndActivate(u && u.length > 0 ? u : undefined);
      emit({
        type: "log",
        message: `[agent] new tab${u ? ` → ${u}` : " (home)"}`,
      });
      return;
    }
    case "navigate":
      await tab.loadURL(action.url);
      return;
    case "click_xy": {
      if (!dims) {
        throw new Error("click_xy without vision dims");
      }
      const { shotW, shotH, viewW, viewH } = dims;
      const xImg = clamp(action.x, 0, Math.max(0, shotW - 1));
      const yImg = clamp(action.y, 0, Math.max(0, shotH - 1));
      const xCss = shotW > 0 ? (xImg / shotW) * viewW : 0;
      const yCss = shotH > 0 ? (yImg / shotH) * viewH : 0;
      emit({
        type: "log",
        message: `click: screenshot(${xImg},${yImg}) → view CSS (${xCss.toFixed(1)},${yCss.toFixed(1)})`,
      });
      tab.clickAtCss(xCss, yCss);
      return;
    }
    case "press_enter":
      tab.pressEnter();
      emit({ type: "log", message: "[agent] press Enter" });
      return;
    case "type":
      await tab.runJs(buildTypeIntoActiveElementScript(action.text));
      return;
    case "scroll": {
      await tab.runJs(`void window.scrollBy(0, ${Number(action.deltaY)});`);
      return;
    }
    case "wait":
      await sleep(Math.min(15_000, Math.max(0, action.ms)));
      return;
    case "done":
      return;
    default:
      return;
  }
}
