#!/usr/bin/env node
/**
 * Notion議事録DBを作成する (初回のみ)
 * 作成後、NOTION_DB_MEETINGS_ID を ~/.zshrc に追加する
 *
 * Env: NOTION_TOKEN, NOTION_PARENT_PAGE_ID
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
if (!token || !parentPageId) {
  console.error("NOTION_TOKEN と NOTION_PARENT_PAGE_ID を設定してください");
  console.error("NOTION_PARENT_PAGE_ID = DBを作成する親ページのID");
  process.exit(1);
}

const res = await fetch("https://api.notion.com/v1/databases", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ text: { content: "議事録" } }],
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      Tags: { multi_select: {} },
    },
  }),
});

if (!res.ok) {
  const err = await res.json();
  console.error(`Error ${res.status}: ${JSON.stringify(err)}`);
  process.exit(1);
}

const db = await res.json();
console.log(`議事録DB作成完了`);
console.log(`  DB ID: ${db.id}`);
console.log(`  URL: ${db.url}`);
console.log(``);
console.log(`以下を ~/.zshrc に追加:`);
console.log(`  export NOTION_DB_MEETINGS_ID="${db.id}"`);
