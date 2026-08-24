// ตรวจว่า model ไหนยังใช้ได้กับ OpenRouter จริงๆ (max_tokens น้อยๆ ประหยัดสุด)
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
function envOf(key) {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
}
const KEY = envOf("OPENROUTER_API_KEY");

const MODELS = [
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o-mini",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
  "anthropic/claude-3.5-haiku",
  "anthropic/claude-sonnet-4",
  "google/gemma-3-27b-it:free",
];

for (const model of MODELS) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "say ok" }],
        max_tokens: 5,
      }),
    });
    const j = await res.json().catch(() => ({}));
    const errCode = j.error?.code ?? j.error?.message?.slice(0, 60) ?? "";
    console.log(`${res.status === 200 ? "✓ ALIVE " : "✗ dead  "} ${model} http=${res.status}${errCode ? " err=" + JSON.stringify(errCode) : ""}`);
  } catch (e) {
    console.log(`✗ fetch-error ${model}: ${e.message}`);
  }
}
