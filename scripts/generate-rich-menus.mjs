#!/usr/bin/env node
/**
 * バリリンガル リッチメニュー画像生成 + LINE API登録スクリプト
 * Puppeteerでhtml→PNG生成 → LINE APIでリッチメニュー作成 → 画像アップロード
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'rich-menu-images');
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}

// ---------- HTML Templates ----------

const menu1Html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 2500px; height: 843px; }
</style></head><body>
<div style="width:2500px;height:843px;display:flex;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <div style="flex:1;background:#06C755;display:flex;align-items:center;justify-content:center;flex-direction:column;">
    <div style="width:120px;height:120px;border:6px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:30px;">
      <span style="font-size:80px;color:white;line-height:1;">✓</span>
    </div>
    <div style="font-size:64px;color:white;font-weight:bold;letter-spacing:2px;">アンケートに答える</div>
  </div>
  <div style="flex:1;background:#1B2A4A;display:flex;align-items:center;justify-content:center;flex-direction:column;">
    <div style="font-size:80px;margin-bottom:30px;">🏫</div>
    <div style="font-size:64px;color:white;font-weight:bold;letter-spacing:2px;">学校について</div>
  </div>
</div>
</body></html>`;

const menu2Html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 2500px; height: 1686px; }
.cell { display:flex;align-items:center;justify-content:center;flex-direction:column; }
</style></head><body>
<div style="width:2500px;height:1686px;display:flex;flex-direction:column;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <div style="display:flex;height:843px;">
    <div class="cell" style="flex:1;background:#06C755;">
      <div style="font-size:80px;margin-bottom:20px;">💬</div>
      <div style="font-size:56px;color:white;font-weight:bold;">チャットで相談</div>
    </div>
    <div class="cell" style="flex:1;background:#4A90D9;">
      <div style="font-size:80px;margin-bottom:20px;">📋</div>
      <div style="font-size:56px;color:white;font-weight:bold;">無料見積り</div>
    </div>
    <div class="cell" style="flex:1;background:#F59E0B;">
      <div style="font-size:80px;margin-bottom:20px;">📅</div>
      <div style="font-size:56px;color:white;font-weight:bold;">カウンセリング予約</div>
    </div>
  </div>
  <div style="display:flex;height:843px;">
    <div class="cell" style="flex:1;background:#374151;border-right:2px solid #4B5563;">
      <div style="font-size:80px;margin-bottom:20px;">💰</div>
      <div style="font-size:52px;color:white;font-weight:bold;">料金プラン</div>
    </div>
    <div class="cell" style="flex:1;background:#374151;border-right:2px solid #4B5563;">
      <div style="font-size:80px;margin-bottom:20px;">❓</div>
      <div style="font-size:52px;color:white;font-weight:bold;">よくある質問</div>
    </div>
    <div class="cell" style="flex:1;background:#374151;">
      <div style="font-size:80px;margin-bottom:20px;">🏝️</div>
      <div style="font-size:52px;color:white;font-weight:bold;">学校紹介</div>
    </div>
  </div>
</div>
</body></html>`;

const menu3Html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 2500px; height: 1686px; }
.cell { display:flex;align-items:center;justify-content:center;flex-direction:column; }
</style></head><body>
<div style="width:2500px;height:1686px;display:flex;flex-direction:column;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <div style="display:flex;height:843px;">
    <div class="cell" style="flex:1;background:#4A90D9;">
      <div style="font-size:90px;margin-bottom:25px;">📋</div>
      <div style="font-size:64px;color:white;font-weight:bold;">無料見積り</div>
    </div>
    <div class="cell" style="flex:1;background:#F59E0B;">
      <div style="font-size:90px;margin-bottom:25px;">📅</div>
      <div style="font-size:64px;color:white;font-weight:bold;">カウンセリング予約</div>
    </div>
  </div>
  <div style="display:flex;height:843px;">
    <div class="cell" style="flex:1;background:#374151;border-right:2px solid #4B5563;">
      <div style="font-size:90px;margin-bottom:25px;">❓</div>
      <div style="font-size:64px;color:white;font-weight:bold;">よくある質問</div>
    </div>
    <div class="cell" style="flex:1;background:#374151;">
      <div style="font-size:90px;margin-bottom:25px;">🗣️</div>
      <div style="font-size:64px;color:white;font-weight:bold;">留学生の声</div>
    </div>
  </div>
</div>
</body></html>`;

// ---------- Rich Menu Definitions ----------

const menus = [
  {
    name: 'menu_1_survey',
    filename: 'menu1_survey.png',
    html: menu1Html,
    width: 2500,
    height: 843,
    body: {
      size: { width: 2500, height: 843 },
      selected: false,
      name: 'menu_1_survey',
      chatBarText: 'メニューを開く',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 1250, height: 843 },
          action: { type: 'message', text: 'アンケート' }
        },
        {
          bounds: { x: 1250, y: 0, width: 1250, height: 843 },
          action: { type: 'uri', uri: 'https://l-custom.com/' }
        }
      ]
    }
  },
  {
    name: 'menu_2_main',
    filename: 'menu2_main.png',
    html: menu2Html,
    width: 2500,
    height: 1686,
    body: {
      size: { width: 2500, height: 1686 },
      selected: false,
      name: 'menu_2_main',
      chatBarText: 'メニューを開く',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: 'message', text: '相談したい' }
        },
        {
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: { type: 'message', text: '見積り希望' }
        },
        {
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: { type: 'postback', data: 'booking_start', displayText: 'カウンセリングを予約したい' }
        },
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: 'uri', uri: 'https://l-custom.com/' }
        },
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: { type: 'message', text: 'FAQ' }
        },
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: { type: 'uri', uri: 'https://l-custom.com/' }
        }
      ]
    }
  },
  {
    name: 'menu_3_chat_follow',
    filename: 'menu3_chat_follow.png',
    html: menu3Html,
    width: 2500,
    height: 1686,
    body: {
      size: { width: 2500, height: 1686 },
      selected: false,
      name: 'menu_3_chat_follow',
      chatBarText: 'メニューを開く',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 1250, height: 843 },
          action: { type: 'message', text: '見積り希望' }
        },
        {
          bounds: { x: 1250, y: 0, width: 1250, height: 843 },
          action: { type: 'postback', data: 'booking_start', displayText: 'カウンセリングを予約したい' }
        },
        {
          bounds: { x: 0, y: 843, width: 1250, height: 843 },
          action: { type: 'message', text: 'FAQ' }
        },
        {
          bounds: { x: 1250, y: 843, width: 1250, height: 843 },
          action: { type: 'uri', uri: 'https://l-custom.com/' }
        }
      ]
    }
  }
];

// ---------- Functions ----------

async function generateImage(browser, menu) {
  const page = await browser.newPage();
  await page.setViewport({ width: menu.width, height: menu.height, deviceScaleFactor: 1 });
  await page.setContent(menu.html, { waitUntil: 'networkidle0' });
  const outputPath = path.join(OUTPUT_DIR, menu.filename);
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
  console.log(`[OK] Image: ${outputPath}`);
  return outputPath;
}

async function createRichMenu(menu) {
  const res = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(menu.body)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Create rich menu failed: ${JSON.stringify(data)}`);
  }
  console.log(`[OK] Rich menu created: ${menu.name} -> ${data.richMenuId}`);
  return data.richMenuId;
}

async function uploadImage(richMenuId, imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'image/png'
    },
    body: imageBuffer
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload image failed: ${text}`);
  }
  console.log(`[OK] Image uploaded for ${richMenuId}`);
}

// ---------- Main ----------

async function main() {
  const results = {};

  // Generate images
  console.log('=== Generating rich menu images ===');
  const browser = await puppeteer.launch({ headless: true });

  for (const menu of menus) {
    await generateImage(browser, menu);
  }
  await browser.close();

  // Create rich menus and upload images
  console.log('\n=== Creating rich menus via LINE API ===');
  for (const menu of menus) {
    const richMenuId = await createRichMenu(menu);
    results[menu.name] = richMenuId;

    const imagePath = path.join(OUTPUT_DIR, menu.filename);
    await uploadImage(richMenuId, imagePath);
  }

  // Summary
  console.log('\n=== Results ===');
  for (const [name, id] of Object.entries(results)) {
    console.log(`${name}: ${id}`);
  }

  // Save results to file
  const resultPath = path.join(OUTPUT_DIR, 'rich-menu-ids.json');
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultPath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
