#!/usr/bin/env node
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const runsDbId = process.env.NOTION_DB_RUNS_ID;
const runId = process.argv[2] ?? "pilot-s01-001";
const targetNodeId = process.argv[3] ?? "s01";

if (!token || !runsDbId) {
  console.error("Missing env. Set NOTION_TOKEN and NOTION_DB_RUNS_ID.");
  process.exit(1);
}

const res = await fetch("https://api.notion.com/v1/pages", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    parent: { database_id: runsDbId },
    properties: {
      run_id: { title: [{ type: "text", text: { content: runId } }] },
      target_node_id: {
        rich_text: [{ type: "text", text: { content: targetNodeId } }],
      },
      status: { select: { name: "queued" } },
      error_type: { rich_text: [] },
      error_detail: { rich_text: [] },
      last_step: { rich_text: [{ type: "text", text: { content: "init" } }] },
      screenshot_url: { url: null },
      idempotency_key: {
        rich_text: [{ type: "text", text: { content: runId } }],
      },
      started_at: { date: null },
      finished_at: { date: null },
    },
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    { run_id: runId, target_node_id: targetNodeId, page_id: body.id, url: body.url },
    null,
    2,
  ),
);
