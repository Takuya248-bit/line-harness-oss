/**
 * Notion API 共通ヘルパー
 * 全スクリプトから import { notionFetch, queryAll, ... } from "./lib/notion-helpers.mjs" で使う
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;
export const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

/**
 * 認証ヘッダ+バージョン付き fetch ラッパー
 * @param {string} path  - "/v1/pages" などのパス（https://api.notion.com 以降）
 * @param {string} method - "GET" | "POST" | "PATCH"
 * @param {object|null} body - JSON シリアライズするボディ（不要なら null）
 * @returns {Promise<Response>}
 */
export function notionFetch(path, method = "GET", body = null) {
  const headers = {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
  return fetch(`https://api.notion.com${path}`, {
    method,
    headers,
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * ページネーション対応の全件取得
 * @param {string} databaseId
 * @param {object|null} filter  - Notion filter オブジェクト（省略可）
 * @param {object[]} sorts      - Notion sorts 配列（省略可）
 * @returns {Promise<object[]>}
 */
export async function queryAll(databaseId, filter = null, sorts = null) {
  const pages = [];
  let cursor;
  do {
    const reqBody = { page_size: 100 };
    if (cursor) reqBody.start_cursor = cursor;
    if (filter) reqBody.filter = filter;
    if (sorts) reqBody.sorts = sorts;
    const res = await notionFetch(`/v1/databases/${databaseId}/query`, "POST", reqBody);
    if (!res.ok) {
      const e = await res.json();
      console.error(`Query error ${res.status}: ${JSON.stringify(e)}`);
      process.exit(1);
    }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

/**
 * ページ作成
 * @param {string} databaseId
 * @param {object} properties
 * @returns {Promise<object>} 作成されたページオブジェクト
 */
export async function createPage(databaseId, properties) {
  const res = await notionFetch("/v1/pages", "POST", {
    parent: { database_id: databaseId },
    properties,
  });
  if (!res.ok) {
    const e = await res.json();
    console.error(`Create page error ${res.status}: ${JSON.stringify(e)}`);
    process.exit(1);
  }
  return res.json();
}

/**
 * ページ更新
 * @param {string} pageId
 * @param {object} properties
 * @returns {Promise<object>} 更新されたページオブジェクト
 */
export async function updatePage(pageId, properties) {
  const res = await notionFetch(`/v1/pages/${pageId}`, "PATCH", { properties });
  if (!res.ok) {
    const e = await res.json();
    console.error(`Update page error ${res.status}: ${JSON.stringify(e)}`);
    process.exit(1);
  }
  return res.json();
}

/**
 * ページ取得
 * @param {string} pageId
 * @returns {Promise<object>} ページオブジェクト
 */
export async function getPage(pageId) {
  const res = await notionFetch(`/v1/pages/${pageId}`);
  if (!res.ok) {
    const e = await res.json();
    console.error(`Get page error ${res.status}: ${JSON.stringify(e)}`);
    process.exit(1);
  }
  return res.json();
}

/**
 * Notion プロパティからテキスト値を取得
 * title / rich_text / select / multi_select / number / checkbox / url / date / created_time 対応
 * @param {object|null} prop
 * @returns {string}
 */
export function getText(prop) {
  if (!prop) return "";
  // type フィールドあり（fetch-barilingual-notion-csv 等）
  if (prop.type === "title") return (prop.title || []).map(t => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map(t => t.plain_text).join("");
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "multi_select") return (prop.multi_select || []).map(s => s.name).join(",");
  if (prop.type === "number") return prop.number != null ? String(prop.number) : "";
  if (prop.type === "checkbox") return String(prop.checkbox);
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "date") return prop.date?.start || "";
  if (prop.type === "created_time") return prop.created_time || "";
  // type フィールドなし（suggest-content 等の旧形式）
  if (prop.title) return prop.title.map(t => t.plain_text).join("");
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join("");
  if (prop.select) return prop.select?.name ?? "";
  if (prop.multi_select) return (prop.multi_select || []).map(s => s.name).join(",");
  return "";
}

/**
 * CSV 用エスケープ
 * @param {*} val
 * @returns {string}
 */
export function escapeCsv(val) {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 行配列 → CSV 文字列
 * @param {object[]} rows
 * @param {string[]} columns
 * @returns {string}
 */
export function toCsv(rows, columns) {
  const header = columns.join(",");
  const lines = rows.map(row => columns.map(c => escapeCsv(row[c] ?? "")).join(","));
  return header + "\n" + lines.join("\n") + "\n";
}
