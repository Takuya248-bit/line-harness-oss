#!/usr/bin/env node
/**
 * ココナラ出品用画像自動生成スクリプト
 * Puppeteer で HTML/CSS テンプレートをスクリーンショット撮影 → 1220x1240px PNG
 *
 * 使い方: node scripts/generate-coconala-images.mjs
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, 'coconala-images');

// ==============================
// プラン定義（拡張用）
// ==============================

const PLANS = {
  basic: {
    name: 'ベーシック',
    price: '9,800',
    title: 'LINE公式アカウント構築',
    subtitle: 'Lステップ不要で自動化を実現',
    features: '初期設定・自動応答・リッチメニュー付き',
    delivery: '7日',
    includes: [
      'LINE公式アカウント初期設定',
      'あいさつメッセージ作成',
      '自動応答メッセージ 5パターン',
      'リッチメニュー 1種類（デザイン+設定）',
      '使い方マニュアル（PDF）',
    ],
    support: 'なし',
  },
  standard: {
    name: 'スタンダード',
    price: '24,800',
    title: 'LINE公式で自動集客の仕組みを構築',
    subtitle: 'ステップ配信でリピーター育成を自動化',
    features: 'ステップ配信3本・タグ管理・2週間サポート付き',
    delivery: '14日',
    includes: [
      'LINE公式アカウント初期設定',
      'あいさつメッセージ作成',
      '自動応答メッセージ 5パターン',
      'リッチメニュー 2種類（デザイン+設定）',
      'ステップ配信 3本',
      'タグ管理設定',
      'クーポン設定',
      '2週間の運用サポート',
    ],
    support: '2週間',
  },
  premium: {
    name: 'プレミアム',
    price: '49,800',
    title: 'LINE公式の売上自動化を丸ごと構築',
    subtitle: 'スコアリング・分析・外部連携まで完全対応',
    features: 'ステップ10本・スコアリング・分析・1ヶ月サポート',
    delivery: '21日',
    includes: [
      'LINE公式アカウント初期設定',
      'あいさつメッセージ作成',
      '自動応答メッセージ 5パターン',
      'リッチメニュー 2種類',
      'ステップ配信 10本（完全シナリオ）',
      'タグ管理設定',
      'クーポン設定',
      'スコアリング設定',
      '分析ダッシュボード',
      '外部連携設定',
      '1ヶ月の運用サポート（チャット+Zoom）',
      '月次レポート 1回',
    ],
    support: '1ヶ月',
  },
};

// ==============================
// カラー定義
// ==============================

const COLORS = {
  cyan: '#06B6D4',
  emerald: '#10B981',
  orange: '#F97316',
  darkNavy: '#0F172A',
  subText: '#64748B',
  white: '#FFFFFF',
  lightGray: '#F8FAFB',
  lightRed: '#FEF2F2',
  red: '#DC2626',
  lightGreen: '#F0FDF4',
};

// ==============================
// 共通スタイル
// ==============================

const BASE_STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1220px;
    height: 1240px;
    font-family: system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    background: ${COLORS.white};
    overflow: hidden;
  }
`;

// ==============================
// テンプレート1: サムネイル
// ==============================

function thumbnailHTML(plan) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
.container { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; }
.gradient-bar {
  width: 100%; height: 180px;
  background: linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.emerald});
  display: flex; align-items: center; justify-content: center;
}
.gradient-bar span { color: white; font-size: 48px; font-weight: 700; letter-spacing: 4px; }
.badge {
  margin-top: 60px;
  width: 280px; height: 280px; border-radius: 50%;
  background: ${COLORS.orange};
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  box-shadow: 0 12px 40px rgba(249, 115, 22, 0.35);
}
.badge-main { color: white; font-size: 80px; font-weight: 900; line-height: 1; }
.badge-sub { color: white; font-size: 32px; font-weight: 600; margin-top: 4px; }
.title {
  margin-top: 50px;
  font-size: 54px; font-weight: 800; color: ${COLORS.darkNavy};
  text-align: center; padding: 0 60px; line-height: 1.4;
}
.subtitle {
  margin-top: 20px;
  font-size: 30px; color: ${COLORS.subText}; font-weight: 500;
}
.price-box {
  margin-top: 50px;
  border: 3px solid ${COLORS.cyan}; border-radius: 16px;
  padding: 20px 60px;
  display: flex; align-items: baseline; gap: 12px;
}
.plan-name { font-size: 32px; color: ${COLORS.darkNavy}; font-weight: 700; }
.price { font-size: 52px; color: ${COLORS.cyan}; font-weight: 900; }
.price-yen { font-size: 28px; color: ${COLORS.cyan}; font-weight: 700; }
.note {
  margin-top: 30px;
  font-size: 24px; color: ${COLORS.subText};
}
</style></head><body>
<div class="container">
  <div class="gradient-bar"><span>月額ツール費用 0円</span></div>
  <div class="badge">
    <div class="badge-sub">月額</div>
    <div class="badge-main">0円</div>
  </div>
  <div class="title">${plan.title}</div>
  <div class="subtitle">${plan.subtitle}</div>
  <div class="price-box">
    <span class="plan-name">${plan.name}プラン</span>
    <span class="price-yen">¥</span><span class="price">${plan.price}</span>
  </div>
  <div class="note">${plan.features}</div>
</div>
</body></html>`;
}

// ==============================
// テンプレート2: 料金比較表
// ==============================

function comparisonHTML() {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 50px;
}
h1 { font-size: 48px; color: ${COLORS.darkNavy}; font-weight: 800; margin-bottom: 50px; }
.cards { display: flex; gap: 40px; width: 100%; justify-content: center; }
.card {
  flex: 1; max-width: 520px; border-radius: 20px; padding: 50px 40px;
  display: flex; flex-direction: column; align-items: center;
}
.card-lstep { background: ${COLORS.lightRed}; }
.card-harness { background: ${COLORS.lightGreen}; }
.card-label-red { color: ${COLORS.red}; font-size: 32px; font-weight: 700; margin-bottom: 30px; }
.card-label-green { color: ${COLORS.emerald}; font-size: 32px; font-weight: 700; margin-bottom: 30px; }
.plan-row {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  padding: 18px 0; border-bottom: 1px solid rgba(0,0,0,0.08);
  font-size: 28px; color: ${COLORS.darkNavy};
}
.plan-row:last-of-type { border-bottom: none; }
.plan-price { font-weight: 700; }
.plan-price-red { color: ${COLORS.red}; font-weight: 700; }
.total-box {
  margin-top: 40px; padding: 20px 40px; border-radius: 12px;
  font-size: 32px; font-weight: 800; text-align: center;
}
.total-red { border: 3px solid ${COLORS.red}; color: ${COLORS.red}; }
.total-green { border: 3px solid ${COLORS.emerald}; color: ${COLORS.emerald}; }
.zero-price { font-size: 72px; font-weight: 900; color: ${COLORS.emerald}; margin: 40px 0; }
.zero-label { font-size: 36px; color: ${COLORS.emerald}; font-weight: 600; }
.vs {
  display: flex; align-items: center; justify-content: center;
  font-size: 40px; font-weight: 900; color: ${COLORS.subText};
  margin: 0 -10px; z-index: 1;
  align-self: center;
}
.note {
  margin-top: 40px; font-size: 20px; color: ${COLORS.subText}; text-align: center;
}
</style></head><body>
<div class="container">
  <h1>月額ツール費用の比較</h1>
  <div class="cards">
    <div class="card card-lstep">
      <div class="card-label-red">Lステップの場合</div>
      <div class="plan-row"><span>スタートプラン</span><span class="plan-price-red">月額 5,000円</span></div>
      <div class="plan-row"><span>スタンダード</span><span class="plan-price-red">月額 21,780円</span></div>
      <div class="plan-row"><span>プロプラン</span><span class="plan-price-red">月額 33,000円</span></div>
      <div class="total-box total-red">年間 6万〜40万円</div>
    </div>
    <div class="card card-harness">
      <div class="card-label-green">LINE Harnessの場合</div>
      <div class="zero-label">ずっと無料</div>
      <div class="zero-price">月額 0円</div>
      <div class="total-box total-green">年間 0円</div>
    </div>
  </div>
  <div class="note">※LINE公式アカウント無料プラン（月1,000通）の範囲内の場合</div>
</div>
</body></html>`;
}

// ==============================
// テンプレート3: 構築の流れ
// ==============================

function flowHTML() {
  const steps = [
    { num: '1', icon: '📝', title: 'ご購入・ヒアリング', desc: '業種・目的・ご要望をお伺いします' },
    { num: '2', icon: '💡', title: '設計・ご提案', desc: '最適な設定内容をご提案します' },
    { num: '3', icon: '⚙️', title: '構築・設定', desc: 'LINE公式アカウントを構築します' },
    { num: '4', icon: '🎉', title: '納品・サポート開始', desc: 'マニュアル付きで納品。運用サポート開始' },
  ];

  const stepsHTML = steps.map((s, i) => `
    <div class="step-card">
      <div class="step-num-circle">${s.num}</div>
      <div class="step-icon">${s.icon}</div>
      <div class="step-text">
        <div class="step-label">STEP ${s.num}</div>
        <div class="step-title">${s.title}</div>
        <div class="step-desc">${s.desc}</div>
      </div>
    </div>
    ${i < steps.length - 1 ? '<div class="arrow">▼</div>' : ''}
  `).join('');

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><style>
${BASE_STYLE}
.container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 80px;
}
h1 { font-size: 48px; color: ${COLORS.darkNavy}; font-weight: 800; margin-bottom: 40px; }
.step-card {
  width: 100%; background: white; border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  padding: 36px 50px; display: flex; align-items: center; gap: 30px;
}
.step-num-circle {
  min-width: 70px; height: 70px; border-radius: 50%;
  background: linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.emerald});
  color: white; font-size: 36px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.step-icon { font-size: 48px; }
.step-text { flex: 1; }
.step-label { font-size: 20px; color: ${COLORS.cyan}; font-weight: 700; letter-spacing: 2px; }
.step-title { font-size: 34px; color: ${COLORS.darkNavy}; font-weight: 800; margin-top: 4px; }
.step-desc { font-size: 24px; color: ${COLORS.subText}; margin-top: 6px; }
.arrow {
  font-size: 36px; color: ${COLORS.cyan}; text-align: center;
  margin: 12px 0; letter-spacing: 8px;
}
</style></head><body>
<div class="container">
  <h1>ご利用の流れ</h1>
  ${stepsHTML}
</div>
</body></html>`;
}

// ==============================
// 画像生成
// ==============================

async function captureHTML(browser, html, filename) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1220, height: 1240, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outputPath = resolve(OUTPUT_DIR, filename);
  await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1220, height: 1240 } });
  await page.close();
  console.log(`  -> ${outputPath}`);
  return outputPath;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 生成するプランを指定（コマンドライン引数 or 全プラン）
  const targetPlan = process.argv[2]; // basic, standard, premium, or undefined (all)
  const plansToGenerate = targetPlan
    ? { [targetPlan]: PLANS[targetPlan] }
    : PLANS;

  if (targetPlan && !PLANS[targetPlan]) {
    console.error(`Unknown plan: ${targetPlan}. Available: ${Object.keys(PLANS).join(', ')}`);
    process.exit(1);
  }

  console.log('Puppeteer を起動中...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const [key, plan] of Object.entries(plansToGenerate)) {
      console.log(`\n[${plan.name}プラン] 画像生成中...`);

      // 1. サムネイル
      await captureHTML(browser, thumbnailHTML(plan), `${key}-01-thumbnail.png`);

      // 2. 料金比較表（共通だが各プランフォルダに出力）
      await captureHTML(browser, comparisonHTML(), `${key}-02-comparison.png`);

      // 3. 構築の流れ
      await captureHTML(browser, flowHTML(), `${key}-03-flow.png`);
    }

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
