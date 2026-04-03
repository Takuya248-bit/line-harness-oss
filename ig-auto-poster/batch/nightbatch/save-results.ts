import { randomUUID } from "node:crypto";
import { d1Query } from "../d1-rest.js";
import { uploadToR2 } from "../r2-upload.js";
import type { ContentType, GeneratedText, NightbatchConfig, Pattern } from "./types.js";

interface InsertReturningRow {
  id: number;
}

/** Persist buffers to R2 and insert approved_auto row into generated_content. Returns D1 row id as string. */
export async function saveResult(
  topicId: string,
  pattern: Pattern,
  contentType: ContentType,
  text: GeneratedText,
  imageBuffer: Buffer | null,
  videoBuffer: Buffer | null,
  config: NightbatchConfig,
): Promise<string> {
  const pathId = randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const prefix = `nightbatch/${date}/${pathId}`;

  const { cfAccountId, cfApiToken, d1DatabaseId, r2BucketName } = config;

  let imageR2Key: string | null = null;
  let videoR2Key: string | null = null;

  if (imageBuffer !== null && imageBuffer.length > 0) {
    imageR2Key = await uploadToR2(
      cfAccountId,
      r2BucketName,
      cfApiToken,
      `${prefix}/feed.png`,
      imageBuffer,
      "image/png",
    );
  }

  if (videoBuffer !== null && videoBuffer.length > 0) {
    videoR2Key = await uploadToR2(
      cfAccountId,
      r2BucketName,
      cfApiToken,
      `${prefix}/reel.mp4`,
      videoBuffer,
      "video/mp4",
    );
  }

  const rows = await d1Query<InsertReturningRow>(
    cfAccountId,
    d1DatabaseId,
    cfApiToken,
    `INSERT INTO generated_content (
      template_type,
      topic_id,
      pattern_id,
      content_type,
      caption,
      script,
      hashtags,
      image_r2_key,
      video_r2_key,
      status,
      created_at,
      content_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved_auto', datetime('now'), '{}')
    RETURNING id`,
    [
      "nightbatch",
      topicId,
      pattern.patternId,
      contentType,
      text.caption,
      text.script,
      text.hashtags,
      imageR2Key,
      videoR2Key,
    ],
  );

  const row = rows[0];
  if (row === undefined) throw new Error("D1 INSERT returned no row");
  return String(row.id);
}
