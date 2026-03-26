#!/usr/bin/env node
/**
 * Xプロフィール用画像生成スクリプト
 * - アイコン: 400x400px
 * - ヘッダー: 1500x500px
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, 'x-post-images');

const C = {
  lineGreen: '#06C755',
  cyan: '#06B6D4',
  emerald: '#10B981',
  darkNavy: '#0F172A',
  navy: '#1E293B',
  white: '#FFFFFF',
  orange: '#F97316',
  subText: '#94A3B8',
};

// ==============================
// アイコン（400x400px）
// ==============================

function iconHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 400px; height: 400px;
  font-family: system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif;
  overflow: hidden;
  background: linear-gradient(135deg, ${C.darkNavy} 0%, #1a2744 100%);
  display: flex; align-items: center; justify-content: center;
}
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  position: relative;
}
/* 背景のアクセント円 */
.bg-circle {
  position: absolute;
  width: 280px; height: 280px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${C.lineGreen}22, ${C.cyan}22);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
/* 人物シルエット（CSSアート） */
.avatar {
  position: relative; z-index: 1;
  width: 120px; height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${C.lineGreen}, ${C.emerald});
  margin-bottom: 16px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 32px rgba(6, 199, 85, 0.3);
}
.avatar-inner {
  font-size: 64px;
  line-height: 1;
}
.name {
  position: relative; z-index: 1;
  color: ${C.white};
  font-size: 52px;
  font-weight: 900;
  letter-spacing: 6px;
}
.title-text {
  position: relative; z-index: 1;
  color: ${C.lineGreen};
  font-size: 18px;
  font-weight: 600;
  margin-top: 8px;
  letter-spacing: 2px;
}
/* LINE風のアクセントライン */
.accent-line {
  position: absolute;
  bottom: 40px;
  width: 60px; height: 4px;
  background: ${C.lineGreen};
  border-radius: 2px;
}
</style></head><body>
<div class="container">
  <div class="bg-circle"></div>
  <div class="avatar">
    <div class="avatar-inner">👨‍💻</div>
  </div>
  <div class="name">える</div>
  <div class="title-text">LINE構築</div>
  <div class="accent-line"></div>
</div>
</body></html>`;
}

// ==============================
// ヘッダー（1500x500px）
// ==============================

function headerHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1500px; height: 500px;
  font-family: system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif;
  overflow: hidden;
  background: linear-gradient(135deg, ${C.darkNavy} 0%, #1a2744 60%, #0d2137 100%);
  color: ${C.white};
}
.container {
  width: 100%; height: 100%;
  display: flex; align-items: center;
  padding: 0 80px;
  position: relative;
}
/* 背景パターン */
.bg-pattern {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background-image:
    radial-gradient(circle at 20% 50%, ${C.lineGreen}08 0%, transparent 50%),
    radial-gradient(circle at 80% 30%, ${C.cyan}08 0%, transparent 50%),
    radial-gradient(circle at 60% 80%, ${C.emerald}06 0%, transparent 40%);
}
/* 左の緑アクセントバー */
.accent-bar {
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 6px;
  background: linear-gradient(180deg, ${C.lineGreen}, ${C.emerald});
}
.content {
  position: relative; z-index: 1;
  flex: 1;
}
.tagline {
  font-size: 22px; color: ${C.lineGreen};
  font-weight: 600; letter-spacing: 3px;
  margin-bottom: 16px;
}
.main-copy {
  font-size: 48px; font-weight: 800;
  line-height: 1.4; margin-bottom: 20px;
}
.main-copy .highlight {
  color: ${C.lineGreen};
}
.sub-copy {
  font-size: 20px; color: ${C.subText};
  line-height: 1.6;
}
/* 右側のカード群 */
.cards {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; gap: 16px;
  margin-left: 60px;
}
.card {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 18px 28px;
  backdrop-filter: blur(10px);
  display: flex; align-items: center; gap: 16px;
}
.card-icon {
  font-size: 28px;
  width: 48px; height: 48px;
  background: ${C.lineGreen}18;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.card-text {
  font-size: 18px; font-weight: 600;
}
.card-sub {
  font-size: 14px; color: ${C.subText}; margin-top: 2px;
}
/* 右下のアカウント名 */
.handle {
  position: absolute;
  bottom: 24px; right: 40px;
  font-size: 16px; color: ${C.subText};
  letter-spacing: 1px;
}
</style></head><body>
<div class="container">
  <div class="bg-pattern"></div>
  <div class="accent-bar"></div>
  <div class="content">
    <div class="tagline">LINE AUTOMATION CONSULTANT</div>
    <div class="main-copy">
      LINE公式アカウントの<br>
      <span class="highlight">自動化</span>と<span class="highlight">コスト削減</span>
    </div>
    <div class="sub-copy">
      月額ツール費用0円で、自動応答・ステップ配信・<br>
      リッチメニューまで。構築から運用までサポート。
    </div>
  </div>
  <div class="cards">
    <div class="card">
      <div class="card-icon">💰</div>
      <div>
        <div class="card-text">月額ツール費 0円</div>
        <div class="card-sub">年間26万円のコスト削減</div>
      </div>
    </div>
    <div class="card">
      <div class="card-icon">⚡</div>
      <div>
        <div class="card-text">最短2週間で構築</div>
        <div class="card-sub">自動応答・配信・診断bot</div>
      </div>
    </div>
    <div class="card">
      <div class="card-icon">🛡️</div>
      <div>
        <div class="card-text">BAN対策標準搭載</div>
        <div class="card-sub">データ保護・自動監視</div>
      </div>
    </div>
  </div>
  <div class="handle">@える｜LINE構築</div>
</div>
</body></html>`;
}

// ==============================
// 画像生成
// ==============================

async function captureHTML(browser, html, filename, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outputPath = resolve(OUTPUT_DIR, filename);
  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width, height },
  });
  await page.close();
  console.log(`  -> ${outputPath}`);
  return outputPath;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Puppeteer を起動中...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    console.log('\n[Xプロフィール画像] 生成中...');
    await captureHTML(browser, iconHTML(), 'profile-icon.png', 400, 400);
    await captureHTML(browser, headerHTML(), 'profile-header.png', 1500, 500);
    console.log('\n完了！');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
