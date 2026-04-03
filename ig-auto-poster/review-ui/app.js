// app.ts
var R2_PUBLIC_BASE = "https://TODO-R2-public-base.example.com";
function mediaUrl(key) {
  if (!key || !key.trim())
    return null;
  const base = R2_PUBLIC_BASE.replace(/\/$/, "");
  const path = key.replace(/^\//, "");
  return `${base}/${path}`;
}
var listEl = document.getElementById("list");
var statusEl = document.getElementById("status");
function setStatus(msg) {
  if (statusEl)
    statusEl.textContent = msg;
}
function removeCard(id) {
  document.getElementById(`card-${id}`)?.remove();
}
async function postReview(id, status) {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `http_${res.status}`);
  }
}
function renderItem(item) {
  if (!listEl)
    return;
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
    placeholder.textContent = "\u30E1\u30C7\u30A3\u30A2\u306A\u3057";
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
  tags.textContent = item.hashtags?.trim() ? item.hashtags : "\uFF08\u30CF\u30C3\u30B7\u30E5\u30BF\u30B0\u306A\u3057\uFF09";
  const pid = document.createElement("p");
  pid.className = "meta";
  pid.textContent = `pattern_id: ${item.pattern_id ?? "\u2014"}`;
  const actions = document.createElement("div");
  actions.className = "actions";
  const mkBtn = (label, cls, status) => {
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
        setStatus(`\u30A8\u30E9\u30FC id=${item.id}: ${err}`);
      }
    });
    return btn;
  };
  actions.appendChild(mkBtn("\u63A1\u7528", "btn-approve", "approved"));
  actions.appendChild(mkBtn("\u975E\u63A1\u7528", "btn-reject", "rejected"));
  actions.appendChild(mkBtn("\u4FDD\u7559", "btn-hold", "rejected_human"));
  article.appendChild(mediaWrap);
  article.appendChild(badge);
  article.appendChild(cap);
  article.appendChild(tags);
  article.appendChild(pid);
  article.appendChild(actions);
  listEl.appendChild(article);
}
async function load() {
  setStatus("\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026");
  if (!listEl)
    return;
  listEl.innerHTML = "";
  const res = await fetch("/api/pending");
  const data = await res.json();
  if (!res.ok) {
    setStatus("\u4E00\u89A7\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    return;
  }
  const items = data.items ?? [];
  if (!items.length) {
    setStatus("\u5BFE\u8C61\u306F\u3042\u308A\u307E\u305B\u3093");
    return;
  }
  setStatus(`${items.length} \u4EF6`);
  for (const item of items)
    renderItem(item);
}
load().catch((e) => setStatus(`\u521D\u671F\u5316\u30A8\u30E9\u30FC: ${e instanceof Error ? e.message : String(e)}`));
