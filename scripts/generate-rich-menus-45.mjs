#!/usr/bin/env node
/**
 * リッチメニュー④⑤ 画像生成 + LINE API登録スクリプト
 * メニュー④: 見積りフォロー（カウンセリング予約 / チャットで質問）
 * メニュー⑤: カウンセリング後（申し込む / もう少し相談）
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'rich-menu-images');

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!LINE_TOKEN) {
  console.error('ERROR: LINE_CHANNEL_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}

// --- 画像生成 ---

async function generateImage(htmlContent, outputPath) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 2500, height: 843 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><style>body{margin:0;padding:0;}</style></head>
    <body>${htmlContent}</body>
    </html>
  `);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
  console.log(`Generated: ${outputPath}`);
}

const menu4Html = `
<div style="width:2500px;height:843px;display:flex;margin:0;padding:0;">
  <div style="flex:1;background:#F59E0B;display:flex;align-items:center;justify-content:center;flex-direction:column;">
    <div style="font-size:120px;margin-bottom:20px;">📅</div>
    <div style="font-size:64px;color:white;font-weight:bold;text-shadow:1px 1px 3px rgba(0,0,0,0.2);">カウンセリング予約</div>
  </div>
  <div style="flex:1;background:#06C755;display:flex;align-items:center;justify-content:center;flex-direction:column;">
    <div style="font-size:120px;margin-bottom:20px;">💬</div>
    <div style="font-size:64px;color:white;font-weight:bold;text-shadow:1px 1px 3px rgba(0,0,0,0.2);">チャットで質問</div>
  </div>
</div>`;

const menu5Html = `
<div style="width:2500px;height:843px;display:flex;margin:0;padding:0;">
  <div style="flex:1;background:#06C755;display:flex;align-items:center;justify-content:center;flex-direction:column;">
    <div style="font-size:120px;margin-bottom:20px;">✅</div>
    <div style="font-size:64px;color:white;font-weight:bold;text-shadow:1px 1px 3px rgba(0,0,0,0.2);">申し込む</div>
  </div>
  <div style="flex:1;background:#4A90D9;display:flex;align-items:center;justify-content:center;flex-direction:column;">
    <div style="font-size:120px;margin-bottom:20px;">💭</div>
    <div style="font-size:64px;color:white;font-weight:bold;text-shadow:1px 1px 3px rgba(0,0,0,0.2);">もう少し相談</div>
  </div>
</div>`;

// --- LINE API ---

async function createRichMenu(menuData) {
  const res = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(menuData),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('Failed to create rich menu:', JSON.stringify(json));
    throw new Error(`createRichMenu failed: ${res.status}`);
  }
  console.log(`Created rich menu: ${json.richMenuId}`);
  return json.richMenuId;
}

async function uploadRichMenuImage(richMenuId, imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'image/png',
    },
    body: imageData,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to upload image:', text);
    throw new Error(`uploadImage failed: ${res.status}`);
  }
  console.log(`Uploaded image for ${richMenuId}`);
}

// --- Main ---

async function main() {
  // 1. Generate images
  const menu4Path = path.join(OUTPUT_DIR, 'menu4_estimate_follow.png');
  const menu5Path = path.join(OUTPUT_DIR, 'menu5_after_counseling.png');

  await generateImage(menu4Html, menu4Path);
  await generateImage(menu5Html, menu5Path);

  // 2. Create rich menus via LINE API
  const menu4Id = await createRichMenu({
    size: { width: 2500, height: 843 },
    selected: false,
    name: 'menu_4_estimate_follow',
    chatBarText: 'メニューを開く',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: { type: 'postback', data: 'booking_start', displayText: 'カウンセリングを予約したい' },
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: { type: 'message', text: '質問があります' },
      },
    ],
  });

  const menu5Id = await createRichMenu({
    size: { width: 2500, height: 843 },
    selected: false,
    name: 'menu_5_after_counseling',
    chatBarText: 'メニューを開く',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: { type: 'message', text: '申し込みたい' },
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: { type: 'message', text: '相談したい' },
      },
    ],
  });

  // 3. Upload images
  await uploadRichMenuImage(menu4Id, menu4Path);
  await uploadRichMenuImage(menu5Id, menu5Path);

  console.log('\n=== Result ===');
  console.log(`Menu 4 (見積りフォロー): ${menu4Id}`);
  console.log(`Menu 5 (カウンセリング後): ${menu5Id}`);

  return { menu4Id, menu5Id };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
