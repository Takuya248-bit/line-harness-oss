#!/usr/bin/env node
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!token || !parentPageId) {
  console.error(
    "Missing env. Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID, then re-run.",
  );
  process.exit(1);
}

const notionVersion = "2022-06-28";
const baseUrl = "https://api.notion.com/v1";

async function notionCreateDatabase(payload) {
  const res = await fetch(`${baseUrl}/databases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function title(text) {
  return [{ type: "text", text: { content: text } }];
}

const databases = [
  {
    name: "Barilingual Nodes",
    properties: {
      node_id: { title: {} },
      display_name: { rich_text: {} },
      phase: { rich_text: {} },
      conversion: { rich_text: {} },
      condition_on: { rich_text: {} },
      friend_info_policy: { rich_text: {} },
      tags_add: { rich_text: {} },
      schedule: { rich_text: {} },
      actions: { rich_text: {} },
      enabled: { checkbox: {} },
      source_version: { rich_text: {} },
    },
  },
  {
    name: "Barilingual Transitions",
    properties: {
      transition_id: { title: {} },
      from_node_id: { rich_text: {} },
      to_node_id: { rich_text: {} },
      trigger_type: {
        select: {
          options: [
            { name: "click" },
            { name: "time" },
            { name: "tag" },
            { name: "staff_action" },
            { name: "system" },
          ],
        },
      },
      trigger_detail: { rich_text: {} },
      priority: { number: { format: "number" } },
      stop_current_scenario: { checkbox: {} },
      enabled: { checkbox: {} },
    },
  },
  {
    name: "Barilingual Messages",
    properties: {
      message_id: { title: {} },
      node_id: { rich_text: {} },
      scenario_id: { rich_text: {} },
      course_id: { rich_text: {} },
      day_index: { number: { format: "number" } },
      time_slot: { rich_text: {} },
      message_type: {
        select: {
          options: [
            { name: "text" },
            { name: "cta" },
            { name: "system" },
            { name: "menu" },
          ],
        },
      },
      content: { rich_text: {} },
      cta_label: { rich_text: {} },
      cta_action: { rich_text: {} },
      ab_variant: {
        select: {
          options: [
            { name: "all" },
            { name: "A" },
            { name: "B" },
          ],
        },
      },
      variant_note: { rich_text: {} },
      enabled: { checkbox: {} },
    },
  },
  {
    name: "Barilingual Runs",
    properties: {
      run_id: { title: {} },
      target_node_id: { rich_text: {} },
      status: {
        select: {
          options: [
            { name: "queued" },
            { name: "running" },
            { name: "success" },
            { name: "failed" },
            { name: "retry" },
          ],
        },
      },
      error_type: { rich_text: {} },
      error_detail: { rich_text: {} },
      last_step: { rich_text: {} },
      screenshot_url: { url: {} },
      idempotency_key: { rich_text: {} },
      started_at: { date: {} },
      finished_at: { date: {} },
      experiment_id: { rich_text: {} },
      cohort: {
        select: {
          options: [
            { name: "A" },
            { name: "B" },
            { name: "all" },
            { name: "n/a" },
          ],
        },
      },
      metrics_note: { rich_text: {} },
    },
  },
];

const created = [];
for (const db of databases) {
  const payload = {
    parent: { type: "page_id", page_id: parentPageId },
    title: title(db.name),
    properties: db.properties,
  };
  const result = await notionCreateDatabase(payload);
  created.push({ name: db.name, id: result.id, url: result.url });
}

console.log(JSON.stringify(created, null, 2));
