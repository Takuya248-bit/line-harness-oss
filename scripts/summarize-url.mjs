#!/usr/bin/env node
/**
 * summarize-url.mjs — Gemini Flashでページを要約する
 *
 * Usage:
 *   node scripts/summarize-url.mjs <url> [maxChars]
 *
 * URLのページを取得し、Gemini 2.0 Flashで要約して標準出力に返す。
 * maxChars: 要約の最大文字数（デフォルト500）
 */
import process from "node:process";

// Groq API（無料）→ Gemini Flash（フォールバック）
const groqKey = process.env.GROQ_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!groqKey && !geminiKey) { console.error("Set GROQ_API_KEY or GEMINI_API_KEY"); process.exit(1); }

const [,, url, maxCharsArg] = process.argv;
if (!url) { console.error("Usage: summarize-url.mjs <url> [maxChars]"); process.exit(1); }

const maxChars = parseInt(maxCharsArg) || 500;

// --- 1. ページ取得 ---
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
}

// --- 2a. Groq API で要約（無料） ---
async function summarizeGroq(text, url) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{
        role: "user",
        content: `以下のWebページの内容を${maxChars}文字以内で要約してください。要点のみ箇条書きで。URL: ${url}\n\n${text}`,
      }],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`Groq error ${res.status}: ${e}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "(no output)";
}

// --- 2b. Gemini Flash フォールバック ---
async function summarizeGemini(text, url) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `以下のWebページの内容を${maxChars}文字以内で要約してください。要点のみ箇条書きで。URL: ${url}\n\n${text}` }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "(no output)";
}

// --- 要約実行（Groq優先、失敗時Gemini） ---
async function summarize(text, url) {
  if (groqKey) {
    try { return await summarizeGroq(text, url); } catch (e) {
      if (geminiKey) { console.error(`Groq failed, trying Gemini: ${e.message}`); }
      else throw e;
    }
  }
  return await summarizeGemini(text, url);
}

// --- 実行 ---
try {
  const text = await fetchPage(url);
  const summary = await summarize(text, url);
  console.log(summary);
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
