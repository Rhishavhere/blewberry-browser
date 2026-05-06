import "dotenv/config";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY missing");
}

const modelId = process.env.AGENT_MODEL;
const anthropic = createAnthropic({ apiKey });

const result = await generateText({
  model: anthropic(modelId),
  prompt: "write a mini poem",
  maxOutputTokens: 32,
});

console.log({
  model: modelId,
  text: result.text,
});