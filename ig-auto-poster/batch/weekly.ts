import { groqChat, groqJson } from "../src/groq";
import { collectAndStoreNeta } from "../src/pipeline/neta-collector";
import { selectBuzzFormat, buildPromptForPlan, buildPromptForV2Plan, buildPromptForV2PlanWithRealSpots, parseContentPlan } from "../src/pipeline/content-planner";
import { generateCarouselImages, selectDesign, DEFAULT_DESIGNS } from "../src/pipeline/media-generator";
import { buildCaptionPrompt, formatCaption } from "../src/pipeline/caption-writer";
import { buildScheduleDates } from "../src/pipeline/scheduler";
import { formatWeeklyReport } from "../src/ab-test/reporter";
import { detectBottleneck, determineTestAxis, assignTestGroups } from "../src/ab-test/manager";
import { d1Query, d1Execute } from "./d1-rest";
import { uploadToR2, deleteR2Prefix } from "./r2-upload";
import type { NetaEntry, ABTestMeta, WeeklyReport, ContentPlan } from "../src/pipeline/types";
import { buildV2Slides, type BaliContentV2 } from "../src/templates/index";
import { renderV2Slides } from "../src/pipeline/satori-renderer";
import { fetchSpotImages, fetchPexelsImage } from "../src/pipeline/image-fetcher";
import { collectSpots } from "../src/pipeline/spot-collector";

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
  const pexelsKey = optEnv("PEXELS_API_KEY");
  const foursquareKey = optEnv("FOURSQUARE_API_KEY");
  const useSatoriV2 = !!pexelsKey;

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

  // Step 1.5: スポット収集 (Foursquare)
  if (foursquareKey) {
    console.log("--- Step 1.5: スポット収集 ---");
    try {
      // real_spotsテーブルがなければ作成
      await d1Execute(cfAccountId, d1DbId, cfApiToken,
        `CREATE TABLE IF NOT EXISTS real_spots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          area TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'cafe',
          latitude REAL,
          longitude REAL,
          website TEXT,
          foursquare_id TEXT UNIQUE,
          price_level TEXT,
          description TEXT,
          used_count INTEGER DEFAULT 0,
          fetched_at TEXT DEFAULT (datetime('now')),
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      );
      const newSpots = await collectSpots(foursquareKey, cfAccountId, d1DbId, cfApiToken, "cafe", 50);
      console.log(`Collected ${newSpots} new spots from Foursquare`);
    } catch (e) {
      console.error("Spot collection failed (continuing):", e);
    }
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

    // 構成生成 & 画像生成
    let imageBuffers: Buffer[];

    if (useSatoriV2) {
      // V2: Satori + 写真背景 + 実在スポット
      const area = "バリ島";

      // A/Bテスト: 情報密度バリアント
      const infoStyles = ["simple", "rich", "practical"] as const;
      const infoStyle = infoStyles[i % infoStyles.length]!;

      // real_spotsから実在スポットを取得
      interface RealSpotRow { id: number; name: string; area: string; website: string | null }
      let realSpots: RealSpotRow[] = [];
      if (foursquareKey) {
        realSpots = await d1Query<RealSpotRow>(
          cfAccountId, d1DbId, cfApiToken,
          "SELECT id, name, area, website FROM real_spots WHERE category = ? ORDER BY used_count ASC, RANDOM() LIMIT 5",
          [category === "cafe" ? "cafe" : category],
        );
        // used_count更新
        for (const spot of realSpots) {
          await d1Execute(cfAccountId, d1DbId, cfApiToken,
            "UPDATE real_spots SET used_count = used_count + 1 WHERE id = ?",
            [spot.id],
          );
        }
      }

      // プロンプト生成: 実在スポットがあれば新プロンプト、なければ従来プロンプト
      interface V2PlanRaw {
        title: string;
        coverData: { catchCopy: string; mainTitle: string; countLabel: string };
        spotsData: { spotNumber: number; spotName: string; description: string; area?: string; priceLevel?: string; highlight?: string; hours?: string; recommendedMenu?: string }[];
        summaryData: { title: string; spots: { number: number; name: string; oneLiner: string }[] };
      }
      let v2Raw: V2PlanRaw;
      try {
        const v2Prompt = realSpots.length >= 3
          ? buildPromptForV2PlanWithRealSpots(category, area, realSpots, infoStyle, neta)
          : buildPromptForV2Plan(category, area, neta);
        v2Raw = await groqJson<V2PlanRaw>(
          groqKey,
          [{ role: "user", content: v2Prompt }],
          { temperature: 0.8, maxTokens: 2048 },
        );
      } catch (e) {
        console.error(`V2 plan generation failed for ${category}, falling back to V1:`, e);
        const prompt = buildPromptForPlan(formatName, category, neta);
        let plan: ContentPlan;
        try {
          const planJson = await groqJson<{ hook: string; slides: { heading: string; body: string; icon?: string; slideType: string }[]; ctaText: string }>(
            groqKey,
            [{ role: "user", content: prompt }],
            { temperature: 0.8, maxTokens: 2048 },
          );
          plan = parseContentPlan(JSON.stringify(planJson), "carousel", formatName, category, neta);
        } catch (e2) {
          console.error(`Plan generation failed for ${category}:`, e2);
          continue;
        }
        try {
          imageBuffers = await generateCarouselImages(plan, design);
        } catch (e2) {
          console.error(`Image generation failed for ${category}:`, e2);
          continue;
        }
        const captionPromptFb = buildCaptionPrompt(plan);
        let captionBodyFb: string;
        try {
          captionBodyFb = await groqChat(groqKey, [{ role: "user", content: captionPromptFb }], { temperature: 0.8, maxTokens: 512 });
        } catch (e2) {
          captionBodyFb = plan.hook;
        }
        const captionFb = formatCaption(plan.hook, captionBodyFb.trim(), plan.ctaText, category);
        await d1Execute(cfAccountId, d1DbId, cfApiToken,
          `INSERT INTO schedule_queue (content_type, content_json, caption, media_urls, scheduled_date, scheduled_time, status, ab_test_meta) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
          ["carousel", JSON.stringify({ slides: plan.slides }), captionFb, JSON.stringify([]), scheduleDates[i], "18:00", JSON.stringify(abMeta)],
        );
        previewLines.push(`${scheduleDates[i]}: ${plan.hook} (${formatName}/${category}) ${abMeta.isControl ? "[C]" : "[T]"} [V1-fb]`);
        console.log(`Post ${i + 1}/7 generated (V1 fallback): ${plan.hook}`);
        continue;
      }

      // Pexels画像取得（実在店名 + エリア名でフォールバック検索）
      const spotNames = v2Raw.spotsData.map((s) => s.spotName);
      const spotAreas = v2Raw.spotsData.map((s) => s.area ?? "");
      const spotImageUrls = await fetchSpotImages(area, category, spotNames, spotAreas);
      const coverImageUrl = await fetchPexelsImage(`${area} ${category} bali`);

      // A/Bテスト: デザインバリアント（写真統一 vs グラデ混在）
      const usePhotoForAll = !abMeta.isControl; // テスト群は写真統一
      const summaryImageUrl = usePhotoForAll ? await fetchPexelsImage(`bali ${category} overview`) : undefined;
      const ctaImageUrl = usePhotoForAll ? await fetchPexelsImage(`bali tropical beach`) : undefined;

      const v2Content: BaliContentV2 = {
        category,
        area,
        title: v2Raw.title,
        coverData: {
          imageUrl: coverImageUrl,
          catchCopy: v2Raw.coverData.catchCopy,
          mainTitle: v2Raw.coverData.mainTitle,
          countLabel: v2Raw.coverData.countLabel,
        },
        spotsData: v2Raw.spotsData.map((s, idx) => ({
          imageUrl: spotImageUrls[idx] ?? coverImageUrl,
          spotNumber: s.spotNumber,
          spotName: s.spotName,
          description: s.description,
          area: s.area,
          priceLevel: s.priceLevel,
          highlight: s.highlight,
          hours: s.hours,
          recommendedMenu: s.recommendedMenu,
          infoStyle,
        })),
        summaryData: {
          ...v2Raw.summaryData,
          imageUrl: summaryImageUrl,
        },
        caption: "",
        attributions: [],
        ctaImageUrl,
      };

      const v2Nodes = buildV2Slides(v2Content);
      try {
        imageBuffers = await renderV2Slides(v2Nodes);
      } catch (e) {
        console.error(`V2 render failed for ${category}:`, e);
        continue;
      }

      // R2残骸削除 + アップロード
      await deleteR2Prefix(cfAccountId, r2Bucket, cfApiToken, `v4/${week}/${i}/`);
      const mediaUrlsV2: string[] = [];
      for (let j = 0; j < imageBuffers.length; j++) {
        const key = `v4/${week}/${i}/slide-${j + 1}.png`;
        try {
          await uploadToR2(cfAccountId, r2Bucket, cfApiToken, key, imageBuffers[j]!, "image/png");
          mediaUrlsV2.push(`${r2PublicUrl}/${key}`);
        } catch (e) {
          console.error(`R2 upload failed for slide ${j}:`, e);
        }
      }

      if (mediaUrlsV2.length === 0) {
        console.error(`No images uploaded for post ${i}, skipping`);
        continue;
      }

      const captionV2 = formatCaption(v2Raw.title, v2Raw.summaryData.title, v2Raw.coverData.catchCopy, category);
      await d1Execute(cfAccountId, d1DbId, cfApiToken,
        `INSERT INTO schedule_queue (content_type, content_json, caption, media_urls, scheduled_date, scheduled_time, status, ab_test_meta) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        ["carousel", JSON.stringify({ slides: v2Content.spotsData }), captionV2, JSON.stringify(mediaUrlsV2), scheduleDates[i], "18:00", JSON.stringify(abMeta)],
      );
      previewLines.push(`${scheduleDates[i]}: ${v2Raw.title} (V2/${category}) ${abMeta.isControl ? "[C]" : "[T]"}`);
      console.log(`Post ${i + 1}/7 generated (V2): ${v2Raw.title}`);
      continue;
    }

    // V1パス（PEXELS_API_KEY未設定時）
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

    // 画像生成（sharp / V1）
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
