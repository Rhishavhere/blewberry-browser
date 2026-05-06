import { generateText, type LanguageModel } from "ai";
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

const SYSTEM = `You control a browser from screenshots.

STRICT OUTPUT (non-negotiable):
- Respond with NOTHING except one JSON object. No English before or after it.
- No markdown. No XML. No tags like function_calls or invoke. Never use the character sequence "<".
- First character of your reply must be "{". Last character must be "}".

The JSON must use exactly one of these shapes:

{"action":"navigate","url":"https://..."}
{"action":"click_xy","x":0,"y":0}
{"action":"type","text":"..."}
{"action":"scroll","deltaY":0}
{"action":"wait","ms":500}
{"action":"done","summary":"..."}

click_xy: x,y are pixel coordinates on the SAME screenshot image (origin top-left). Stay within bounds given in the user message.

Other rules:
- Prefer click_xy on visible controls. Click an input before type.
- navigate uses full https URLs.
- scroll deltaY is CSS pixels down (positive scrolls down).
- wait lets the page settle after navigations.
`;

const COERCE_SYSTEM = `Turn the assistant draft into exactly ONE valid JSON object. Output ONLY that JSON — no prose, markdown, XML, or tool tags.

Allowed shapes only:
{"action":"navigate","url":"https://..."}
{"action":"click_xy","x":0,"y":0}
{"action":"type","text":"..."}
{"action":"scroll","deltaY":0}
{"action":"wait","ms":500}
{"action":"done","summary":"..."}

Infer missing numbers from coordinates mentioned in text if possible; otherwise use click_xy centered on plausible UI targets only if coords appear; if impossible, respond {"action":"wait","ms":1200}`;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Plain-text JSON parse — avoids Anthropic structured-output tools (broken for our Zod discriminatedUnion). */
function parseAgentStepJson(raw: string): AgentStep {
  let t = raw.trim();
  const fence =
    /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/m.exec(t) ??
    /```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/m.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`no_json_object_in_model_output: ${raw.slice(0, 200)}`);
  }
  let jsonSlice = t.slice(start, end + 1);
  jsonSlice = jsonSlice.replace(/,\s*([}\]])/g, "$1");
  let obj: unknown;
  try {
    obj = JSON.parse(jsonSlice) as unknown;
  } catch {
    throw new Error(`json_parse_failed: ${jsonSlice.slice(0, 240)}`);
  }
  const parsed = AgentStepSchema.safeParse(obj);
  if (!parsed.success) {
    throw new Error(`schema_mismatch: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function parseOrRepairAgentStep(
  visionText: string,
  model: LanguageModel,
  signal: AbortSignal,
  emit: (event: AgentEvent) => void
): Promise<AgentStep> {
  try {
    return parseAgentStepJson(visionText);
  } catch (e1) {
    emit({
      type: "log",
      message: `[repair] Vision reply was not pure JSON (${String(e1).slice(0, 240)}…) — coercion pass`,
    });
  }

  const draft = visionText.trim().slice(0, 12_000);
  const { text } = await generateText({
    model,
    system: COERCE_SYSTEM,
    abortSignal: signal,
    maxRetries: 1,
    temperature: 0,
    maxOutputTokens: 384,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Convert this assistant draft into one JSON action object:\n\n${draft}`,
          },
        ],
      },
    ],
  });

  try {
    return parseAgentStepJson(text);
  } catch (e2) {
    throw new Error(
      `json_coercion_failed_after_vision_and_repair: ${String(e2)} ; vision_snippet=${visionText.slice(0, 120)}`
    );
  }
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
          const vp = (await tab.runJs(
            "(() => [window.innerWidth, window.innerHeight])()"
          )) as [number, number];
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

        const ctxText =
          `[JSON-only reminder: Reply must start with { and contain no other text.]\n\n` +
          [
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
          const { text } = await generateText({
            model,
            system: SYSTEM,
            abortSignal: signal,
            maxRetries: 1,
            temperature: 0,
            maxOutputTokens: 512,
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
          action = await parseOrRepairAgentStep(text, model, signal, emit);
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
      await tab.runJs(`void window.scrollBy(0, ${Number(action.deltaY)});`);
      return;
    case "wait":
      await sleep(Math.min(15_000, Math.max(0, action.ms)));
      return;
    default:
      return;
  }
}
