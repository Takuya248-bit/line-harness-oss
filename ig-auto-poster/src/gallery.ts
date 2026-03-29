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

  const filterLinks = ["all", "pending_review", "approved", "posted", "skipped"]
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

  const slidesHtml = slideUrls.length > 0
    ? `<h2>全スライド (${slideUrls.length}枚)</h2>
<div style="display:flex;flex-direction:column;gap:12px">
${slideUrls.map((u: string, i: number) => `<div><p style="margin:0 0 4px;font-size:13px;color:#666">スライド ${i + 1}</p><img src="${escapeHtml(u)}" alt="slide ${i + 1}" style="max-width:100%;border-radius:8px"></div>`).join("\n")}
</div>`
    : `${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="cover">` : ""}
<div style="margin-top:12px">
  <button id="genBtn" onclick="generateSlides(${row.id})" style="background:#E67E22;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:15px">全スライド生成</button>
  <span id="genStatus" style="margin-left:12px;color:#666"></span>
</div>
<script>
async function generateSlides(id) {
  const btn = document.getElementById('genBtn');
  const status = document.getElementById('genStatus');
  btn.disabled = true;
  status.textContent = '生成中...';
  try {
    const res = await fetch('/gallery/' + id + '/preview-all', { method: 'POST' });
    const data = await res.json();
    if (data.slideUrls) {
      status.textContent = '完了！リロードします...';
      setTimeout(() => location.reload(), 1000);
    } else {
      status.textContent = 'エラー: ' + (data.error || '不明');
      btn.disabled = false;
    }
  } catch(e) {
    status.textContent = 'エラー: ' + e.message;
    btn.disabled = false;
  }
}
</script>`;

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
