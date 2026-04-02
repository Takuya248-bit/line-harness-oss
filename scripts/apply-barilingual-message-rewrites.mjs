#!/usr/bin/env node
/**
 * クラウド LLM が返した JSON を messages.csv にマージする。
 *
 * 入力 JSON は次のいずれか:
 *   - { "schema_version": 1, "rewrites": [ { "message_id", "content", ... } ] }
 *   - [ { "message_id", ... }, ... ]
 *
 * Usage:
 *   node scripts/apply-barilingual-message-rewrites.mjs messages.csv rewrites.json messages.patched.csv
 *   node scripts/apply-barilingual-message-rewrites.mjs --dry-run messages.csv rewrites.json
 */
import fs from "node:fs";
import path from "node:path";

function parseCsv(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  if (!src.trim()) return { headers: [], rows: [] };
  const raw = [];
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
      if (row.length > 1 || row[0] !== "") raw.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur);
    raw.push(row);
  }
  const [headers, ...bodyRows] = raw;
  const rows = bodyRows.map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });
  return { headers, rows };
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
const pos = dryRun ? args.slice(1) : args;
const [messagesCsv, rewritesJson, outCsv] = pos;

if (!messagesCsv || !rewritesJson || (!dryRun && !outCsv)) {
  console.error(
    "Usage: node scripts/apply-barilingual-message-rewrites.mjs [--dry-run] messages.csv rewrites.json out.csv",
  );
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rewritesJson, "utf8"));
const list = Array.isArray(raw) ? raw : raw.rewrites;
if (!Array.isArray(list)) {
  console.error("JSON must be an array or { rewrites: array }");
  process.exit(1);
}

const { headers, rows } = parseCsv(messagesCsv);
if (!headers.length) {
  console.error("Empty or invalid CSV");
  process.exit(1);
}

const byId = new Map(rows.map((r) => [r.message_id, r]));
const allowed = new Set([
  "content",
  "cta_label",
  "cta_action",
  "variant_note",
  "ab_variant",
]);

let applied = 0;
const unknown = [];
for (const patch of list) {
  const id = patch.message_id;
  if (!id) {
    console.warn("Skip: missing message_id", patch);
    continue;
  }
  const row = byId.get(id);
  if (!row) {
    unknown.push(id);
    continue;
  }
  for (const k of Object.keys(patch)) {
    if (k === "message_id" || k === "rewrite_notes" || k === "changed_fields")
      continue;
    if (!allowed.has(k)) {
      console.warn(`Ignore unknown field on ${id}: ${k}`);
      continue;
    }
    if (patch[k] !== undefined) row[k] = String(patch[k]);
  }
  const mt = (row.message_type ?? "").toLowerCase();
  if (mt === "cta") row.cta_label = row.content;
  applied++;
}

if (unknown.length) {
  console.warn(`Unknown message_id (${unknown.length}):`, unknown.slice(0, 20));
}

console.error(`Patched rows: ${applied} / rewrites in file: ${list.length}`);

if (dryRun) {
  process.exit(unknown.length ? 2 : 0);
}

fs.mkdirSync(path.dirname(path.resolve(outCsv)), { recursive: true });
fs.writeFileSync(outCsv, toCsv(headers, rows), "utf8");
console.error(`Wrote ${outCsv}`);
