#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const sourceHtml =
  process.argv[2] ??
  "/Users/kimuratakuya/Downloads/balilingual-lstep-v3-overview-local.html";
const outDir =
  process.argv[3] ??
  path.resolve(process.cwd(), "config/barilingual-lstep-notion/seed");

const html = fs.readFileSync(sourceHtml, "utf8");

function extractBalanced(source, token) {
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`Token not found: ${token}`);
  let i = start + token.length;
  while (/\s/.test(source[i])) i++;
  const open = source[i];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) throw new Error(`Unsupported opener ${open} for token ${token}`);

  let depth = 0;
  let inStr = null;
  let escaped = false;
  for (let p = i; p < source.length; p++) {
    const ch = source[p];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(i, p + 1);
    }
  }
  throw new Error(`Could not extract token ${token}`);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function extractByAlternatives(source, tokens) {
  for (const token of tokens) {
    const start = source.indexOf(token);
    if (start >= 0) return extractBalanced(source, token);
  }
  return null;
}

const dataRaw = extractByAlternatives(html, ["const DATA=", "const DATA ="]);
if (!dataRaw) throw new Error("Token not found: const DATA=");
const data = JSON.parse(dataRaw);

const nodeConfigRaw = extractByAlternatives(html, ["const NODE_CONFIG=", "const NODE_CONFIG ="]);
let nodeConfig = {};
if (nodeConfigRaw) {
  nodeConfig = eval(`(${nodeConfigRaw})`);
} else {
  // Fallback for local overview HTML that doesn't include NODE_CONFIG.
  // Keep required CSV columns populated to allow Notion import.
  nodeConfig = Object.fromEntries(
    Object.keys(data.nodes ?? {}).map((nodeId) => [
      nodeId,
      {
        conversion: "",
        condOn: "",
        friendInfo: "",
        tags: "",
        schedule: "",
        actions: "",
      },
    ]),
  );
}

const pairsRaw = extractByAlternatives(html, ["const pairs=", "const pairs ="]);
if (!pairsRaw) throw new Error("Token not found: const pairs=");
const pairs = eval(pairsRaw);

function defaultCfg() {
  return {
    conversion: "",
    condOn: "",
    friendInfo: "",
    tags: "",
    schedule: "",
    actions: "",
  };
}

function ensureNode(id) {
  if (!id) return;
  if (!nodeConfig[id]) nodeConfig[id] = defaultCfg();
}

for (const [from, to] of pairs) {
  ensureNode(from);
  ensureNode(to);
}

for (const scenarioId of Object.keys(data.scenarios ?? {})) {
  const scenarioNodeId =
    scenarioId === "S_CHAT" ? "schat" : scenarioId.toLowerCase().replaceAll("_", "");
  ensureNode(scenarioNodeId);
}

const nodeRows = Object.entries(nodeConfig).map(([nodeId, cfg]) => ({
  node_id: nodeId,
  display_name: data.nodes?.[nodeId]?.title ?? nodeId,
  phase: data.nodes?.[nodeId]?.phase ?? "",
  conversion: cfg.conversion ?? "",
  condition_on: cfg.condOn ?? "",
  friend_info_policy: cfg.friendInfo ?? "",
  tags_add: cfg.tags ?? "",
  schedule: cfg.schedule ?? "",
  actions: cfg.actions ?? "",
  enabled: "true",
  source_version: "balilingual-lstep-v3-overview-local.html",
}));

const edgeHint = {
  s_auto: { trigger_type: "time", trigger_detail: "post-anket no action timeout" },
  step6_cv: { trigger_type: "staff_action", trigger_detail: "payment confirmed" },
  step6_ncv: { trigger_type: "system", trigger_detail: "payment not confirmed" },
};

const transitionRows = pairs.map(([from, to], idx) => {
  const hint = edgeHint[to] ?? { trigger_type: "click", trigger_detail: "normal routing" };
  return {
    transition_id: `T_${String(idx + 1).padStart(3, "0")}`,
    from_node_id: from,
    to_node_id: to,
    trigger_type: hint.trigger_type,
    trigger_detail: hint.trigger_detail,
    priority: String(idx + 1),
    stop_current_scenario: to === "step6_cv" || to === "step6_ncv" ? "true" : "false",
    enabled: "true",
  };
});

const messageRows = [];
for (const [scenarioId, steps] of Object.entries(data.scenarios ?? {})) {
  for (const st of steps) {
    for (const [msgIdx, msg] of (st.msgs ?? []).entries()) {
      const isCta = msg.type === "cta";
      const scenarioNodeId =
        scenarioId === "S_CHAT"
          ? "schat"
          : scenarioId.toLowerCase().replaceAll("_", "");
      messageRows.push({
        message_id: `${st.step_id}_M${String(msgIdx + 1).padStart(2, "0")}`,
        node_id: scenarioNodeId,
        scenario_id: scenarioId,
        course_id: "",
        day_index: String(st.day),
        time_slot: st.time ?? "",
        message_type: msg.type === "school" ? "text" : msg.type,
        content: msg.body ?? "",
        cta_label: isCta ? (msg.body ?? "").split("\n")[0] : "",
        cta_action: "",
        ab_variant: "all",
        variant_note: "",
        enabled: "true",
      });
    }
  }
}

for (const [courseId, text] of Object.entries(data.courseVariants ?? {})) {
  messageRows.push(
    {
      message_id: `S02_${courseId}_D0`,
      node_id: "s02",
      scenario_id: "S_02",
      course_id: courseId,
      day_index: "0",
      time_slot: "course-variant",
      message_type: "text",
      content: text.d0 ?? "",
      cta_label: "",
      cta_action: "",
      ab_variant: "all",
      variant_note: "",
      enabled: "true",
    },
    {
      message_id: `S02_${courseId}_D1`,
      node_id: "s02",
      scenario_id: "S_02",
      course_id: courseId,
      day_index: "1",
      time_slot: "course-variant",
      message_type: "text",
      content: text.d1 ?? "",
      cta_label: "",
      cta_action: "",
      ab_variant: "all",
      variant_note: "",
      enabled: "true",
    },
    {
      message_id: `S02_${courseId}_D2`,
      node_id: "s02",
      scenario_id: "S_02",
      course_id: courseId,
      day_index: "2",
      time_slot: "course-variant",
      message_type: "text",
      content: text.d2 ?? "",
      cta_label: "",
      cta_action: "",
      ab_variant: "all",
      variant_note: "",
      enabled: "true",
    },
  );
}

const runTemplateRows = [
  {
    run_id: "RUN_TEMPLATE",
    target_node_id: "s01",
    status: "queued",
    error_type: "",
    error_detail: "",
    last_step: "init",
    screenshot_url: "",
    idempotency_key: "TEMPLATE-REPLACE-ME",
    started_at: "",
    finished_at: "",
    experiment_id: "",
    cohort: "n/a",
    metrics_note:
      "日次のCV率・見積依頼率などはここにメモするか、別集計シートとリンク",
  },
];

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "nodes.csv"), toCsv(nodeRows), "utf8");
fs.writeFileSync(path.join(outDir, "transitions.csv"), toCsv(transitionRows), "utf8");
fs.writeFileSync(path.join(outDir, "messages.csv"), toCsv(messageRows), "utf8");
fs.writeFileSync(path.join(outDir, "runs_template.csv"), toCsv(runTemplateRows), "utf8");

console.log(`Exported seed CSVs to ${outDir}`);
console.log(
  `nodes=${nodeRows.length}, transitions=${transitionRows.length}, messages=${messageRows.length}, runs_template=${runTemplateRows.length}`,
);
