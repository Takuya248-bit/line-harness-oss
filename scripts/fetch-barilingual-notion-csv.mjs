#!/usr/bin/env node
/**
 * Notion DB → seed CSV エクスポート
 * Usage: node scripts/fetch-barilingual-notion-csv.mjs [nodes|messages|transitions|all]
 * 出力先: config/barilingual-lstep-notion/seed/*.csv
 */
import fs from "node:fs";
import path from "node:path";

const token = process.env.NOTION_TOKEN;
const nodesDbId = process.env.NOTION_DB_NODES_ID;
const transitionsDbId = process.env.NOTION_DB_TRANSITIONS_ID;
const messagesDbId = process.env.NOTION_DB_MESSAGES_ID;

if (!token || !nodesDbId || !transitionsDbId || !messagesDbId) {
  console.error("Set NOTION_TOKEN and NOTION_DB_NODES_ID, NOTION_DB_TRANSITIONS_ID, NOTION_DB_MESSAGES_ID");
  process.exit(1);
}

const target = (process.argv[2] || "all").toLowerCase();
const seedDir = path.resolve(process.cwd(), "config/barilingual-lstep-notion/seed");

const notionVersion = "2022-06-28";

async function queryAll(databaseId) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": notionVersion, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(`${res.status}: ${JSON.stringify(e)}`); }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map(t => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map(t => t.plain_text).join("");
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "multi_select") return (prop.multi_select || []).map(s => s.name).join(",");
  if (prop.type === "number") return prop.number != null ? String(prop.number) : "";
  if (prop.type === "checkbox") return String(prop.checkbox);
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "date") return prop.date?.start || "";
  if (prop.type === "created_time") return prop.created_time || "";
  return "";
}

function escapeCsv(val) {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  const header = columns.join(",");
  const lines = rows.map(row => columns.map(c => escapeCsv(row[c] ?? "")).join(","));
  return header + "\n" + lines.join("\n") + "\n";
}

function extractRows(pages, columns) {
  return pages.map(page => {
    const row = {};
    for (const col of columns) {
      row[col] = getText(page.properties[col]);
    }
    return row;
  });
}

const nodesCols = ["node_id", "display_name", "phase", "conversion", "condition_on", "friend_info_policy", "tags_add", "schedule", "actions", "enabled", "source_version"];
const transitionsCols = ["transition_id", "from_node_id", "to_node_id", "trigger_type", "trigger_detail", "priority", "stop_current_scenario", "enabled"];
const messagesCols = ["message_id", "node_id", "scenario_id", "course_id", "day_index", "time_slot", "message_type", "content", "cta_label", "cta_action", "ab_variant", "variant_note", "enabled"];

const doAll = target === "all";

if (doAll || target === "nodes") {
  const pages = await queryAll(nodesDbId);
  const rows = extractRows(pages, nodesCols);
  fs.writeFileSync(path.join(seedDir, "nodes.csv"), toCsv(rows, nodesCols));
  console.log(`nodes: ${rows.length} rows exported`);
}

if (doAll || target === "transitions") {
  const pages = await queryAll(transitionsDbId);
  const rows = extractRows(pages, transitionsCols);
  fs.writeFileSync(path.join(seedDir, "transitions.csv"), toCsv(rows, transitionsCols));
  console.log(`transitions: ${rows.length} rows exported`);
}

if (doAll || target === "messages") {
  const pages = await queryAll(messagesDbId);
  const rows = extractRows(pages, messagesCols);
  fs.writeFileSync(path.join(seedDir, "messages.csv"), toCsv(rows, messagesCols));
  console.log(`messages: ${rows.length} rows exported`);
}

console.log("Done. CSVs written to", seedDir);
