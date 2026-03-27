#!/usr/bin/env node
/**
 * X(Twitter)投稿用画像自動生成スクリプト
 * Puppeteer で HTML/CSS テンプレートをスクリーンショット撮影 → 1200x675px PNG
 *
 * 使い方: node scripts/generate-x-post-images.mjs
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, 'x-post-images');

// ==============================
// カラー定義
// ==============================

const C = {
  lineGreen: '#06C755',
  cyan: '#06B6D4',
  emerald: '#10B981',
  orange: '#F97316',
  darkNavy: '#0F172A',
  navy: '#1E293B',
  subText: '#64748B',
  white: '#FFFFFF',
  lightGray: '#F8FAFB',
  red: '#DC2626',
  lightRed: '#FEF2F2',
  lightGreen: '#F0FDF4',
};

const BASE_STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 675px;
    font-family: system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    overflow: hidden;
  }
`;

// ==============================
// 1. 料金比較画像（Lステップ vs Lカスタム）
// ==============================

function costComparisonHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
body { background: ${C.white}; }
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: 40px 50px;
}
.header {
  text-align: center; margin-bottom: 30px;
}
.header h1 {
  font-size: 36px; color: ${C.darkNavy}; font-weight: 800;
}
.header .sub {
  font-size: 18px; color: ${C.subText}; margin-top: 8px;
}
.cards {
  display: flex; gap: 30px; flex: 1;
}
.card {
  flex: 1; border-radius: 16px; padding: 30px;
  display: flex; flex-direction: column; align-items: center;
}
.card-lstep { background: ${C.lightRed}; }
.card-lcustom { background: ${C.lightGreen}; }
.card-title {
  font-size: 24px; font-weight: 700; margin-bottom: 20px;
}
.card-lstep .card-title { color: ${C.red}; }
.card-lcustom .card-title { color: ${C.emerald}; }
.price-row {
  width: 100%; display: flex; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 20px; color: ${C.darkNavy};
}
.price-row:last-of-type { border-bottom: none; }
.price-val { font-weight: 700; }
.card-lstep .price-val { color: ${C.red}; }
.card-lcustom .price-val { color: ${C.emerald}; }
.total {
  margin-top: auto; padding: 16px 30px;
  border-radius: 12px; font-size: 28px; font-weight: 800;
  text-align: center;
}
.total-red { border: 3px solid ${C.red}; color: ${C.red}; }
.total-green { border: 3px solid ${C.emerald}; color: ${C.emerald}; }
.zero-big {
  font-size: 64px; font-weight: 900; color: ${C.emerald};
  margin: 20px 0;
}
.zero-label { font-size: 22px; color: ${C.emerald}; font-weight: 600; }
.vs {
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 900; color: ${C.subText};
  padding: 0 10px;
}
.footer {
  text-align: center; margin-top: 16px;
  font-size: 14px; color: ${C.subText};
}
</style></head><body>
<div class="container">
  <div class="header">
    <h1>LINE配信ツール 月額費用の比較</h1>
    <div class="sub">3年間で最大235万円の差</div>
  </div>
  <div class="cards">
    <div class="card card-lstep">
      <div class="card-title">Lステップの場合</div>
      <div class="price-row"><span>スタートプラン</span><span class="price-val">月額 5,000円</span></div>
      <div class="price-row"><span>スタンダード</span><span class="price-val">月額 21,780円</span></div>
      <div class="price-row"><span>プロプラン</span><span class="price-val">月額 32,780円</span></div>
      <div class="total total-red">年間 6〜40万円</div>
    </div>
    <div class="vs">VS</div>
    <div class="card card-lcustom">
      <div class="card-title">Lカスタムの場合</div>
      <div class="zero-label">ずっと</div>
      <div class="zero-big">月額 0円</div>
      <div class="total total-green">年間 0円</div>
    </div>
  </div>
  <div class="footer">※LINE公式アカウント無料プラン（月200通）の範囲内の場合</div>
</div>
</body></html>`;
}

// ==============================
// 2. コスト削減インパクト画像
// ==============================

function costSavingHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
body {
  background: linear-gradient(135deg, ${C.darkNavy} 0%, ${C.navy} 100%);
  color: ${C.white};
}
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 40px 60px;
  text-align: center;
}
.top-label {
  font-size: 22px; color: ${C.cyan}; font-weight: 600;
  letter-spacing: 4px; margin-bottom: 20px;
}
.main-text {
  font-size: 42px; font-weight: 800; line-height: 1.4;
  margin-bottom: 30px;
}
.highlight {
  color: ${C.orange}; font-size: 80px; font-weight: 900;
  display: block; margin: 10px 0;
}
.sub-text {
  font-size: 22px; color: rgba(255,255,255,0.7);
  line-height: 1.6;
}
.badge {
  margin-top: 30px;
  background: ${C.lineGreen};
  padding: 12px 40px;
  border-radius: 50px;
  font-size: 20px; font-weight: 700;
}
</style></head><body>
<div class="container">
  <div class="top-label">LINE配信ツールのコスト比較</div>
  <div class="main-text">
    Lステップからの乗り換えで
    <span class="highlight">年間26万円削減</span>
  </div>
  <div class="sub-text">
    3年で78万円、5年で130万円の差。<br>
    この差額を広告費に回したほうがよくないですか？
  </div>
  <div class="badge">Lカスタムなら月額0円</div>
</div>
</body></html>`;
}

// ==============================
// 3. 構築事例ビフォーアフター
// ==============================

function caseStudyHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
body { background: ${C.white}; }
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: 40px 50px;
}
.header {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 24px;
}
.tag {
  background: ${C.lineGreen}; color: white;
  padding: 6px 20px; border-radius: 20px;
  font-size: 16px; font-weight: 700;
}
.header-text {
  font-size: 30px; font-weight: 800; color: ${C.darkNavy};
}
.content {
  display: flex; gap: 30px; flex: 1;
}
.before, .after {
  flex: 1; border-radius: 16px; padding: 28px;
}
.before {
  background: ${C.lightRed};
  border: 2px solid rgba(220,38,38,0.15);
}
.after {
  background: ${C.lightGreen};
  border: 2px solid rgba(16,185,129,0.15);
}
.section-title {
  font-size: 20px; font-weight: 700; margin-bottom: 16px;
  display: flex; align-items: center; gap: 8px;
}
.before .section-title { color: ${C.red}; }
.after .section-title { color: ${C.emerald}; }
.item {
  font-size: 18px; color: ${C.darkNavy};
  padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05);
  display: flex; align-items: center; gap: 8px;
}
.item:last-child { border-bottom: none; }
.item-icon { font-size: 16px; }
.result-bar {
  margin-top: 20px;
  background: linear-gradient(135deg, ${C.cyan}, ${C.emerald});
  border-radius: 12px; padding: 20px 30px;
  display: flex; justify-content: space-around;
  text-align: center;
}
.result-item { color: white; }
.result-label { font-size: 14px; opacity: 0.9; }
.result-value { font-size: 28px; font-weight: 800; margin-top: 4px; }
</style></head><body>
<div class="container">
  <div class="header">
    <div class="tag">構築事例</div>
    <div class="header-text">コンテンツクリエイターのLINE構築</div>
  </div>
  <div class="content">
    <div class="before">
      <div class="section-title">BEFORE</div>
      <div class="item"><span class="item-icon">❌</span> LINE登録後の自動応答なし</div>
      <div class="item"><span class="item-icon">❌</span> 手動で1件ずつ返信</div>
      <div class="item"><span class="item-icon">❌</span> リッチメニュー未設定</div>
      <div class="item"><span class="item-icon">❌</span> ステップ配信なし</div>
      <div class="item"><span class="item-icon">❌</span> ツール月額: 0円（何もできない）</div>
    </div>
    <div class="after">
      <div class="section-title">AFTER（Lカスタムで構築）</div>
      <div class="item"><span class="item-icon">✅</span> 自動応答10パターン</div>
      <div class="item"><span class="item-icon">✅</span> カルーセル3種類</div>
      <div class="item"><span class="item-icon">✅</span> リッチメニュー6ボタン</div>
      <div class="item"><span class="item-icon">✅</span> ステップ配信5本</div>
      <div class="item"><span class="item-icon">✅</span> ツール月額: 0円（全機能動作）</div>
    </div>
  </div>
  <div class="result-bar">
    <div class="result-item">
      <div class="result-label">構築期間</div>
      <div class="result-value">約2週間</div>
    </div>
    <div class="result-item">
      <div class="result-label">月額ツール費</div>
      <div class="result-value">0円</div>
    </div>
    <div class="result-item">
      <div class="result-label">自動化された作業</div>
      <div class="result-value">100%</div>
    </div>
  </div>
</div>
</body></html>`;
}

// ==============================
// 4. LINE活用Tips画像
// ==============================

function tipsHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
body {
  background: linear-gradient(180deg, ${C.lineGreen} 0%, #05a648 100%);
  color: ${C.white};
}
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: 40px 50px;
}
.header {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 30px;
}
.tag {
  background: rgba(255,255,255,0.2);
  padding: 8px 24px; border-radius: 20px;
  font-size: 16px; font-weight: 600;
}
.header-title {
  font-size: 34px; font-weight: 800;
}
.tips-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 20px; flex: 1;
}
.tip-card {
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(10px);
  border-radius: 16px; padding: 24px;
  border: 1px solid rgba(255,255,255,0.2);
}
.tip-num {
  font-size: 14px; font-weight: 700; opacity: 0.7;
  margin-bottom: 8px;
}
.tip-title {
  font-size: 22px; font-weight: 700; margin-bottom: 8px;
  line-height: 1.3;
}
.tip-desc {
  font-size: 16px; opacity: 0.85; line-height: 1.5;
}
.footer {
  margin-top: 20px;
  text-align: right;
  font-size: 18px; font-weight: 600; opacity: 0.8;
}
</style></head><body>
<div class="container">
  <div class="header">
    <div class="tag">LINE活用Tips</div>
    <div class="header-title">LINE公式アカウント 自動化4つの基本</div>
  </div>
  <div class="tips-grid">
    <div class="tip-card">
      <div class="tip-num">01</div>
      <div class="tip-title">あいさつメッセージは命</div>
      <div class="tip-desc">友だち追加直後の自動返信で第一印象が決まる。特典+次のアクション誘導を必ず入れる</div>
    </div>
    <div class="tip-card">
      <div class="tip-num">02</div>
      <div class="tip-title">リッチメニューで導線設計</div>
      <div class="tip-desc">タップ1回で目的地へ。ボタン配置は「上段=集客」「下段=サポート」が鉄板</div>
    </div>
    <div class="tip-card">
      <div class="tip-num">03</div>
      <div class="tip-title">ステップ配信で信頼構築</div>
      <div class="tip-desc">1通目で価値提供→3通目で実績→5通目でオファー。焦って売り込まない</div>
    </div>
    <div class="tip-card">
      <div class="tip-num">04</div>
      <div class="tip-title">タグで顧客を見える化</div>
      <div class="tip-desc">興味・行動でタグ分け→セグメント配信。全員同じメッセージはNG</div>
    </div>
  </div>
  <div class="footer">@える｜LINE構築</div>
</div>
</body></html>`;
}

// ==============================
// 5. ツール選び早見表
// ==============================

function toolGuideHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
body { background: ${C.lightGray}; }
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: 40px 50px;
}
.header {
  text-align: center; margin-bottom: 28px;
}
.header h1 {
  font-size: 34px; color: ${C.darkNavy}; font-weight: 800;
}
.header .sub {
  font-size: 18px; color: ${C.subText}; margin-top: 6px;
}
table {
  width: 100%; border-collapse: separate;
  border-spacing: 0; border-radius: 12px;
  overflow: hidden; background: white;
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
}
th {
  background: ${C.darkNavy}; color: white;
  padding: 14px 16px; font-size: 16px; font-weight: 700;
  text-align: left;
}
td {
  padding: 14px 16px; font-size: 16px; color: ${C.darkNavy};
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
tr:last-child td { border-bottom: none; }
.highlight-row { background: ${C.lightGreen}; }
.highlight-row td { font-weight: 600; }
.price-red { color: ${C.red}; font-weight: 700; }
.price-green { color: ${C.emerald}; font-weight: 700; }
.best-for { font-size: 14px; color: ${C.subText}; }
.footer {
  margin-top: 16px; text-align: right;
  font-size: 16px; color: ${C.subText};
}
</style></head><body>
<div class="container">
  <div class="header">
    <h1>LINE配信ツール 比較早見表</h1>
    <div class="sub">あなたに合ったツールはどれ？</div>
  </div>
  <table>
    <tr>
      <th>ツール名</th>
      <th>月額費用</th>
      <th>構築代行相場</th>
      <th>こんな人向け</th>
    </tr>
    <tr>
      <td>Lステップ</td>
      <td class="price-red">5,000〜32,780円</td>
      <td>30〜250万円</td>
      <td class="best-for">GUI操作重視・サポート必須の方</td>
    </tr>
    <tr>
      <td>エルメ</td>
      <td>0〜33,000円</td>
      <td>10〜100万円</td>
      <td class="best-for">無料で始めたい小規模事業者</td>
    </tr>
    <tr>
      <td>プロラインフリー</td>
      <td>0〜29,040円</td>
      <td>10〜50万円</td>
      <td class="best-for">無料で試したい個人事業主</td>
    </tr>
    <tr>
      <td>UTAGE</td>
      <td>9,700〜21,670円</td>
      <td>20〜80万円</td>
      <td class="best-for">オンライン講座と連携したい方</td>
    </tr>
    <tr class="highlight-row">
      <td>Lカスタム</td>
      <td class="price-green">0円（買い切り）</td>
      <td>9,800〜49,800円</td>
      <td class="best-for">固定費ゼロ・完全自動化したい方</td>
    </tr>
  </table>
  <div class="footer">@える｜LINE構築</div>
</div>
</body></html>`;
}

// ==============================
// 画像生成
// ==============================

async function captureHTML(browser, html, filename) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 675, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outputPath = resolve(OUTPUT_DIR, filename);
  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width: 1200, height: 675 },
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
    console.log('\n[X投稿用画像] 生成中...');

    await captureHTML(browser, costComparisonHTML(), '01-cost-comparison.png');
    await captureHTML(browser, costSavingHTML(), '02-cost-saving.png');
    await captureHTML(browser, caseStudyHTML(), '03-case-study.png');
    await captureHTML(browser, tipsHTML(), '04-tips-automation.png');
    await captureHTML(browser, toolGuideHTML(), '05-tool-guide.png');

    console.log('\n全画像の生成が完了しました。');
    console.log(`出力先: ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
