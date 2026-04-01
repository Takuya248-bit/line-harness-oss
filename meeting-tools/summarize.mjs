#!/usr/bin/env node
/**
 * summarize.mjs - 文字起こしテキストをClaude Haikuで要約し、Notion議事録DBに投入
 *
 * Usage: node summarize.mjs <transcript.txt> <meeting_name>
 *
 * Env: ANTHROPIC_API_KEY, NOTION_TOKEN, NOTION_DB_MEETINGS_ID
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.ANTHROPIC_API_KEY;
const notionToken = process.env.NOTION_TOKEN;
const meetingsDbId = process.env.NOTION_DB_MEETINGS_ID;
if (!apiKey) { console.error("ANTHROPIC_API_KEY が設定されていません"); process.exit(1); }
if (!notionToken || !meetingsDbId) { console.error("NOTION_TOKEN / NOTION_DB_MEETINGS_ID が設定されていません"); process.exit(1); }

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

const today = new Date().toISOString().slice(0, 10);

// Notion 議事録DBに投入
// ブロック本文を組み立て (2000文字制限のため分割)
function textBlocks(text, heading) {
  const blocks = [];
  if (heading) {
    blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: heading } }] } });
  }
  const lines = text.split("\n").filter(Boolean);
  for (const line of lines) {
    blocks.push({
      object: "block", type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ text: { content: line.replace(/^-\s*/, "").slice(0, 2000) } }] },
    });
  }
  return blocks;
}

const children = [
  ...textBlocks(result.summary, "要点"),
  ...(result.decisions ? textBlocks(result.decisions, "決定事項") : []),
  ...(result.action_items ? textBlocks(result.action_items, "アクション") : []),
];

// 文字起こし全文もブロックとして追加 (2000文字ずつ分割)
children.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: "文字起こし" } }] } });
for (let i = 0; i < transcript.length; i += 2000) {
  children.push({
    object: "block", type: "paragraph",
    paragraph: { rich_text: [{ text: { content: transcript.slice(i, i + 2000) } }] },
  });
}

const notionRes = await fetch("https://api.notion.com/v1/pages", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${notionToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    parent: { database_id: meetingsDbId },
    properties: {
      Name: { title: [{ text: { content: result.title } }] },
      Date: { date: { start: today } },
      Tags: { multi_select: (result.tags || meetingName).split(",").filter(Boolean).map((t) => ({ name: t.trim() })) },
    },
    children: children.slice(0, 100), // Notion API上限100ブロック
  }),
});

if (!notionRes.ok) {
  const err = await notionRes.json();
  console.error(`\nNotion投入失敗 ${notionRes.status}: ${JSON.stringify(err)}`);
  process.exit(1);
}

const page = await notionRes.json();
console.log(`\nNotion議事録DB投入: OK`);
console.log(`  URL: ${page.url}`);
