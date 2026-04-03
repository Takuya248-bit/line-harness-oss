from __future__ import annotations

import os
import tempfile
import logging
import hashlib
import threading

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from linebot.v3 import WebhookParser
from linebot.v3.messaging import (
    ApiClient, Configuration, MessagingApi, MessagingApiBlob,
    ReplyMessageRequest, TextMessage, PushMessageRequest,
)
from linebot.v3.webhooks import (
    MessageEvent, TextMessageContent, VideoMessageContent, AudioMessageContent,
)

from pipeline.run_pipeline import run_pipeline, rerender
from session import SessionManager
from adjust import parse_adjustment, apply_operations
from sfx_manager import list_all_sfx, add_sfx, resolve_category
from learning import LearningStore
from conversation_log import ConversationLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

CHANNEL_SECRET = os.environ["LINE_CHANNEL_SECRET"]
CHANNEL_TOKEN = os.environ["LINE_CHANNEL_ACCESS_TOKEN"]
SFX_DIR = os.environ.get("SFX_DIR", "/data/sfx")
SESSIONS_DIR = os.environ.get("SESSIONS_DIR", "/tmp/sessions")

parser = WebhookParser(CHANNEL_SECRET)
config = Configuration(access_token=CHANNEL_TOKEN)
LEARNING_DIR = os.environ.get("LEARNING_DIR", "/tmp/learning")

sessions = SessionManager(SESSIONS_DIR)
learning = LearningStore(LEARNING_DIR)
CONV_LOG_DIR = os.environ.get("CONV_LOG_DIR", os.path.join(os.path.dirname(__file__), "data", "conversations"))
conv_log = ConversationLog(CONV_LOG_DIR)
user_states: dict[str, dict] = {}


def get_api() -> MessagingApi:
    return MessagingApi(ApiClient(config))


def get_blob_api() -> MessagingApiBlob:
    return MessagingApiBlob(ApiClient(config))


def push_text(user_id: str, text: str):
    api = get_api()
    api.push_message(PushMessageRequest(to=user_id, messages=[TextMessage(text=text)]))


def format_timeline(timeline: list[dict]) -> str:
    lines = []
    for entry in timeline:
        ts = entry["timestamp"]
        name = os.path.basename(entry["sfx"]).replace(".wav", "")
        lines.append(f"{ts:.1f}s {name}")
    return " / ".join(lines)


def process_video_async(user_id: str, message_id: str):
    try:
        blob_api = get_blob_api()
        content = blob_api.get_message_content(message_id)

        # 動画を永続ディレクトリに保存（再生成時に必要）
        user_dir = os.path.join(SESSIONS_DIR, f"video_{user_id}")
        os.makedirs(user_dir, exist_ok=True)
        video_path = os.path.join(user_dir, "input.mp4")
        with open(video_path, "wb") as f:
            f.write(content)

        output_dir = os.path.join(user_dir, "out")
        result = run_pipeline(video_path, SFX_DIR, output_dir, learned_rules=learning.load_rules())

        sessions.save(user_id, {
            "video_path": video_path,
            "timeline": result["timeline"],
            "duration": result["duration"],
            "events": result["events"],
        })

        timeline_text = format_timeline(result["timeline"])
        dl_url = get_download_url(user_id)
        review_url = get_review_url(user_id)
        resp = f"SE挿入完了!\n\nレビュー(動画見ながら調整):\n{review_url}\n\nダウンロード:\n{dl_url}\n\n{timeline_text}"
        push_text(user_id, resp)
        conv_log.log_message(user_id, "[動画処理完了]", resp, context={
            "type": "video_processed",
            "timeline_count": len(result["timeline"]),
            "duration": result["duration"],
        })

    except Exception as e:
        logger.exception("Video processing failed")
        error_msg = f"処理中にエラーが発生しました: {str(e)[:100]}"
        push_text(user_id, error_msg)
        conv_log.log_message(user_id, "[動画処理エラー]", error_msg, understood=False, context={
            "type": "video_error",
            "error": str(e),
        })


@app.post("/webhook")
async def webhook(request: Request):
    signature = request.headers.get("X-Line-Signature", "")
    body = (await request.body()).decode("utf-8")

    try:
        events = parser.parse(body, signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    for event in events:
        if not isinstance(event, MessageEvent):
            continue

        user_id = event.source.user_id
        message = event.message

        if isinstance(message, VideoMessageContent):
            api = get_api()
            api.reply_message(ReplyMessageRequest(
                reply_token=event.reply_token,
                messages=[TextMessage(text="動画を受け取りました。SE挿入中... (15-30秒)")],
            ))
            conv_log.log_message(user_id, "[動画送信]", "SE挿入中...", context={"type": "video_received", "message_id": message.id})
            thread = threading.Thread(target=process_video_async, args=(user_id, message.id))
            thread.start()

        elif isinstance(message, AudioMessageContent):
            state = user_states.get(user_id, {})
            if state.get("mode") == "se_add":
                blob_api = get_blob_api()
                content = blob_api.get_message_content(message.id)
                tmp_path = f"/tmp/se_upload_{user_id}.wav"
                with open(tmp_path, "wb") as f:
                    f.write(content)
                user_states[user_id] = {"mode": "se_add_category", "file": tmp_path}
                api = get_api()
                resp = "カテゴリを選んでください:\n切る / 混ぜる / 注ぐ / 演出 / リアクション / 転換 / その他"
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=resp)],
                ))
                conv_log.log_message(user_id, "[音声送信:SE追加]", resp)
            else:
                api = get_api()
                resp = "SE追加する場合は先に「SE追加」と送ってください。"
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=resp)],
                ))
                conv_log.log_message(user_id, "[音声送信]", resp, understood=False, context={"type": "audio_without_mode"})

        elif isinstance(message, TextMessageContent):
            text = message.text.strip()
            api = get_api()

            if text == "SE追加":
                user_states[user_id] = {"mode": "se_add"}
                resp = "音声ファイルか動画を送ってください。"
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=resp)],
                ))
                conv_log.log_message(user_id, text, resp)

            elif user_states.get(user_id, {}).get("mode") == "se_add_category":
                state = user_states[user_id]
                category = resolve_category(text)
                if category:
                    result = add_sfx(state["file"], SFX_DIR, category)
                    user_states.pop(user_id, None)
                    resp = f"{result} として追加しました!"
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text=resp)],
                    ))
                    conv_log.log_message(user_id, text, resp)
                else:
                    resp = "カテゴリを選んでください:\n切る / 混ぜる / 注ぐ / 演出 / リアクション / 転換 / その他"
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text=resp)],
                    ))
                    conv_log.log_message(user_id, text, resp, understood=False)

            elif text == "SE一覧":
                sfx_list = list_all_sfx(SFX_DIR)
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=sfx_list)],
                ))
                conv_log.log_message(user_id, text, sfx_list)

            elif text == "学習状況":
                stats = learning.get_stats()
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=stats)],
                ))
                conv_log.log_message(user_id, text, stats)

            elif text == "未理解ログ":
                summary = conv_log.get_misunderstood_summary()
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=summary)],
                ))

            elif text == "改善レポート":
                report = conv_log.get_improvement_report()
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=report)],
                ))

            elif text == "会話履歴":
                history = conv_log.get_recent_log(user_id)
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=history[:4500])],
                ))

            else:
                session = sessions.load(user_id)
                if session:
                    try:
                        ops = parse_adjustment(text, session["timeline"], SFX_DIR)
                        if ops:
                            # 学習データに記録
                            learning.record_adjustment(
                                user_id, ops,
                                session["timeline"],
                                session.get("events", []),
                            )
                            new_timeline = apply_operations(session["timeline"], ops, SFX_DIR)
                            session["timeline"] = new_timeline
                            sessions.save(user_id, session)
                            resp = "調整して再生成中..."
                            api.reply_message(ReplyMessageRequest(
                                reply_token=event.reply_token,
                                messages=[TextMessage(text=resp)],
                            ))
                            conv_log.log_message(user_id, text, resp, context={
                                "operations": ops,
                                "timeline_before": [
                                    {"ts": e["timestamp"], "sfx": os.path.basename(e["sfx"])}
                                    for e in timeline
                                ] if (timeline := session.get("timeline")) else [],
                            })
                            def _rerender():
                                try:
                                    output_dir = os.path.join(SESSIONS_DIR, f"video_{user_id}", "out")
                                    os.makedirs(output_dir, exist_ok=True)
                                    result = rerender(session["video_path"], new_timeline, session["duration"], output_dir)
                                    tl = format_timeline(new_timeline)
                                    dl_url = get_download_url(user_id)
                                    push_text(user_id, f"更新しました!\n\nダウンロード:\n{dl_url}\n\n{tl}")
                                except Exception as e:
                                    push_text(user_id, f"再生成エラー: {str(e)[:100]}")
                            threading.Thread(target=_rerender).start()
                        else:
                            resp = "指示を理解できませんでした。例: 「5秒の音消して」「25秒にぷにぷに追加」"
                            api.reply_message(ReplyMessageRequest(
                                reply_token=event.reply_token,
                                messages=[TextMessage(text=resp)],
                            ))
                            conv_log.log_message(user_id, text, resp, understood=False, context={
                                "timeline": [
                                    {"ts": e["timestamp"], "sfx": os.path.basename(e["sfx"])}
                                    for e in session.get("timeline", [])
                                ],
                            })
                    except Exception as e:
                        logger.exception("Adjustment failed")
                        resp = f"調整エラー: {str(e)[:100]}"
                        api.reply_message(ReplyMessageRequest(
                            reply_token=event.reply_token,
                            messages=[TextMessage(text=resp)],
                        ))
                        conv_log.log_message(user_id, text, resp, understood=False, context={"error": str(e)})
                else:
                    resp = "動画を送ってください。SE自動挿入します!"
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text=resp)],
                    ))
                    conv_log.log_message(user_id, text, resp)

    return {"status": "ok"}


@app.get("/download/{token}")
async def download_video(token: str):
    """トークンで動画をダウンロード"""
    # tokenからuser_dirを逆引き
    for name in os.listdir(SESSIONS_DIR):
        if name.startswith("video_"):
            user_id = name.replace("video_", "")
            expected = hashlib.md5(user_id.encode()).hexdigest()[:12]
            if token == expected:
                video_path = os.path.join(SESSIONS_DIR, name, "out", "output.mp4")
                if os.path.exists(video_path):
                    return FileResponse(video_path, media_type="video/mp4", filename="se_output.mp4")
    raise HTTPException(status_code=404, detail="Not found")


def _read_public_url() -> str:
    """固定プロキシURL を返す。トンネルURLが変わってもリンクは不変。"""
    return os.environ.get("PROXY_URL", "https://cooking-sfx-proxy.archbridge24.workers.dev")


def get_download_url(user_id: str) -> str:
    token = hashlib.md5(user_id.encode()).hexdigest()[:12]
    host = _read_public_url()
    return f"{host}/download/{token}"


def get_review_url(user_id: str) -> str:
    token = hashlib.md5(user_id.encode()).hexdigest()[:12]
    host = _read_public_url()
    return f"{host}/review/{token}"


def _resolve_token(token: str) -> str | None:
    """tokenからuser_idを逆引きする。"""
    for name in os.listdir(SESSIONS_DIR):
        if name.startswith("video_"):
            uid = name.replace("video_", "")
            if hashlib.md5(uid.encode()).hexdigest()[:12] == token:
                return uid
    return None


@app.get("/review/{token}", response_class=HTMLResponse)
async def review_page(token: str):
    """動画プレーヤー + SE調整UIを1画面で表示する。"""
    user_id = _resolve_token(token)
    if not user_id:
        raise HTTPException(status_code=404, detail="Not found")
    session = sessions.load(user_id)
    if not session:
        raise HTTPException(status_code=404, detail="No session")

    import json as _json
    timeline_json = _json.dumps([
        {"timestamp": e["timestamp"], "sfx": os.path.basename(e["sfx"]).replace(".wav", ""), "volume_db": e.get("volume_db", 0)}
        for e in session.get("timeline", [])
    ], ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SE Review</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,sans-serif; background:#111; color:#eee; height:100dvh; display:flex; flex-direction:column; }}
.video-wrap {{ position:relative; background:#000; flex:1; min-height:0; display:flex; align-items:center; justify-content:center; }}
video {{ max-width:100%; max-height:100%; }}
.time-badge {{ position:absolute; top:8px; left:8px; background:rgba(0,0,0,.7); padding:4px 10px; border-radius:12px; font-size:14px; font-variant-numeric:tabular-nums; }}
.panel {{ background:#1a1a1a; padding:8px 12px; max-height:45dvh; overflow-y:auto; }}
.timeline {{ display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }}
.se-chip {{ background:#333; padding:4px 8px; border-radius:8px; font-size:12px; cursor:pointer; transition:background .15s; }}
.se-chip:hover {{ background:#555; }}
.se-chip.active {{ background:#f59e0b; color:#000; }}
.input-row {{ display:flex; gap:6px; padding:4px 0; }}
.input-row input {{ flex:1; background:#222; border:1px solid #444; color:#eee; padding:8px 12px; border-radius:8px; font-size:15px; }}
.input-row button {{ background:#f59e0b; color:#000; border:none; padding:8px 16px; border-radius:8px; font-weight:bold; font-size:15px; }}
.input-row button:disabled {{ opacity:.5; }}
.status {{ font-size:12px; color:#888; min-height:18px; padding:2px 0; }}
.log {{ font-size:12px; color:#aaa; margin-top:4px; max-height:80px; overflow-y:auto; }}
.log div {{ padding:2px 0; border-bottom:1px solid #222; }}
</style>
</head>
<body>
<div class="video-wrap">
  <video id="vid" src="/download/{token}" controls playsinline></video>
  <div class="time-badge" id="timeBadge">0:00.0</div>
</div>
<div class="panel">
  <div class="timeline" id="timeline"></div>
  <div class="input-row">
    <input id="cmd" placeholder="例: この音消して / 5秒にぷにぷに追加" autocomplete="off">
    <button id="send" onclick="sendCmd()">送信</button>
  </div>
  <div class="status" id="status"></div>
  <div class="log" id="log"></div>
</div>
<script>
const token = "{token}";
let timeline = {timeline_json};
const vid = document.getElementById("vid");
const badge = document.getElementById("timeBadge");
const tlEl = document.getElementById("timeline");
const cmdEl = document.getElementById("cmd");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const sendBtn = document.getElementById("send");

function fmt(t) {{
  const m = Math.floor(t/60), s = (t%60).toFixed(1).padStart(4,"0");
  return m+":"+s;
}}

vid.addEventListener("timeupdate", () => {{
  badge.textContent = fmt(vid.currentTime);
  document.querySelectorAll(".se-chip").forEach(c => {{
    const ts = parseFloat(c.dataset.ts);
    c.classList.toggle("active", Math.abs(vid.currentTime - ts) < 0.5);
  }});
}});

function renderTimeline() {{
  tlEl.innerHTML = timeline.map(e =>
    `<span class="se-chip" data-ts="${{e.timestamp}}" onclick="vid.currentTime=${{e.timestamp}}">${{e.timestamp.toFixed(1)}}s ${{e.sfx}}</span>`
  ).join("");
}}
renderTimeline();

cmdEl.addEventListener("keydown", e => {{ if(e.key==="Enter") sendCmd(); }});

async function sendCmd() {{
  const text = cmdEl.value.trim();
  if(!text) return;
  const curTime = vid.currentTime;
  sendBtn.disabled = true;
  statusEl.textContent = "処理中...";
  try {{
    const res = await fetch("/api/adjust/"+token, {{
      method:"POST",
      headers:{{"Content-Type":"application/json"}},
      body:JSON.stringify({{instruction:text, current_time:curTime}})
    }});
    const data = await res.json();
    if(data.ok) {{
      timeline = data.timeline;
      renderTimeline();
      statusEl.textContent = "調整完了! 再生成中...";
      logEl.innerHTML = `<div>${{text}} → OK</div>` + logEl.innerHTML;
      cmdEl.value = "";
      pollVideo();
    }} else {{
      statusEl.textContent = data.error || "理解できませんでした";
      logEl.innerHTML = `<div>${{text}} → NG</div>` + logEl.innerHTML;
    }}
  }} catch(e) {{
    statusEl.textContent = "通信エラー";
  }}
  sendBtn.disabled = false;
}}

async function pollVideo() {{
  for(let i=0;i<30;i++) {{
    await new Promise(r=>setTimeout(r,2000));
    try {{
      const r = await fetch("/api/status/"+token);
      const d = await r.json();
      if(d.ready) {{
        const cur = vid.currentTime;
        vid.src = "/download/"+token+"?t="+Date.now();
        vid.currentTime = cur;
        statusEl.textContent = "更新完了";
        return;
      }}
    }} catch(e) {{}}
  }}
  statusEl.textContent = "タイムアウト。ページを更新してください";
}}
</script>
</body>
</html>"""
    return HTMLResponse(content=html)


@app.post("/api/adjust/{token}")
async def api_adjust(token: str, request: Request):
    """Webレビュー画面からのSE調整API。"""
    user_id = _resolve_token(token)
    if not user_id:
        raise HTTPException(status_code=404, detail="Not found")
    session = sessions.load(user_id)
    if not session:
        return JSONResponse({"ok": False, "error": "セッションなし"})

    body = await request.json()
    instruction = body.get("instruction", "").strip()
    current_time = body.get("current_time")
    if not instruction:
        return JSONResponse({"ok": False, "error": "指示が空です"})

    # 再生位置をコンテキストとして付加
    if current_time is not None:
        instruction_with_ctx = f"(現在の再生位置: {current_time:.1f}秒) {instruction}"
    else:
        instruction_with_ctx = instruction

    try:
        ops = parse_adjustment(instruction_with_ctx, session["timeline"], SFX_DIR)
    except Exception as e:
        conv_log.log_message(user_id, instruction, f"調整エラー: {e}", understood=False, context={"source": "web_review", "error": str(e)})
        return JSONResponse({"ok": False, "error": f"解析エラー: {str(e)[:80]}"})

    if not ops:
        conv_log.log_message(user_id, instruction, "理解できず", understood=False, context={"source": "web_review", "current_time": current_time})
        return JSONResponse({"ok": False, "error": "指示を理解できませんでした"})

    learning.record_adjustment(user_id, ops, session["timeline"], session.get("events", []))
    new_timeline = apply_operations(session["timeline"], ops, SFX_DIR)
    session["timeline"] = new_timeline
    sessions.save(user_id, session)

    conv_log.log_message(user_id, instruction, f"調整OK: {len(ops)}件", context={"source": "web_review", "operations": ops, "current_time": current_time})

    # バックグラウンドで再レンダリング
    def _bg_rerender():
        try:
            output_dir = os.path.join(SESSIONS_DIR, f"video_{user_id}", "out")
            os.makedirs(output_dir, exist_ok=True)
            rerender(session["video_path"], new_timeline, session["duration"], output_dir)
        except Exception as e:
            logger.exception("Web rerender failed")
    threading.Thread(target=_bg_rerender).start()

    return JSONResponse({"ok": True, "timeline": [
        {"timestamp": e["timestamp"], "sfx": os.path.basename(e["sfx"]).replace(".wav", ""), "volume_db": e.get("volume_db", 0)}
        for e in new_timeline
    ]})


@app.get("/api/status/{token}")
async def api_status(token: str):
    """再レンダリング完了チェック。"""
    user_id = _resolve_token(token)
    if not user_id:
        return JSONResponse({"ready": False})
    video_path = os.path.join(SESSIONS_DIR, f"video_{user_id}", "out", "output.mp4")
    if os.path.exists(video_path):
        mtime = os.path.getmtime(video_path)
        import time as _time
        ready = (_time.time() - mtime) < 5
        return JSONResponse({"ready": ready})
    return JSONResponse({"ready": False})


@app.get("/health")
async def health():
    return {"status": "ok"}
