import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractFacts, insertKnowledge } from "./extract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchlist = JSON.parse(fs.readFileSync(path.join(__dirname, "watchlist.json"), "utf-8"));

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KnowledgeCollector/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.log(`[fetch] ${url} → ${response.status}`);
      return null;
    }
    const html = await response.text();
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
               .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
               .replace(/<[^>]+>/g, " ")
               .replace(/\s+/g, " ")
               .trim();
  } catch (err) {
    console.log(`[fetch] ${url} → ${err.message}`);
    return null;
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  console.log(`[collect] ${watchlist.length} URLs to process`);
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const item of watchlist) {
    console.log(`[collect] ${item.url}`);
    const content = await fetchPage(item.url);
    if (!content) {
      console.log(`[collect] → スキップ（取得失敗）`);
      totalSkipped++;
      continue;
    }

    const facts = await extractFacts(content, item.extract);
    if (facts.length === 0) {
      console.log(`[collect] → 新規情報なし`);
      continue;
    }

    for (const fact of facts) {
      const ok = await insertKnowledge(fact, item.category, item.subcategory, item.url);
      if (ok) {
        console.log(`[collect] → 追加: ${fact.title}`);
        totalInserted++;
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[collect] 完了: ${totalInserted}件追加, ${totalSkipped}件スキップ`);
}

main().catch(console.error);
