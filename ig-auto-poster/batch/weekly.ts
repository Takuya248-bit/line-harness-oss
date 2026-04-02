import { groqChat, groqJson } from "../src/groq";
import { collectAndStoreNeta } from "../src/pipeline/neta-collector";
import { selectBuzzFormat, buildPromptForPlan, parseContentPlan } from "../src/pipeline/content-planner";
import { generateCarouselImages, selectDesign, DEFAULT_DESIGNS } from "../src/pipeline/media-generator";
import { buildCaptionPrompt, formatCaption } from "../src/pipeline/caption-writer";
import { buildScheduleDates } from "../src/pipeline/scheduler";
import { formatWeeklyReport } from "../src/ab-test/reporter";
import { detectBottleneck, determineTestAxis, assignTestGroups } from "../src/ab-test/manager";
import { d1Query, d1Execute } from "./d1-rest";
import { uploadToR2 } from "./r2-upload";
import type { NetaEntry, ABTestMeta, WeeklyReport, ContentPlan } from "../src/pipeline/types";

const env = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
};

const optEnv = (key: string): string => process.env[key] ?? "";

async function sendLineNotification(text: string, userId: string, token: string): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }],
    }),
  });
}

async function getWeekString(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

async function main() {
  const groqKey = env("GROQ_API_KEY");
  const notionKey = env("NOTION_API_KEY");
  const notionKnowledgeDb = env("NOTION_KNOWLEDGE_DB_ID");
  const lineToken = env("LINE_CHANNEL_ACCESS_TOKEN");
  const lineUserId = env("LINE_OWNER_USER_ID");
  const cfApiToken = env("CF_API_TOKEN");
  const cfAccountId = env("CF_ACCOUNT_ID");
  const d1DbId = env("D1_DATABASE_ID");
  const r2Bucket = env("R2_BUCKET_NAME");
  const r2PublicUrl = env("R2_PUBLIC_URL");
  const igToken = env("IG_ACCESS_TOKEN");
  const igAccountId = env("IG_BUSINESS_ACCOUNT_ID");

  const week = await getWeekString();
  console.log(`=== Weekly Batch ${week} ===`);

  // Step 1: ネタ収集
  console.log("--- Step 1: ネタ収集 ---");
  const rssFeeds = [
    "https://www.bali.com/feed",
  ];
  try {
    const newNeta = await collectAndStoreNeta(groqKey, notionKey, notionKnowledgeDb, rssFeeds);
    console.log(`Collected ${newNeta.length} new neta entries`);
  } catch (e) {
    console.error("Neta collection failed (continuing):", e);
  }

  // Step 2: 週次レポート
  console.log("--- Step 2: 週次レポート ---");
  const prevWeekNum = parseInt(week.split("-W")[1]!) - 1;
  const prevWeek = `${week.split("-W")[0]}-W${String(prevWeekNum).padStart(2, "0")}`;

  const kpiRows = await d1Query<{ total_reach: number; avg_save_rate: number; avg_share_rate: number; profile_visits: number; line_registrations: number; bottleneck: string }>(
    cfAccountId, d1DbId, cfApiToken,
    "SELECT * FROM weekly_kpi WHERE week = ? LIMIT 1",
    [prevWeek],
  );

  let bottleneck: "awareness" | "evaluation" | "interest" | "action" = "evaluation";
  let currentWinnerDesign = "white_clean";

  if (kpiRows.length > 0) {
    const kpi = kpiRows[0]!;
    bottleneck = (kpi.bottleneck as typeof bottleneck) || "evaluation";
    const report: WeeklyReport = {
      week: prevWeek,
      lineRegistrations: kpi.line_registrations,
      totalReach: kpi.total_reach,
      avgSaveRate: kpi.avg_save_rate,
      avgShareRate: kpi.avg_share_rate,
      profileVisits: kpi.profile_visits,
      bottleneck,
      abTestResult: null,
      nextTestAxis: determineTestAxis(bottleneck),
      nextTestVariant: "auto",
    };
    const reportText = formatWeeklyReport(report);
    await sendLineNotification(reportText, lineUserId, lineToken);
    console.log("Weekly report sent");
  } else {
    console.log("No previous week data, skipping report");
  }

  // Step 3: A/Bテスト設定
  console.log("--- Step 3: A/Bテスト設定 ---");
  const testAxis = determineTestAxis(bottleneck);

  const winnerRows = await d1Query<{ variant_value: string }>(
    cfAccountId, d1DbId, cfApiToken,
    "SELECT variant_value FROM winning_patterns WHERE axis = 'design' ORDER BY id DESC LIMIT 1",
  );
  if (winnerRows.length > 0) currentWinnerDesign = winnerRows[0]!.variant_value;

  let testVariant = currentWinnerDesign === "white_clean" ? "dark_modern" : "white_clean";
  if (testAxis === "design") {
    const alternatives = DEFAULT_DESIGNS.filter((d) => d.name !== currentWinnerDesign);
    testVariant = alternatives[0]?.name ?? "dark_modern";
  }

  const testGroups = assignTestGroups(7, week, testAxis, testVariant, currentWinnerDesign);

  await d1Execute(cfAccountId, d1DbId, cfApiToken,
    "INSERT INTO ab_tests (test_week, test_axis, test_variant, control_variant) VALUES (?, ?, ?, ?)",
    [week, testAxis, testVariant, currentWinnerDesign],
  );
  console.log(`A/B test created: ${testAxis} - ${testVariant} vs ${currentWinnerDesign}`);

  // Step 4: 7投稿生成
  console.log("--- Step 4: 7投稿バッチ生成 ---");
  const categories = ["cafe", "spot", "food", "beach", "lifestyle", "cost", "culture"];
  const formats = [
    { name: "知ってた系", weight: 3 },
    { name: "ランキング系", weight: 2 },
    { name: "あるある系", weight: 2 },
    { name: "vs比較系", weight: 1 },
    { name: "衝撃事実系", weight: 1 },
    { name: "文化差分系", weight: 1 },
  ];

  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);
  const startDate = monday.toISOString().split("T")[0]!;
  const scheduleDates = buildScheduleDates(startDate, 7);
  const previewLines: string[] = [];

  for (let i = 0; i < 7; i++) {
    const category = categories[i % categories.length]!;
    const formatName = selectBuzzFormat(formats);
    const abMeta = testGroups[i]!;
    const designName = abMeta.isControl ? currentWinnerDesign : testVariant;
    const design = selectDesign(designName);

    // Notion知識DBからネタ取得
    const netaRows = await d1Query<{ id: number; title: string; content: string; category: string; tags: string }>(
      cfAccountId, d1DbId, cfApiToken,
      "SELECT id, title, content, category, COALESCE(tags, '') as tags FROM knowledge_entries WHERE category = ? ORDER BY RANDOM() LIMIT 5",
      [category],
    );

    const neta: NetaEntry[] = netaRows.map((r) => ({
      id: String(r.id),
      title: r.title,
      content: r.content,
      category: r.category,
      tags: r.tags ? r.tags.split(",") : [],
      reliability: "verified" as const,
      source: "d1",
    }));

    if (neta.length === 0) {
      console.log(`No neta for category ${category}, using fallback`);
      neta.push({
        id: "fallback",
        title: `バリ島${category}情報`,
        content: `バリ島の${category}に関する最新情報`,
        category,
        tags: [],
        reliability: "unverified",
        source: "fallback",
      });
    }

    // 構成生成（Groq）
    const prompt = buildPromptForPlan(formatName, category, neta);
    let plan: ContentPlan;
    try {
      const planJson = await groqJson<{ hook: string; slides: { heading: string; body: string; icon?: string; slideType: string }[]; ctaText: string }>(
        groqKey,
        [{ role: "user", content: prompt }],
        { temperature: 0.8, maxTokens: 2048 },
      );
      plan = parseContentPlan(JSON.stringify(planJson), "carousel", formatName, category, neta);
    } catch (e) {
      console.error(`Plan generation failed for ${category}:`, e);
      continue;
    }

    // 画像生成（sharp）
    let imageBuffers: Buffer[];
    try {
      imageBuffers = await generateCarouselImages(plan, design);
    } catch (e) {
      console.error(`Image generation failed for ${category}:`, e);
      continue;
    }

    // R2アップロード
    const mediaUrls: string[] = [];
    for (let j = 0; j < imageBuffers.length; j++) {
      const key = `v4/${week}/${i}/slide-${j + 1}.png`;
      try {
        await uploadToR2(cfAccountId, r2Bucket, cfApiToken, key, imageBuffers[j]!, "image/png");
        mediaUrls.push(`${r2PublicUrl}/${key}`);
      } catch (e) {
        console.error(`R2 upload failed for slide ${j}:`, e);
      }
    }

    if (mediaUrls.length === 0) {
      console.error(`No images uploaded for post ${i}, skipping`);
      continue;
    }

    // キャプション生成（Groq）
    const captionPrompt = buildCaptionPrompt(plan);
    let captionBody: string;
    try {
      captionBody = await groqChat(groqKey, [{ role: "user", content: captionPrompt }], { temperature: 0.8, maxTokens: 512 });
    } catch (e) {
      console.error(`Caption generation failed:`, e);
      captionBody = plan.hook;
    }
    const caption = formatCaption(plan.hook, captionBody.trim(), plan.ctaText, category);

    // D1にスケジュール登録
    await d1Execute(cfAccountId, d1DbId, cfApiToken,
      `INSERT INTO schedule_queue (content_type, content_json, caption, media_urls, scheduled_date, scheduled_time, status, ab_test_meta) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ["carousel", JSON.stringify({ slides: plan.slides }), caption, JSON.stringify(mediaUrls), scheduleDates[i], "18:00", JSON.stringify(abMeta)],
    );

    previewLines.push(`${scheduleDates[i]}: ${plan.hook} (${formatName}/${category}) ${abMeta.isControl ? "[C]" : "[T]"}`);
    console.log(`Post ${i + 1}/7 generated: ${plan.hook}`);
  }

  // Step 5: LINE通知
  console.log("--- Step 5: LINE通知 ---");
  const previewText = `今週の投稿プレビュー (${week})\n\n${previewLines.join("\n")}\n\n承認する場合は「承認」と返信してください`;
  await sendLineNotification(previewText, lineUserId, lineToken);

  console.log("=== Weekly batch complete ===");
}

main().catch((e) => {
  console.error("Batch failed:", e);
  process.exit(1);
});
