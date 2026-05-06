import { generateText, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Tab } from "./Tab";

dotenv.config({ path: join(__dirname, "../../.env") });

export const AgentStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("see") }),
  z.object({ action: z.literal("new_tab"), url: z.string().optional() }),
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
  /** User-facing prose summary (shown in the Reply card, not mixed with technical logs). */
  | { type: "conclusion"; text: string }
  | { type: "error"; message: string }
  | { type: "finished"; reason: string };

async function writeUserConclusion(args: {
  goal: string;
  historyLines: readonly string[];
  agentDoneSummary: string;
  model: LanguageModel | null;
  signal: AbortSignal;
}): Promise<string> {
  const { goal, historyLines, agentDoneSummary, model, signal } = args;
  if (!model) {
    return `${agentDoneSummary}`;
  }
  const trace =
    historyLines.length > 0
      ? historyLines.slice(-25).join("\n")
      : "(no recorded actions)";
  try {
    const { text } = await generateText({
      model,
      system: `Write a concise conclusion for someone who delegated a browsing task.
2–5 sentences, friendly and clear. Mention what happened, whether the stated goal appears satisfied, any notable page or search results, and what the user might do next when relevant.

Rules: Plain language only — no JSON, no XML tags, no bullet lists framed as markdown if you can avoid them. Do not apologize excessively.`,
      temperature: 0.35,
      maxOutputTokens: 450,
      abortSignal: signal,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `User goal: ${goal}`,
                "",
                `Agent closing note (technical): ${agentDoneSummary}`,
                "",
                `Action trace (recent lines):`,
                trace,
              ].join("\n"),
            },
          ],
        },
      ],
    });
    const out = text.trim();
    return out.length > 0 ? out : agentDoneSummary;
  } catch {
    return agentDoneSummary;
  }
}

const SYSTEM_BLIND = `You plan browser actions WITHOUT seeing the page yet (no screenshot on this turn).

STRICT OUTPUT (non-negotiable):
- Respond with NOTHING except one JSON object. First character "{", last "}".
- No markdown, prose, XML, or "<".

Allowed actions ONLY on this turn:
{"action":"see"} — use this when you need a screenshot before any UI targeting (recommended before click_xy/type/scroll if unsure).
{"action":"new_tab","url":"https://optional"} — optional url (omit url or empty for default home/new tab).
{"action":"navigate","url":"https://..."} — loads URL in the current active tab.
{"action":"wait","ms":500}
{"action":"done","summary":"..."}

You CANNOT use click_xy, type, or scroll until a screenshot has been sent (respond with see first).

After the first screenshot is ever sent to you, future turns already include screenshots — you never need {"action":"see"} again those will be logged and ignored.`;

const SYSTEM_VISION = `You control a browser from screenshots (this turn HAS an image attached).

STRICT OUTPUT (non-negotiable):
- Respond with NOTHING except one JSON object. First character "{", last "}".
- No markdown, prose, XML, or "<".

The JSON must use exactly one of these shapes:

{"action":"new_tab","url":"https://optional"}
{"action":"navigate","url":"https://..."}
{"action":"click_xy","x":0,"y":0}
{"action":"type","text":"..."}
{"action":"scroll","deltaY":0}
{"action":"wait","ms":500}
{"action":"done","summary":"..."}

Do NOT use {"action":"see"} — screenshots are included every turn automatically from now on.

click_xy: x,y are pixel coords on THIS screenshot image (origin top-left), within bounds in the user message.

Other rules:
- Prefer click_xy on visible controls; click inputs before type.
- navigate uses full https URLs where possible.
- scroll: positive deltaY scrolls down.
- wait after navigations as needed for load.`;

const COERCE_SYSTEM = `Turn the assistant draft into exactly ONE valid JSON object. Output ONLY that JSON — no prose, markdown, XML, or tool tags.

Strict JSON only. Allowed action values combine blind + vision sets:
see | new_tab (optional url) | navigate | click_xy | type | scroll | wait | done`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type VisionDims = { shotW: number; shotH: number; viewW: number; viewH: number };

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
      message: `[repair] Reply was not pure JSON (${String(e1).slice(0, 240)}…) — coercion pass`,
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
      `json_coercion_failed_after_repair: ${String(e2)} ; snippet=${visionText.slice(0, 120)}`
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
    /** Create a new tab (home if url omitted), make it active, return it */
    createTabAndActivate: (url?: string) => Tab;
    emit: (event: AgentEvent) => void;
    maxSteps?: number;
  }): Promise<void> {
    const {
      goal,
      getActiveTab,
      createTabAndActivate,
      emit,
      maxSteps = 25,
    } = options;
    const model = getAgentLanguageModel();
    if (!model) {
      emit({
        type: "conclusion",
        text: "The agent cannot start because no LLM is configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY (and LLM_PROVIDER) to your .env file.",
      });
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
    /** After true, every planner call attaches a screenshot. */
    let visionFromNow = false;
    /** Counts executed browser actions (not see-only, not done). */
    let executedSteps = 0;
    /** Prevents infinite planning loops before first execute */
    let plannerRounds = 0;
    const maxPlannerRounds = maxSteps * 4 + 12;

    try {
      while (executedSteps < maxSteps && plannerRounds < maxPlannerRounds) {
        if (signal.aborted) {
          emit({
            type: "conclusion",
            text: "Stopped before completion. Try running again with the same or a narrower goal.",
          });
          emit({ type: "finished", reason: "stopped" });
          return;
        }

        plannerRounds += 1;

        const tab = getActiveTab();
        if (!tab) {
          emit({
            type: "conclusion",
            text: "No active tab was found. Create or select a tab first, then run the agent again.",
          });
          emit({ type: "error", message: "no_active_tab" });
          return;
        }

        let dims: VisionDims | null = null;
        let imageDataUrl = "";

        if (visionFromNow) {
          try {
            const native = await tab.screenshot();
            imageDataUrl = native.toDataURL();
            const size = native.getSize();
            const vp = (await tab.runJs(
              "(() => [window.innerWidth, window.innerHeight])()"
            )) as [number, number];
            dims = {
              shotW: size.width,
              shotH: size.height,
              viewW: vp[0],
              viewH: vp[1],
            };
          } catch (e) {
            emit({
              type: "conclusion",
              text: `Couldn't capture the active tab: ${String(e)}. Check that a tab is visible and try again.`,
            });
            emit({ type: "error", message: `screenshot_failed: ${String(e)}` });
            return;
          }
        }

        const recent =
          historyLines.length > 0
            ? `Recent actions:\n${historyLines.slice(-8).join("\n")}`
            : "";

        const ctxText = visionFromNow
          ? `[JSON-only. Reply must start with {.]\n\n` +
            [
              `Goal: ${goal}`,
              `Executed actions: ${executedSteps} / ${maxSteps}`,
              `Planner round: ${plannerRounds}`,
              `Page URL: ${tab.url}`,
              `Page title: ${tab.title}`,
              `Screenshot pixel size: ${dims!.shotW}x${dims!.shotH}`,
              `Viewport CSS: ${dims!.viewW}x${dims!.viewH}`,
              `click_xy must use screenshot pixel coordinates within [0, ${dims!.shotW - 1}] x [0, ${dims!.shotH - 1}].`,
              recent,
            ]
              .filter(Boolean)
              .join("\n\n")
          : `[JSON-only. Reply must start with {.]\n\n` +
            [
              `Goal: ${goal}`,
              `No screenshot this turn.`,
              `If you must target UI with click_xy/type/scroll first respond with ONLY {"action":"see"}`,
              `Otherwise choose new_tab, navigate, wait, or done.`,
              `Executed actions: ${executedSteps} / ${maxSteps}`,
              `Planner round: ${plannerRounds}`,
              `Current tab URL: ${tab.url}`,
              `Current tab title: ${tab.title}`,
              recent,
            ]
              .filter(Boolean)
              .join("\n\n");

        const system = visionFromNow ? SYSTEM_VISION : SYSTEM_BLIND;
        const userContent = visionFromNow
          ? ([
              { type: "image" as const, image: imageDataUrl },
              { type: "text" as const, text: ctxText },
            ] as const)
          : [{ type: "text" as const, text: ctxText }];

        let action: AgentStep;
        try {
          const { text } = await generateText({
            model,
            system,
            abortSignal: signal,
            maxRetries: 1,
            temperature: 0,
            maxOutputTokens: visionFromNow ? 512 : 384,
            messages: [{ role: "user", content: [...userContent] }],
          });
          action = await parseOrRepairAgentStep(text, model, signal, emit);
        } catch (e) {
          emit({
            type: "conclusion",
            text:
              "The planner hit an error while talking to the AI. Check your API key and model name in .env, then retry.",
          });
          emit({ type: "error", message: `llm_error: ${String(e)}` });
          return;
        }

        if (action.action === "see") {
          if (visionFromNow) {
            emit({
              type: "log",
              message:
                "[agent] see ignored — screenshots already sent every turn.",
            });
            continue;
          }
          emit({
            type: "log",
            message: "[agent] Screenshot requested; next planner round uses vision.",
          });
          visionFromNow = true;
          continue;
        }

        if (
          !visionFromNow &&
          (action.action === "click_xy" ||
            action.action === "type" ||
            action.action === "scroll")
        ) {
          emit({
            type: "conclusion",
            text:
              "This step needs a screenshot first. The agent should reply with only {\"action\":\"see\"} before clicking or typing.",
          });
          emit({
            type: "error",
            message:
              "blind_turn: use {\"action\":\"see\"} once before click_xy, type, or scroll.",
          });
          return;
        }

        emit({ type: "step", step: executedSteps + 1, action });

        if (action.action === "done") {
          const summary = action.summary.trim();
          emit({
            type: "conclusion",
            text: await writeUserConclusion({
              goal,
              historyLines,
              agentDoneSummary:
                summary ||
                "The agent indicated the task is finished (no extra detail).",
              model,
              signal,
            }),
          });
          emit({ type: "finished", reason: summary || "done" });
          return;
        }

        try {
          await executeStep(
            tab,
            action,
            dims,
            createTabAndActivate,
            emit
          );
        } catch (execErr) {
          emit({
            type: "conclusion",
            text: `Something went wrong while executing that action: ${String(execErr)}`,
          });
          emit({
            type: "error",
            message: `execute_step_failed: ${String(execErr)}`,
          });
          return;
        }
        historyLines.push(JSON.stringify(action));
        executedSteps += 1;
        visionFromNow = true;

        await sleep(350);
      }

      if (executedSteps >= maxSteps) {
        emit({
          type: "conclusion",
          text: `Ran out of allowed actions (${maxSteps} steps) before the agent signaled completion. Increase the limit or shorten the goal.`,
        });
        emit({ type: "finished", reason: "max_steps" });
      } else {
        emit({
          type: "conclusion",
          text: `Stopped because the planner hit too many rounds (${maxPlannerRounds}). The agent may have been looping (for example screenshot requests). Try a clearer goal or rerun.`,
        });
        emit({ type: "finished", reason: "max_planner_rounds" });
      }
    } finally {
      this.abortController = null;
    }
  }
}

async function executeStep(
  tab: Tab,
  action: AgentStep,
  dims: VisionDims | null,
  createTabAndActivate: (url?: string) => Tab,
  emit: (event: AgentEvent) => void
): Promise<void> {
  switch (action.action) {
    case "see":
      return;
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
    case "scroll": {
      await tab.runJs(`void window.scrollBy(0, ${Number(action.deltaY)});`);
      return;
    }
    case "wait":
      await sleep(Math.min(15_000, Math.max(0, action.ms)));
      return;
    default:
      return;
  }
}
