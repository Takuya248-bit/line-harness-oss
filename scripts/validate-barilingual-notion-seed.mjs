#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const seedDir =
  process.argv[2] ??
  path.resolve(process.cwd(), "config/barilingual-lstep-notion/seed");

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

const nodes = parseCsv(path.join(seedDir, "nodes.csv")).filter((n) => n.enabled === "true");
const transitions = parseCsv(path.join(seedDir, "transitions.csv")).filter(
  (t) => t.enabled === "true",
);
const messages = parseCsv(path.join(seedDir, "messages.csv")).filter((m) => m.enabled === "true");

const nodeIds = new Set(nodes.map((n) => n.node_id));
const incoming = new Map();
const outgoing = new Map();
for (const id of nodeIds) {
  incoming.set(id, 0);
  outgoing.set(id, 0);
}
for (const t of transitions) {
  if (nodeIds.has(t.from_node_id)) outgoing.set(t.from_node_id, outgoing.get(t.from_node_id) + 1);
  if (nodeIds.has(t.to_node_id)) incoming.set(t.to_node_id, incoming.get(t.to_node_id) + 1);
}

const roots = [...nodeIds].filter((id) => incoming.get(id) === 0);
const leaves = [...nodeIds].filter((id) => outgoing.get(id) === 0);

const graph = new Map();
for (const t of transitions) {
  if (!graph.has(t.from_node_id)) graph.set(t.from_node_id, []);
  graph.get(t.from_node_id).push(t.to_node_id);
}

const seen = new Set();
const stack = ["friend_add"];
while (stack.length) {
  const cur = stack.pop();
  if (seen.has(cur)) continue;
  seen.add(cur);
  for (const nx of graph.get(cur) ?? []) stack.push(nx);
}

const unreachable = [...nodeIds].filter((id) => !seen.has(id));
const duplicateTransitions =
  transitions.length - new Set(transitions.map((t) => t.transition_id)).size;
const duplicateMessages = messages.length - new Set(messages.map((m) => m.message_id)).size;

const summary = {
  nodes: nodes.length,
  transitions: transitions.length,
  messages: messages.length,
  roots,
  leaves,
  unreachable,
  duplicateTransitions,
  duplicateMessages,
  pass:
    roots.length === 1 &&
    roots[0] === "friend_add" &&
    leaves.length === 1 &&
    leaves[0] === "s06" &&
    unreachable.length === 0 &&
    duplicateTransitions === 0 &&
    duplicateMessages === 0,
};

console.log(JSON.stringify(summary, null, 2));
