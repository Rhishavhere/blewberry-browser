import { generateObject, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Tab } from "./Tab";

dotenv.config({ path: join(__dirname, "../../.env") });

export const AgentStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("navigate"), url: z.string() }),
  z.object({
    action: z.literal("click_xy"),
    x: z.number(),
    y: z.number(),
  }),
  z.object({ action: z.literal("type"), text: z.string() }),
  z.object({ action: z.literal("scroll"), deltaY: z.number() }),
  z.object({ action: z.literal("wait"), ms: z.number() }),
  z.object({ action: z.literal("done"), summary: z.string() }),
]);

export type AgentStep = z.infer<typeof AgentStepSchema>;

export type AgentEvent =
  | { type: "log"; message: string }
  | { type: "step"; step: number; action: AgentStep }
  | { type: "error"; message: string }
  | { type: "finished"; reason: string };

const SYSTEM = `You are a browser automation agent. Each turn you receive a fresh screenshot of the active tab and a user goal.

You must output exactly one structured action (the response schema enforces this).

click_xy coordinates:
- Use pixel coordinates in the SAME space as the screenshot image: origin top-left, x right, y down.
- Stay within the image bounds given in the user message.

Guidelines:
- Prefer click_xy on visible interactive elements.
- navigate: use full https:// URLs when opening a new site.
- type: types into the currently focused element (click an input first).
- scroll: deltaY is CSS pixels (positive scrolls down).
- wait: milliseconds to allow network/DOM updates (e.g. after navigate).
- When the goal is achieved, respond with done and a short summary.`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function getAgentLanguageModel(): LanguageModel | null {
  const provider =
    process.env.LLM_PROVIDER?.toLowerCase() === "anthropic"
      ? "anthropic"
      : "openai";
  const modelId =
    process.env.AGENT_MODEL ||
    (provider === "anthropic"
      ? "claude-3-5-haiku-20241022"
      : "gpt-4o-mini");
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return anthropic(modelId);
  }
  if (!process.env.OPENAI_API_KEY) return null;
  return openai(modelId);
}

export class AgentRunner {
  private abortController: AbortController | null = null;

  stop(): void {
    this.abortController?.abort();
  }

  async run(options: {
    goal: string;
    getActiveTab: () => Tab | null;
    emit: (event: AgentEvent) => void;
    maxSteps?: number;
  }): Promise<void> {
    const { goal, getActiveTab, emit, maxSteps = 25 } = options;
    const model = getAgentLanguageModel();
    if (!model) {
      emit({
        type: "error",
        message:
          "Agent model not configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY and LLM_PROVIDER if needed.",
      });
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const historyLines: string[] = [];

    try {
      for (let step = 0; step < maxSteps; step++) {
        if (signal.aborted) {
          emit({ type: "finished", reason: "stopped" });
          return;
        }

        const tab = getActiveTab();
        if (!tab) {
          emit({ type: "error", message: "no_active_tab" });
          return;
        }

        let imageDataUrl: string;
        let shotW: number;
        let shotH: number;
        let viewW: number;
        let viewH: number;

        try {
          const native = await tab.screenshot();
          imageDataUrl = native.toDataURL();
          const size = native.getSize();
          shotW = size.width;
          shotH = size.height;
          const vp = await tab.runJs(
            "return [window.innerWidth, window.innerHeight]"
          ) as [number, number];
          viewW = vp[0];
          viewH = vp[1];
        } catch (e) {
          emit({ type: "error", message: `screenshot_failed: ${String(e)}` });
          return;
        }

        const recent =
          historyLines.length > 0
            ? `Recent actions:\n${historyLines.slice(-8).join("\n")}`
            : "";

        const ctxText = [
          `Goal: ${goal}`,
          `Step ${step + 1} of ${maxSteps}.`,
          `Page URL: ${tab.url}`,
          `Page title: ${tab.title}`,
          `Screenshot pixel size: ${shotW}x${shotH}`,
          `Viewport CSS: ${viewW}x${viewH}`,
          `click_xy must use screenshot pixel coordinates within [0, ${shotW - 1}] x [0, ${shotH - 1}].`,
          recent,
        ]
          .filter(Boolean)
          .join("\n\n");

        let action: AgentStep;
        try {
          const { object } = await generateObject({
            model,
            schema: AgentStepSchema,
            system: SYSTEM,
            abortSignal: signal,
            maxRetries: 1,
            temperature: 0.2,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", image: imageDataUrl },
                  { type: "text", text: ctxText },
                ],
              },
            ],
          });
          action = object;
        } catch (e) {
          emit({ type: "error", message: `llm_error: ${String(e)}` });
          return;
        }

        emit({ type: "step", step: step + 1, action });
        emit({ type: "log", message: JSON.stringify(action) });

        if (action.action === "done") {
          emit({ type: "finished", reason: action.summary });
          return;
        }

        await executeStep(tab, action, shotW, shotH, viewW, viewH, emit);
        historyLines.push(JSON.stringify(action));
        await sleep(350);
      }

      emit({ type: "finished", reason: "max_steps" });
    } finally {
      this.abortController = null;
    }
  }
}

async function executeStep(
  tab: Tab,
  action: AgentStep,
  shotW: number,
  shotH: number,
  viewW: number,
  viewH: number,
  emit: (event: AgentEvent) => void
): Promise<void> {
  switch (action.action) {
    case "navigate":
      await tab.loadURL(action.url);
      return;
    case "click_xy": {
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
    case "type":
      await tab.runJs(`(function(){
          var t = ${JSON.stringify(action.text)};
          var el = document.activeElement;
          if (!el) return "no_focus";
          if (el.isContentEditable) {
            document.execCommand("insertText", false, t);
            return "contenteditable";
          }
          if ("value" in el && typeof el.value === "string") {
            el.value += t;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return "input";
          }
          return "unsupported";
        })()`);
      return;
    case "scroll":
      await tab.runJs(`window.scrollBy(0, ${Number(action.deltaY)});`);
      return;
    case "wait":
      await sleep(Math.min(15_000, Math.max(0, action.ms)));
      return;
    default:
      return;
  }
}
