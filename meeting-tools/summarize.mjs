#!/usr/bin/env node
/**
 * summarize.mjs - 文字起こしテキストをClaude Haikuで要約し、Notion知識DBに投入
 *
 * Usage: node summarize.mjs <transcript.txt> <meeting_name>
 *
 * Env: ANTHROPIC_API_KEY, NOTION_TOKEN, NOTION_DB_KNOWLEDGE_ID
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY が設定されていません");
  process.exit(1);
}

const [, , transcriptPath, meetingName] = process.argv;
if (!transcriptPath || !meetingName) {
  console.error("Usage: node summarize.mjs <transcript.txt> <meeting_name>");
  process.exit(1);
}

const transcript = readFileSync(transcriptPath, "utf8").trim();
if (!transcript) {
  console.error("文字起こしファイルが空です");
  process.exit(1);
}

// 文字起こしが長い場合は先頭と末尾を使う (Haiku入力制限対策)
const MAX_CHARS = 80000;
const trimmed =
  transcript.length > MAX_CHARS
    ? transcript.slice(0, MAX_CHARS / 2) +
      "\n\n[...中略...]\n\n" +
      transcript.slice(-MAX_CHARS / 2)
    : transcript;

const prompt = `以下はミーティング「${meetingName}」の文字起こしです。

<transcript>
${trimmed}
</transcript>

以下のJSON形式で要約してください:
{
  "title": "ミーティングのタイトル（簡潔に）",
  "category": "method|case|market|technology のいずれか",
  "subcategory": "meeting",
  "summary": "要点を箇条書き（各行 - で始める、5-10項目）",
  "decisions": "決定事項（あれば。各行 - で始める）",
  "action_items": "次のアクション（あれば。各行 - で始める）",
  "tags": "関連タグをカンマ区切り"
}

JSONのみ出力してください。`;

// Claude API 呼び出し
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!res.ok) {
  const err = await res.json();
  console.error(`Claude API error ${res.status}: ${JSON.stringify(err)}`);
  process.exit(1);
}

const data = await res.json();
const rawText = data.content[0].text;

// JSON抽出 (コードブロックで囲まれている場合に対応)
const jsonMatch = rawText.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("Claude APIから有効なJSONが返されませんでした:");
  console.error(rawText);
  process.exit(1);
}

const result = JSON.parse(jsonMatch[0]);
console.log("要約結果:");
console.log(`  タイトル: ${result.title}`);
console.log(`  カテゴリ: ${result.category}`);
console.log(`  要点:\n${result.summary}`);
if (result.decisions) console.log(`  決定事項:\n${result.decisions}`);
if (result.action_items) console.log(`  アクション:\n${result.action_items}`);

// Notion 知識DBに投入
const content = [
  result.summary,
  result.decisions ? `\n決定事項:\n${result.decisions}` : "",
  result.action_items ? `\nアクション:\n${result.action_items}` : "",
].join("");

const knowledgeScript = resolve(__dirname, "../scripts/knowledge-add.mjs");

try {
  execSync(
    `node ${JSON.stringify(knowledgeScript)} ` +
      `${JSON.stringify(result.category)} ` +
      `${JSON.stringify(result.subcategory || "meeting")} ` +
      `${JSON.stringify(result.title)} ` +
      `${JSON.stringify(content.slice(0, 2000))} ` +
      `${JSON.stringify(result.tags || meetingName)} ` +
      `"firsthand" "verified"`,
    { stdio: "inherit" }
  );
  console.log("\nNotion知識DB投入: OK");
} catch {
  console.error("\nNotion知識DB投入: 失敗（手動で投入してください）");
  console.error(`  内容は ${transcriptPath} を参照`);
}
