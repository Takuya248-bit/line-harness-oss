#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const token = process.env.NOTION_TOKEN;
const nodesDbId = process.env.NOTION_DB_NODES_ID;
const transitionsDbId = process.env.NOTION_DB_TRANSITIONS_ID;
const messagesDbId = process.env.NOTION_DB_MESSAGES_ID;
const runsDbId = process.env.NOTION_DB_RUNS_ID;

const defaultSeedDir = path.resolve(
  process.cwd(),
  "config/barilingual-lstep-notion/seed",
);
const IMPORT_KEYWORDS = new Set([
  "all",
  "messages",
  "runs",
  "nodes",
  "transitions",
]);

let seedDir = defaultSeedDir;
let importOnly = "all";
const a2 = process.argv[2];
const a3 = process.argv[3];
if (a2) {
  if (IMPORT_KEYWORDS.has(a2.toLowerCase())) {
    importOnly = a2.toLowerCase();
  } else {
    seedDir = path.resolve(process.cwd(), a2);
    if (a3 && IMPORT_KEYWORDS.has(a3.toLowerCase())) {
      importOnly = a3.toLowerCase();
    }
  }
}

if (!token || !nodesDbId || !transitionsDbId || !messagesDbId || !runsDbId) {
  console.error(
    "Missing env. Set NOTION_TOKEN and NOTION_DB_*_ID values, then re-run.",
  );
  process.exit(1);
}

const notionVersion = "2022-06-28";
const baseUrl = "https://api.notion.com/v1";

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

async function notionCreatePage(databaseId, properties) {
  const res = await fetch(`${baseUrl}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function asTitle(content) {
  return { title: [{ type: "text", text: { content } }] };
}
function asText(content) {
  return { rich_text: [{ type: "text", text: { content: String(content ?? "") } }] };
}
function asCheckbox(v) {
  return { checkbox: String(v).toLowerCase() === "true" };
}
function asNumber(v) {
  return { number: v === "" ? null : Number(v) };
}
function asSelect(v) {
  return { select: v ? { name: v } : null };
}
function asUrl(v) {
  return { url: v || null };
}
function asDate(v) {
  return { date: v ? { start: v } : null };
}

function mapNode(row) {
  return {
    node_id: asTitle(row.node_id),
    display_name: asText(row.display_name),
    phase: asText(row.phase),
    conversion: asText(row.conversion),
    condition_on: asText(row.condition_on),
    friend_info_policy: asText(row.friend_info_policy),
    tags_add: asText(row.tags_add),
    schedule: asText(row.schedule),
    actions: asText(row.actions),
    enabled: asCheckbox(row.enabled),
    source_version: asText(row.source_version),
  };
}
function mapTransition(row) {
  return {
    transition_id: asTitle(row.transition_id),
    from_node_id: asText(row.from_node_id),
    to_node_id: asText(row.to_node_id),
    trigger_type: asSelect(row.trigger_type),
    trigger_detail: asText(row.trigger_detail),
    priority: asNumber(row.priority),
    stop_current_scenario: asCheckbox(row.stop_current_scenario),
    enabled: asCheckbox(row.enabled),
  };
}
function mapMessage(row) {
  const ab = (row.ab_variant ?? "all").trim() || "all";
  return {
    message_id: asTitle(row.message_id),
    node_id: asText(row.node_id),
    scenario_id: asText(row.scenario_id),
    course_id: asText(row.course_id),
    day_index: asNumber(row.day_index),
    time_slot: asText(row.time_slot),
    message_type: asSelect(row.message_type),
    content: asText(row.content),
    cta_label: asText(row.cta_label),
    cta_action: asText(row.cta_action),
    ab_variant: asSelect(ab),
    variant_note: asText(row.variant_note ?? ""),
    enabled: asCheckbox(row.enabled),
  };
}
function mapRun(row) {
  const cohort = (row.cohort ?? "").trim();
  return {
    run_id: asTitle(row.run_id),
    target_node_id: asText(row.target_node_id),
    status: asSelect(row.status),
    error_type: asText(row.error_type),
    error_detail: asText(row.error_detail),
    last_step: asText(row.last_step),
    screenshot_url: asUrl(row.screenshot_url),
    idempotency_key: asText(row.idempotency_key),
    started_at: asDate(row.started_at),
    finished_at: asDate(row.finished_at),
    experiment_id: asText(row.experiment_id ?? ""),
    cohort: asSelect(cohort),
    metrics_note: asText(row.metrics_note ?? ""),
  };
}

async function importRows(rows, databaseId, mapper, label) {
  let ok = 0;
  for (const row of rows) {
    await notionCreatePage(databaseId, mapper(row));
    ok++;
    if (ok % 20 === 0) process.stdout.write(`${label}: ${ok}/${rows.length}\n`);
  }
  return ok;
}

const nodes = parseCsv(path.join(seedDir, "nodes.csv"));
const transitions = parseCsv(path.join(seedDir, "transitions.csv"));
const messages = parseCsv(path.join(seedDir, "messages.csv"));
const runs = parseCsv(path.join(seedDir, "runs_template.csv"));

const result = {};
const doAll = importOnly === "all";
const doNodes = doAll || importOnly === "nodes";
const doTransitions = doAll || importOnly === "transitions";
const doMessages = doAll || importOnly === "messages";
const doRuns = doAll || importOnly === "runs";

if (doNodes) {
  result.nodes = await importRows(nodes, nodesDbId, mapNode, "nodes");
}
if (doTransitions) {
  result.transitions = await importRows(
    transitions,
    transitionsDbId,
    mapTransition,
    "transitions",
  );
}
if (doMessages) {
  result.messages = await importRows(messages, messagesDbId, mapMessage, "messages");
}
if (doRuns) {
  result.runs = await importRows(runs, runsDbId, mapRun, "runs");
}

console.log(JSON.stringify(result, null, 2));
