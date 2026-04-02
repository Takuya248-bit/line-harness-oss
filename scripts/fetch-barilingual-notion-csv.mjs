#!/usr/bin/env node
/**
 * Notion DB → seed CSV エクスポート
 * Usage: node scripts/fetch-barilingual-notion-csv.mjs [nodes|messages|transitions|all]
 * 出力先: config/barilingual-lstep-notion/seed/*.csv
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { queryAll, getText, escapeCsv, toCsv } from "./lib/notion-helpers.mjs";

const nodesDbId = process.env.NOTION_DB_NODES_ID;
const transitionsDbId = process.env.NOTION_DB_TRANSITIONS_ID;
const messagesDbId = process.env.NOTION_DB_MESSAGES_ID;

if (!process.env.NOTION_TOKEN || !nodesDbId || !transitionsDbId || !messagesDbId) {
  console.error("Set NOTION_TOKEN and NOTION_DB_NODES_ID, NOTION_DB_TRANSITIONS_ID, NOTION_DB_MESSAGES_ID");
  process.exit(1);
}

const target = (process.argv[2] || "all").toLowerCase();
const seedDir = path.resolve(process.cwd(), "config/barilingual-lstep-notion/seed");

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
