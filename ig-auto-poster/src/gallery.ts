interface GalleryItem {
  id: number;
  category: string | null;
  content_json: string;
  caption: string;
  status: string;
  created_at: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** GET /gallery - コンテンツ一覧 */
export async function renderGalleryList(db: D1Database, filter?: string): Promise<string> {
  const where = filter ? `WHERE status = '${filter}'` : "";
  const rows = await db
    .prepare(`SELECT id, category, content_json, caption, status, created_at FROM generated_content ${where} ORDER BY id DESC LIMIT 50`)
    .all<GalleryItem>();

  const items = rows.results.map((row) => {
    const parsed = JSON.parse(row.content_json);
    const title = parsed.title ?? parsed.coverData?.catchCopy ?? "Untitled";
    const statusBadge: Record<string, string> = {
      pending_images: "⏳ 画像生成中",
      pending_review: "🟡 レビュー待ち",
      approved: "🟢 承認済み",
      posted: "✅ 投稿済み",
      skipped: "⏭ スキップ",
      rejected: "❌ 却下",
    };
    return `<div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:8px 0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${escapeHtml(String(title))}</strong>
        <span>${statusBadge[row.status] ?? row.status}</span>
      </div>
      <div style="color:#666;font-size:14px;margin-top:4px">
        ${row.category ? `カテゴリ: ${escapeHtml(row.category)} | ` : ""}${escapeHtml(row.created_at)}
      </div>
      <div style="margin-top:8px">
        <a href="/gallery/${row.id}" style="color:#E67E22">プレビュー →</a>
        ${row.status === "pending_review" ? `
          <form method="POST" action="/gallery/${row.id}/approve" style="display:inline;margin-left:16px">
            <button type="submit" style="background:#4CAF50;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer">承認</button>
          </form>
          <form method="POST" action="/gallery/${row.id}/skip" style="display:inline;margin-left:8px">
            <button type="submit" style="background:#999;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer">スキップ</button>
          </form>
        ` : ""}
      </div>
    </div>`;
  }).join("");

  const filterLinks = ["all", "pending_images", "pending_review", "approved", "posted", "skipped"]
    .map((f) => `<a href="/gallery${f === "all" ? "" : `?filter=${f}`}" style="margin-right:12px;${filter === f || (!filter && f === "all") ? "font-weight:bold" : ""}">${f}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IG Gallery</title>
<style>body{font-family:sans-serif;max-width:600px;margin:0 auto;padding:16px}a{color:#E67E22;text-decoration:none}</style>
</head><body>
<h1>IG Auto Poster Gallery</h1>
<div style="margin-bottom:16px">${filterLinks}</div>
${items || "<p>コンテンツがありません</p>"}
</body></html>`;
}

/** GET /gallery/:id - 詳細プレビュー（カバー画像URL付き） */
export async function renderGalleryDetail(db: D1Database, id: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT id, category, content_json, caption, status, created_at FROM generated_content WHERE id = ?")
    .bind(id)
    .first<GalleryItem>();

  if (!row) return null;

  const parsed = JSON.parse(row.content_json);
  const title = parsed.title ?? "Untitled";
  const coverUrl = parsed.coverUrl ?? "";
  const slideUrls: string[] = Array.isArray(parsed.slideUrls) ? parsed.slideUrls : [];

  const allSlideUrls: string[] = parsed.slideUrls ?? [];
  const slidesHtml = `<h2>スライドプレビュー</h2>
${allSlideUrls.length > 0
    ? allSlideUrls.map((url: string, i: number) => `<div style="margin:8px 0"><p style="color:#666;font-size:14px">Slide ${i + 1}</p><img src="${escapeHtml(url)}" style="max-width:100%;border-radius:8px"></div>`).join("")
    : `<p style="color:#999">⏳ 画像生成待ち... GitHub Actionsで自動生成されます</p>`
  }`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(String(title))}</title>
<style>body{font-family:sans-serif;max-width:600px;margin:0 auto;padding:16px}img{max-width:100%;border-radius:8px}a{color:#E67E22;text-decoration:none}</style>
</head><body>
<a href="/gallery">← 一覧に戻る</a>
<h1>${escapeHtml(String(title))}</h1>
<p>カテゴリ: ${escapeHtml(row.category ?? "N/A")} | ステータス: ${escapeHtml(row.status)}</p>
${slidesHtml}
<h2>キャプション</h2>
<pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px">${escapeHtml(row.caption)}</pre>
${row.status === "pending_review" ? `
<div style="margin-top:16px;display:flex;gap:8px">
  <form method="POST" action="/gallery/${row.id}/approve">
    <button type="submit" style="background:#4CAF50;color:#fff;border:none;padding:12px 32px;border-radius:8px;cursor:pointer;font-size:16px">承認する</button>
  </form>
  <form method="POST" action="/gallery/${row.id}/skip">
    <button type="submit" style="background:#999;color:#fff;border:none;padding:12px 32px;border-radius:8px;cursor:pointer;font-size:16px">スキップ</button>
  </form>
</div>
` : ""}
<h2>Raw JSON</h2>
<details><summary>展開</summary>
<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>
</details>
</body></html>`;
}
