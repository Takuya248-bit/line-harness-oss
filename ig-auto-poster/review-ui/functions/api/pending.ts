type Env = { DB: D1Database };

type Row = {
  id: number;
  caption: string;
  hashtags: string | null;
  pattern_id: string | null;
  content_type: string | null;
  image_r2_key: string | null;
  video_r2_key: string | null;
  status: string;
  created_at: string;
};

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  const res = await env.DB.prepare(
    `SELECT id, caption, hashtags, pattern_id, content_type, image_r2_key, video_r2_key, status, created_at
     FROM generated_content
     WHERE status IN ('pending_review', 'approved_auto')
     ORDER BY id DESC
     LIMIT 50`,
  ).all<Row>();

  return Response.json({ items: res.results ?? [] });
}
