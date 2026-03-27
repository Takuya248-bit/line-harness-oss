#!/usr/bin/env node
/**
 * アイキャッチ画像生成スクリプト
 * Puppeteer で HTML/CSS テンプレートをスクリーンショット撮影 → 1200x630px PNG
 *
 * 使い方:
 *   node scripts/generate-eyecatch.mjs --title "記事タイトル" --subtitle "サブコピー" --slug "slug名"
 *   node scripts/generate-eyecatch.mjs --title "タイトル" --subtitle "サブ" --slug "my-post" --output-dir "./out"
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ==============================
// 引数パース
// ==============================

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--title' && argv[i + 1]) {
      args.title = argv[++i];
    } else if (argv[i] === '--subtitle' && argv[i + 1]) {
      args.subtitle = argv[++i];
    } else if (argv[i] === '--slug' && argv[i + 1]) {
      args.slug = argv[++i];
    } else if (argv[i] === '--output-dir' && argv[i + 1]) {
      args.outputDir = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.title || !args.subtitle || !args.slug) {
  console.error('使い方: node scripts/generate-eyecatch.mjs --title "タイトル" --subtitle "サブコピー" --slug "slug名" [--output-dir "出力先"]');
  console.error('\n必須引数:');
  console.error('  --title     記事タイトル');
  console.error('  --subtitle  サブコピー');
  console.error('  --slug      ファイル名に使うスラッグ');
  console.error('\nオプション:');
  console.error('  --output-dir  出力先ディレクトリ（デフォルト: scripts/eyecatch-images/）');
  process.exit(1);
}

const OUTPUT_DIR = args.outputDir
  ? resolve(args.outputDir)
  : resolve(__dirname, 'eyecatch-images');

// ==============================
// カラー定義
// ==============================

const C = {
  darkNavy: '#0a1628',
  navy: '#0f1f3d',
  lineGreen: '#06C755',
  lineGreenDark: '#05a648',
  white: '#FFFFFF',
  lightText: 'rgba(255,255,255,0.7)',
  accentGlow: 'rgba(6,199,85,0.15)',
};

// ==============================
// タイトルの自動折り返し処理
// ==============================

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function calcFontSize(title) {
  const len = title.length;
  if (len <= 15) return 52;
  if (len <= 25) return 46;
  if (len <= 35) return 40;
  if (len <= 50) return 34;
  return 28;
}

// ==============================
// HTML テンプレート
// ==============================

function eyecatchHTML(title, subtitle) {
  const fontSize = calcFontSize(title);
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1200px;
  height: 630px;
  font-family: system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
  overflow: hidden;
  background: ${C.darkNavy};
}
.container {
  width: 100%; height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 80px;
}

/* 背景装飾 */
.bg-circle-1 {
  position: absolute;
  top: -80px; right: -80px;
  width: 350px; height: 350px;
  border-radius: 50%;
  background: ${C.accentGlow};
  filter: blur(60px);
}
.bg-circle-2 {
  position: absolute;
  bottom: -60px; left: -60px;
  width: 250px; height: 250px;
  border-radius: 50%;
  background: rgba(6,199,85,0.08);
  filter: blur(50px);
}
.bg-line {
  position: absolute;
  top: 0; left: 80px;
  width: 4px; height: 100%;
  background: linear-gradient(to bottom, transparent, ${C.lineGreen}, transparent);
  opacity: 0.3;
}

/* ロゴ */
.logo {
  position: absolute;
  top: 32px; left: 80px;
  font-size: 20px;
  font-weight: 800;
  color: ${C.lineGreen};
  letter-spacing: 2px;
}
.logo-dot {
  display: inline-block;
  width: 8px; height: 8px;
  background: ${C.lineGreen};
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
}

/* メインコンテンツ */
.subtitle {
  font-size: 18px;
  font-weight: 600;
  color: ${C.lineGreen};
  letter-spacing: 3px;
  text-transform: uppercase;
  margin-bottom: 20px;
  text-align: center;
}
.title {
  font-size: ${fontSize}px;
  font-weight: 800;
  color: ${C.white};
  line-height: 1.45;
  text-align: center;
  max-width: 1000px;
  word-break: auto-phrase;
}

/* 下部アクセントバー */
.bottom-bar {
  position: absolute;
  bottom: 0; left: 0;
  width: 100%; height: 6px;
  background: linear-gradient(90deg, ${C.lineGreen}, ${C.lineGreenDark}, ${C.lineGreen});
}

/* 右下URL */
.url {
  position: absolute;
  bottom: 24px; right: 80px;
  font-size: 14px;
  color: ${C.lightText};
  letter-spacing: 1px;
}
</style></head><body>
<div class="container">
  <div class="bg-circle-1"></div>
  <div class="bg-circle-2"></div>
  <div class="bg-line"></div>

  <div class="logo"><span class="logo-dot"></span>Lカスタム</div>

  <div class="subtitle">${safeSubtitle}</div>
  <div class="title">${safeTitle}</div>

  <div class="bottom-bar"></div>
  <div class="url">l-custom.com</div>
</div>
</body></html>`;
}

// ==============================
// 画像生成
// ==============================

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Puppeteer を起動中...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

    const html = eyecatchHTML(args.title, args.subtitle);
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const filename = `${args.slug}.png`;
    const outputPath = resolve(OUTPUT_DIR, filename);

    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });

    await page.close();

    console.log(`アイキャッチ画像を生成しました: ${outputPath}`);
    console.log(JSON.stringify({ path: outputPath, slug: args.slug, width: 1200, height: 630 }));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
