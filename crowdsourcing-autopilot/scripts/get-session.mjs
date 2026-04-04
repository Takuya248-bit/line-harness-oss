// 使い方: node scripts/get-session.mjs <platform>
// platform: lancers | crowdworks
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: path.join(path.dirname(new URL(import.meta.url).pathname), '../.env') });

const CONFIGS = {
  lancers: {
    loginUrl: 'https://www.lancers.jp/user/login',
    loginCheck: url => url.includes('/user/login'),
    emailSel: 'input[name="data[User][email]"]',
    passSel: 'input[name="data[User][password]"]',
    email: process.env.LANCERS_EMAIL,
    password: process.env.LANCERS_PASSWORD,
  },
  crowdworks: {
    loginUrl: 'https://crowdworks.jp/login',
    loginCheck: url => url.includes('/login'),
    emailSel: 'input[type="email"]',
    passSel: 'input[type="password"]',
    email: process.env.CROWDWORKS_EMAIL,
    password: process.env.CROWDWORKS_PASSWORD,
  },
};

const platform = process.argv[2];
const cfg = CONFIGS[platform];
if (!cfg) { console.error('unknown platform'); process.exit(1); }

const profileDir = path.join(os.homedir(), '.config', 'crawl-profiles', platform);
fs.mkdirSync(profileDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: profileDir,
  args: ['--window-size=1280,800', '--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = (await browser.pages())[0];

// セッション確認
await page.goto(cfg.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

// AWS WAF チャレンジを自動突破（「開始」ボタン）
for (let i = 0; i < 6; i++) {
  const btn = await page.$('button[onclick], input[type="submit"], button');
  if (btn) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && (text.includes('開始') || text.includes('Start') || text.includes('Verify'))) {
      process.stderr.write(`[${platform}] WAFチャレンジを突破中...\n`);
      await btn.click();
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText.includes('人間であること') && !bodyText.includes('Human Verification')) break;
  await new Promise(r => setTimeout(r, 2000));
}

const currentUrl = page.url();

if (cfg.loginCheck(currentUrl)) {
  // ログインが必要
  process.stderr.write(`[${platform}] ログインが必要です。自動ログインを試みます...\n`);
  try {
    await page.waitForSelector(cfg.emailSel, { timeout: 8000 });
    await page.type(cfg.emailSel, cfg.email, { delay: 50 });
    await page.type(cfg.passSel, cfg.password, { delay: 50 });
    await page.keyboard.press('Enter');
  } catch(e) {
    process.stderr.write(`[${platform}] フォーム入力失敗: ${e.message}\n`);
    // 実際のinput要素を出力してセレクター確認
    const inputs = await page.$$eval('input:not([type=hidden])', els =>
      els.map(el => `type=${el.type} name=${el.name} id=${el.id} placeholder=${el.placeholder}`)
    );
    process.stderr.write(`[${platform}] 検出されたinput: ${JSON.stringify(inputs)}\n`);
    await page.screenshot({ path: `/tmp/${platform}-login.png` });
    process.stderr.write(`[${platform}] スクリーンショット: /tmp/${platform}-login.png\n`);
  }
  // CAPTCHA/リダイレクト待機（最大3分）
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    if (!cfg.loginCheck(page.url())) break;
    if (i === 5) process.stderr.write(`[${platform}] CAPTCHAが表示されている場合は手動で解いてください\n`);
  }
}

// cookieを取得して出力
const cookies = await page.cookies();
const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
process.stdout.write(cookieStr);
await browser.close();
