#!/usr/bin/env python3
"""
Discord #upwork-jobs チャンネルとWebhookをAPIで作成するセットアップスクリプト。

使用方法:
  export DISCORD_BOT_TOKEN=your_token
  export DISCORD_GUILD_ID=your_guild_id
  python scripts/setup_discord.py
"""
from __future__ import annotations

import os
import sys
import httpx

BASE = "https://discord.com/api/v10"

def main() -> None:
    token = os.environ.get("DISCORD_BOT_TOKEN", "")
    guild_id = os.environ.get("DISCORD_GUILD_ID", "")

    if not token or not guild_id:
        print("ERROR: DISCORD_BOT_TOKEN と DISCORD_GUILD_ID が必要です")
        print("")
        print("取得方法:")
        print("  1. https://discord.com/developers/applications でBotを作成")
        print("  2. Bot > Token をコピーして DISCORD_BOT_TOKEN に設定")
        print("  3. サーバーを右クリック > IDをコピー を DISCORD_GUILD_ID に設定")
        print("  4. BotをサーバーにInvite (必要権限: Manage Channels, Manage Webhooks)")
        sys.exit(1)

    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30.0) as client:
        # 1. #upwork-jobs チャンネル作成
        print("Creating #upwork-jobs channel...")
        r = client.post(
            f"{BASE}/guilds/{guild_id}/channels",
            headers=headers,
            json={
                "name": "upwork-jobs",
                "type": 0,  # GUILD_TEXT
                "topic": "Upwork案件通知 (crowdsourcing-autopilot)",
            },
        )
        if r.status_code == 400 and "already" in r.text.lower():
            print("  Channel may already exist. Searching existing channels...")
            r2 = client.get(f"{BASE}/guilds/{guild_id}/channels", headers=headers)
            r2.raise_for_status()
            channels = r2.json()
            channel = next((c for c in channels if c["name"] == "upwork-jobs"), None)
            if not channel:
                print(f"  ERROR: {r.status_code} {r.text}")
                sys.exit(1)
            channel_id = channel["id"]
            print(f"  Found existing channel id={channel_id}")
        else:
            r.raise_for_status()
            channel_id = r.json()["id"]
            print(f"  Created channel id={channel_id}")

        # 2. Webhook 作成
        print("Creating webhook for #upwork-jobs...")
        r = client.post(
            f"{BASE}/channels/{channel_id}/webhooks",
            headers=headers,
            json={"name": "upwork-autopilot"},
        )
        r.raise_for_status()
        webhook = r.json()
        webhook_url = f"https://discord.com/api/webhooks/{webhook['id']}/{webhook['token']}"
        print(f"  Webhook created: {webhook_url}")

        # 3. 結果を出力
        print("")
        print("=== .env に追加してください ===")
        print(f"DISCORD_WEBHOOK_UPWORK={webhook_url}")
        print("")
        print("=== または .env ファイルに直接追記 ===")
        env_path = ".env"
        line = f"DISCORD_WEBHOOK_UPWORK={webhook_url}\n"
        if os.path.exists(env_path):
            with open(env_path, "a") as f:
                f.write(line)
            print(f"  .env に追記しました: {env_path}")
        else:
            with open(env_path, "w") as f:
                f.write(line)
            print(f"  .env を新規作成しました: {env_path}")


if __name__ == "__main__":
    main()
