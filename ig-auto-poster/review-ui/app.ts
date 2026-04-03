/**
 * R2オブジェクトの公開URLプレフィックス（image_r2_key / video_r2_key と結合）
 * TODO: 実際のR2公開URLに変更（wrangler のカスタムドメイン or public bucket URL）
 */
const R2_PUBLIC_BASE = "https://TODO-R2-public-base.example.com";

interface QueueItem {
  id: number;
  caption: string;
  hashtags: string | null;
  pattern_id: string | null;
  content_type: string | null;
  image_r2_key: string | null;
  video_r2_key: string | null;
  status: string;
  created_at: string;
}

function mediaUrl(key: string | null): string | null {
  if (!key || !key.trim()) return null;
  const base = R2_PUBLIC_BASE.replace(/\/$/, "");
  const path = key.replace(/^\//, "");
  return `${base}/${path}`;
}

const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");

function setStatus(msg: string) {
  if (statusEl) statusEl.textContent = msg;
}

function removeCard(id: number) {
  document.getElementById(`card-${id}`)?.remove();
}

async function postReview(id: number, status: "approved" | "rejected" | "rejected_human") {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

function renderItem(item: QueueItem) {
  if (!listEl) return;
  const article = document.createElement("article");
  article.className = "card";
  article.id = `card-${item.id}`;

  const mediaWrap = document.createElement("div");
  mediaWrap.className = "media";

  const videoUrl = mediaUrl(item.video_r2_key);
  const imageUrl = mediaUrl(item.image_r2_key);

  if (videoUrl) {
    const v = document.createElement("video");
    v.src = videoUrl;
    v.controls = true;
    v.playsInline = true;
    v.muted = true;
    mediaWrap.appendChild(v);
  } else if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.loading = "lazy";
    mediaWrap.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "media-placeholder";
    placeholder.textContent = "メディアなし";
    mediaWrap.appendChild(placeholder);
  }

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = item.status;

  const cap = document.createElement("p");
  cap.className = "caption";
  cap.textContent = item.caption;

  const tags = document.createElement("p");
  tags.className = "hashtags";
  tags.textContent = item.hashtags?.trim() ? item.hashtags : "（ハッシュタグなし）";

  const pid = document.createElement("p");
  pid.className = "meta";
  pid.textContent = `pattern_id: ${item.pattern_id ?? "—"}`;

  const actions = document.createElement("div");
  actions.className = "actions";

  const mkBtn = (
    label: string,
    cls: string,
    status: "approved" | "rejected" | "rejected_human",
  ) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn ${cls}`;
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await postReview(item.id, status);
        removeCard(item.id);
      } catch (e) {
        btn.disabled = false;
        const err = e instanceof Error ? e.message : String(e);
        setStatus(`エラー id=${item.id}: ${err}`);
      }
    });
    return btn;
  };

  // 採用=緑 / 非採用=赤 / 保留=灰
  // TODO: 保留は API 上 rejected_human。専用ステータスが欲しければ review 受付を拡張する
  actions.appendChild(mkBtn("採用", "btn-approve", "approved"));
  actions.appendChild(mkBtn("非採用", "btn-reject", "rejected"));
  actions.appendChild(mkBtn("保留", "btn-hold", "rejected_human"));

  article.appendChild(mediaWrap);
  article.appendChild(badge);
  article.appendChild(cap);
  article.appendChild(tags);
  article.appendChild(pid);
  article.appendChild(actions);
  listEl.appendChild(article);
}

async function load() {
  setStatus("読み込み中…");
  if (!listEl) return;
  listEl.innerHTML = "";
  const res = await fetch("/api/pending");
  const data = (await res.json()) as { items?: QueueItem[] };
  if (!res.ok) {
    setStatus("一覧の取得に失敗しました");
    return;
  }
  const items = data.items ?? [];
  if (!items.length) {
    setStatus("対象はありません");
    return;
  }
  setStatus(`${items.length} 件`);
  for (const item of items) renderItem(item);
}

load().catch((e) => setStatus(`初期化エラー: ${e instanceof Error ? e.message : String(e)}`));
