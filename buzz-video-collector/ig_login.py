#!/usr/bin/env python3
"""IGログイン用スクリプト。Playwrightブラウザを開いてログインしてもらう。"""
import time
from playwright.sync_api import sync_playwright

print("Playwrightブラウザを起動してIGログインページを開きます...")
print("ログイン完了したら、このターミナルでEnterを押してください。\n")

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=".pw-profile",
        headless=False,
        channel="chrome",
        viewport={"width": 430, "height": 932},
        locale="ja-JP",
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")

    input("\n>>> IGにログインしたらEnterを押してください... ")

    # 確認
    page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
    time.sleep(3)
    login_form = page.query_selector('input[name="username"]')
    if login_form:
        print("まだログインできていないようです。もう一度試してください。")
    else:
        print("ログイン成功！プロファイルが保存されました。")

    ctx.close()

print("完了。buzz-video-collectorを実行できます。")
