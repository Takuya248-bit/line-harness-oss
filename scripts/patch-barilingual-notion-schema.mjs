#!/usr/bin/env node
/**
 * Adds A/B and experiment columns to existing Barilingual Notion DBs (idempotent).
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const messagesDbId = process.env.NOTION_DB_MESSAGES_ID;
const runsDbId = process.env.NOTION_DB_RUNS_ID;

if (!token || !messagesDbId || !runsDbId) {
  console.error(
    "Missing env. Set NOTION_TOKEN, NOTION_DB_MESSAGES_ID, NOTION_DB_RUNS_ID",
  );
  process.exit(1);
}

const notionVersion = "2022-06-28";
const baseUrl = "https://api.notion.com/v1";

const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": notionVersion,
  "Content-Type": "application/json",
};

async function fetchDatabase(databaseId) {
  const res = await fetch(`${baseUrl}/databases/${databaseId}`, { headers });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`GET database ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function patchDatabase(databaseId, properties, label) {
  if (Object.keys(properties).length === 0) {
    console.log(`${label}: no new properties to add`);
    return;
  }
  const res = await fetch(`${baseUrl}/databases/${databaseId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ properties }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${label} PATCH ${res.status}: ${JSON.stringify(body)}`);
  }
  console.log(`${label}: added`, Object.keys(properties).join(", "));
}

const messagesMeta = await fetchDatabase(messagesDbId);
const messagesProps = messagesMeta.properties ?? {};
const messagesAdd = {};
if (!messagesProps.ab_variant) {
  messagesAdd.ab_variant = {
    select: {
      options: [
        { name: "all", color: "default" },
        { name: "A", color: "blue" },
        { name: "B", color: "purple" },
      ],
    },
  };
}
if (!messagesProps.variant_note) {
  messagesAdd.variant_note = { rich_text: {} };
}
await patchDatabase(messagesDbId, messagesAdd, "Messages");

const runsMeta = await fetchDatabase(runsDbId);
const runsProps = runsMeta.properties ?? {};
const runsAdd = {};
if (!runsProps.experiment_id) {
  runsAdd.experiment_id = { rich_text: {} };
}
if (!runsProps.cohort) {
  runsAdd.cohort = {
    select: {
      options: [
        { name: "A", color: "blue" },
        { name: "B", color: "purple" },
        { name: "all", color: "default" },
        { name: "n/a", color: "gray" },
      ],
    },
  };
}
if (!runsProps.metrics_note) {
  runsAdd.metrics_note = { rich_text: {} };
}
await patchDatabase(runsDbId, runsAdd, "Runs");

console.log("Schema patch finished.");
