#!/usr/bin/env node
/**
 * summarize.mjs - 文字起こしテキストをGroq (Llama) で要約し、Notion議事録DBに投入
 *
 * Usage: node summarize.mjs <transcript.txt> <meeting_name>
 *
 * Env: GROQ_API_KEY, NOTION_TOKEN, NOTION_DB_MEETINGS_ID
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const groqKey = process.env.GROQ_API_KEY;
const notionToken = process.env.NOTION_TOKEN;
const meetingsDbId = process.env.NOTION_DB_MEETINGS_ID;
if (!groqKey) { console.error("GROQ_API_KEY が設定されていません"); process.exit(1); }
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

const MAX_CHARS = 30000;
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

// Groq API 呼び出し (Llama 3.3-70B)
const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${groqKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!res.ok) {
  const err = await res.json();
  console.error(`Groq API error ${res.status}: ${JSON.stringify(err)}`);
  process.exit(1);
}

const data = await res.json();
const rawText = data.choices[0].message.content;

const jsonMatch = rawText.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("Groq APIから有効なJSONが返されませんでした:");
  console.error(rawText);
  process.exit(1);
}

// JSON内の生改行をエスケープ (LLMが箇条書きを生改行で出力する場合の対策)
const sanitized = jsonMatch[0].replace(/(?<=:\s*"[^"]*)\n/g, "\\n");
let result;
try {
  result = JSON.parse(sanitized);
} catch {
  // フォールバック: 各フィールドを正規表現で抽出
  const extract = (key) => {
    const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`));
    return m ? m[1].replace(/\\n/g, "\n") : "";
  };
  result = {
    title: extract("title"),
    category: extract("category"),
    subcategory: "meeting",
    summary: extract("summary"),
    decisions: extract("decisions"),
    action_items: extract("action_items"),
    tags: extract("tags"),
  };
}
console.log("要約結果:");
console.log(`  タイトル: ${result.title}`);
console.log(`  カテゴリ: ${result.category}`);
console.log(`  要点:\n${result.summary}`);
if (result.decisions) console.log(`  決定事項:\n${result.decisions}`);
if (result.action_items) console.log(`  アクション:\n${result.action_items}`);

const today = new Date().toISOString().slice(0, 10);

// Notion 議事録DBに投入
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
    children: children.slice(0, 100),
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
