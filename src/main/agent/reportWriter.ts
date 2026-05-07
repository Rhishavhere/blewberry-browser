import { generateText, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export type ReportSegmentInput = {
  index: number;
  url: string;
  title: string;
  body: string;
};

const MAX_BODY_PER_SEGMENT = 120_000;

const REPORT_SYSTEM = `You are a dedicated research-report and summary writer. You receive the user's original task and raw page text excerpts that a browser agent saved for you.

Output a single polished Markdown document only (no surrounding JSON or XML).
- Start with a clear # title line.
- Use ## and ### for structure.
- Include tables where they clarify facts (GitHub-flavored markdown).
- Attribute sources by URL when quoting specific pages.
- Synthesize across all segments into one coherent report — do not repeat large verbatim dumps unless necessary as block quotes.
- Be human readable, casual and explanor
- The whole output should be beautifully formatted and highly presentable.
`;

function getReportWriterLanguageModel(): LanguageModel | null {
  const explicit = process.env.REPORT_WRITER_MODEL?.trim();
  const provider =
    process.env.LLM_PROVIDER?.toLowerCase() === "anthropic"
      ? "anthropic"
      : "openai";
  const modelId =
    explicit ||
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

function trimSegmentBody(body: string): string {
  if (body.length <= MAX_BODY_PER_SEGMENT) return body;
  return (
    body.slice(0, MAX_BODY_PER_SEGMENT) +
    `\n\n_[Body truncated at ${MAX_BODY_PER_SEGMENT} characters]_\n`
  );
}

export function extractTitleFromMarkdown(md: string): string {
  const line = md.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!line) return "Research report";
  const h1 = /^#\s+(.+)$/.exec(line.trim());
  if (h1) return h1[1].trim().slice(0, 200);
  return line.trim().slice(0, 200);
}

export async function generateResearchReportMarkdown(args: {
  goal: string;
  segments: ReportSegmentInput[];
  historyLines: readonly string[];
  signal: AbortSignal;
}): Promise<{ markdown: string; title: string }> {
  const model = getReportWriterLanguageModel();
  if (!model) {
    throw new Error("report_writer_no_model");
  }
  const trace =
    args.historyLines.length > 0
      ? args.historyLines.slice(-40).join("\n")
      : "(no action trace)";

  const segmentBlocks = args.segments
    .map((s) => {
      const b = trimSegmentBody(s.body);
      return [
        `### Segment ${s.index}`,
        `URL: ${s.url}`,
        `Page title: ${s.title}`,
        "",
        "```",
        b,
        "```",
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const { text } = await generateText({
    model,
    system: REPORT_SYSTEM,
    abortSignal: args.signal,
    maxRetries: 1,
    temperature: 0.35,
    maxOutputTokens: 16_384,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Original user task:`,
              args.goal,
              "",
              `Saved page content (${args.segments.length} segment(s)):`,
              segmentBlocks,
              "",
              `Optional action trace (recent, for context only):`,
              trace,
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const markdown = text.trim();
  if (!markdown) throw new Error("report_writer_empty_output");
  return {
    markdown,
    title: extractTitleFromMarkdown(markdown),
  };
}
