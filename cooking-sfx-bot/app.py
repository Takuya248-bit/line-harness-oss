import os
import tempfile
import logging
import threading

from fastapi import FastAPI, Request, HTTPException
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

CHANNEL_SECRET = os.environ["LINE_CHANNEL_SECRET"]
CHANNEL_TOKEN = os.environ["LINE_CHANNEL_ACCESS_TOKEN"]
SFX_DIR = os.environ.get("SFX_DIR", "/data/sfx")
SESSIONS_DIR = os.environ.get("SESSIONS_DIR", "/tmp/sessions")

parser = WebhookParser(CHANNEL_SECRET)
config = Configuration(access_token=CHANNEL_TOKEN)
sessions = SessionManager(SESSIONS_DIR)
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

        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(content)

            output_dir = os.path.join(tmpdir, "out")
            result = run_pipeline(video_path, SFX_DIR, output_dir)

            sessions.save(user_id, {
                "video_path": video_path,
                "timeline": result["timeline"],
                "duration": result["duration"],
                "events": result["events"],
            })

            timeline_text = format_timeline(result["timeline"])
            push_text(user_id, f"SE挿入完了!\n\n{timeline_text}\n\n調整したい場合はメッセージで指示してください。")

    except Exception as e:
        logger.exception("Video processing failed")
        push_text(user_id, f"処理中にエラーが発生しました: {str(e)[:100]}")


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
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text="カテゴリを選んでください:\n切る / 混ぜる / 注ぐ / 演出 / リアクション / 転換 / その他")],
                ))
            else:
                api = get_api()
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text="SE追加する場合は先に「SE追加」と送ってください。")],
                ))

        elif isinstance(message, TextMessageContent):
            text = message.text.strip()
            api = get_api()

            if text == "SE追加":
                user_states[user_id] = {"mode": "se_add"}
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text="音声ファイルか動画を送ってください。")],
                ))

            elif user_states.get(user_id, {}).get("mode") == "se_add_category":
                state = user_states[user_id]
                category = resolve_category(text)
                if category:
                    result = add_sfx(state["file"], SFX_DIR, category)
                    user_states.pop(user_id, None)
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text=f"{result} として追加しました!")],
                    ))
                else:
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text="カテゴリを選んでください:\n切る / 混ぜる / 注ぐ / 演出 / リアクション / 転換 / その他")],
                    ))

            elif text == "SE一覧":
                sfx_list = list_all_sfx(SFX_DIR)
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=sfx_list)],
                ))

            else:
                session = sessions.load(user_id)
                if session:
                    try:
                        ops = parse_adjustment(text, session["timeline"], SFX_DIR)
                        if ops:
                            new_timeline = apply_operations(session["timeline"], ops, SFX_DIR)
                            session["timeline"] = new_timeline
                            sessions.save(user_id, session)
                            api.reply_message(ReplyMessageRequest(
                                reply_token=event.reply_token,
                                messages=[TextMessage(text="調整して再生成中...")],
                            ))
                            def _rerender():
                                try:
                                    with tempfile.TemporaryDirectory() as tmpdir:
                                        result = rerender(session["video_path"], new_timeline, session["duration"], tmpdir)
                                        tl = format_timeline(new_timeline)
                                        push_text(user_id, f"更新しました!\n\n{tl}")
                                except Exception as e:
                                    push_text(user_id, f"再生成エラー: {str(e)[:100]}")
                            threading.Thread(target=_rerender).start()
                        else:
                            api.reply_message(ReplyMessageRequest(
                                reply_token=event.reply_token,
                                messages=[TextMessage(text="指示を理解できませんでした。例: 「5秒の音消して」「25秒にぷにぷに追加」")],
                            ))
                    except Exception as e:
                        logger.exception("Adjustment failed")
                        api.reply_message(ReplyMessageRequest(
                            reply_token=event.reply_token,
                            messages=[TextMessage(text=f"調整エラー: {str(e)[:100]}")],
                        ))
                else:
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text="動画を送ってください。SE自動挿入します!")],
                    ))

    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}
