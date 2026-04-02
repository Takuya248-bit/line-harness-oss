#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const seedDir =
  process.argv[2] ??
  path.resolve(process.cwd(), "config/barilingual-lstep-notion/seed");
const targetNodeId = process.argv[3] ?? "s01";
const mode = process.argv[4] ?? "full"; // full | interrupt | resume
const lastStepInput = process.argv[5] ?? "init";
const outDir =
  process.argv[6] ??
  path.resolve(process.cwd(), "config/barilingual-lstep-notion/run-examples");

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

const nodes = parseCsv(path.join(seedDir, "nodes.csv"));
const transitions = parseCsv(path.join(seedDir, "transitions.csv"));
const messages = parseCsv(path.join(seedDir, "messages.csv"));

const node = nodes.find((n) => n.node_id === targetNodeId);
if (!node) throw new Error(`Node not found: ${targetNodeId}`);

const fields = [
  "conversion",
  "condition_on",
  "friend_info_policy",
  "tags_add",
  "schedule",
  "actions",
];

const stepOrder = [
  "precheck",
  ...fields.map((f) => `node.${f}`),
  "transitions",
  "messages",
  "verify",
  "done",
];

let startIndex = 0;
if (lastStepInput !== "init") {
  const idx = stepOrder.indexOf(lastStepInput);
  startIndex = idx >= 0 ? idx + 1 : 0;
}

const applied = [];
let status = "success";
let lastStep = "done";

for (let i = startIndex; i < stepOrder.length; i++) {
  const step = stepOrder[i];
  if (mode === "interrupt" && step === "node.tags_add") {
    status = "failed";
    lastStep = "node.friend_info_policy";
    break;
  }
  applied.push(step);
  lastStep = step;
}

const relatedTransitions = transitions
  .filter((t) => t.from_node_id === targetNodeId)
  .map((t) => t.transition_id);
const relatedMessages = messages
  .filter((m) => m.node_id === targetNodeId)
  .map((m) => m.message_id);

const runLog = {
  run_id: `dry-${targetNodeId}-${mode}`,
  target_node_id: targetNodeId,
  status,
  last_step: lastStep,
  started_at: new Date().toISOString(),
  finished_at: status === "success" ? new Date().toISOString() : "",
  applied_steps: applied,
  applied_transition_ids: relatedTransitions,
  applied_message_ids: relatedMessages.slice(0, 10),
  note:
    status === "failed"
      ? "Interrupted intentionally for recovery test."
      : "Dry-run completed.",
};

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${runLog.run_id}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(runLog, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
