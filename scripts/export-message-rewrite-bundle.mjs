#!/usr/bin/env node
/**
 * Notion seed の messages.csv（または Notion から同カラムで書き出した CSV）から
 * クラウド LLM 用の JSON バンドルを生成する。
 *
 * Usage:
 *   node scripts/export-message-rewrite-bundle.mjs
 *   node scripts/export-message-rewrite-bundle.mjs path/to/messages.csv [path/to/nodes.csv] [out.json]
 */
import fs from "node:fs";
import path from "node:path";

const defaultSeed = path.resolve(
  process.cwd(),
  "config/barilingual-lstep-notion/seed",
);

function parseCsv(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  if (!src.trim()) return [];
  const rows = [];
  let row = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '"') {
      if (inQuote && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === "," && !inQuote) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [headers, ...bodyRows] = rows;
  return bodyRows.map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });
}

const messagesPath =
  process.argv[2] ?? path.join(defaultSeed, "messages.csv");
const nodesPath =
  process.argv[3] ?? path.join(defaultSeed, "nodes.csv");
const outPath = process.argv[4];

const messages = parseCsv(messagesPath);
let nodeMeta = new Map();
if (fs.existsSync(nodesPath)) {
  for (const n of parseCsv(nodesPath)) {
    nodeMeta.set(n.node_id, {
      display_name: n.display_name ?? "",
      phase: n.phase ?? "",
    });
  }
}

const bundle = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_messages_csv: path.resolve(messagesPath),
  instructions_for_model:
    "Rewrite only text fields; keep message_id unchanged. Output format: see cloud-rewrite-prompt.md",
  messages: messages.map((m) => {
    const meta = nodeMeta.get(m.node_id) ?? {};
    return {
      message_id: m.message_id,
      node_id: m.node_id,
      node_display_name: meta.display_name ?? "",
      node_phase: meta.phase ?? "",
      scenario_id: m.scenario_id,
      course_id: m.course_id ?? "",
      day_index: m.day_index,
      time_slot: m.time_slot,
      message_type: m.message_type,
      content: m.content ?? "",
      cta_label: m.cta_label ?? "",
      cta_action: m.cta_action ?? "",
      ab_variant: m.ab_variant ?? "all",
      variant_note: m.variant_note ?? "",
      enabled: m.enabled ?? "true",
    };
  }),
};

const json = JSON.stringify(bundle, null, 2);
if (outPath) {
  fs.writeFileSync(outPath, json, "utf8");
  console.error(`Wrote ${bundle.messages.length} messages -> ${outPath}`);
} else {
  process.stdout.write(json);
}
