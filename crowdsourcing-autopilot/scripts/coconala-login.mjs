import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: '/tmp/puppeteer-coconala-profile',
  args: ['--window-size=1280,800', '--window-position=0,0'],
  defaultViewport: { width: 1280, height: 800 },
  slowMo: 50,
});

const page = (await browser.pages())[0];

console.log('[1] ログインページへアクセス...');
await page.goto('https://coconala.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

console.log('[1] >>> ブラウザでログインしてください（Google OAuth or メール/パス）<<<');
console.log('[1] >>> CAPTCHAが出たら手動でクリックしてください。5分待ちます <<<');

// ログイン完了を待つ（URLが/loginでなくなるまで）
let loggedIn = false;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 5000));

  const url = page.url();
  if (!url.includes('/login')) {
    loggedIn = true;
    console.log('[1] ログイン完了:', url);
    break;
  }

  if (i % 6 === 0) console.log(`[1] 待機中... ${i * 5}s`);
}

if (!loggedIn) {
  console.log('[1] タイムアウト。終了します。');
  await browser.close();
  process.exit(1);
}

// Cookie取得
const cookies = await page.cookies();
const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
console.log(`[2] Cookie取得: ${cookies.length}件`);

// .envファイル更新
const envPath = path.resolve(process.cwd(), '.env');
const newLine = `COCONALA_COOKIE=${cookieStr}`;

if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.includes('COCONALA_COOKIE=')) {
    content = content.replace(/^COCONALA_COOKIE=.*/m, newLine);
  } else {
    content = content.trimEnd() + '\n' + newLine + '\n';
  }
  fs.writeFileSync(envPath, content);
  console.log('[3] .env の COCONALA_COOKIE を更新しました');
} else {
  fs.writeFileSync(envPath, newLine + '\n');
  console.log('[3] .env を新規作成し COCONALA_COOKIE を書き込みました');
}

await browser.close();
console.log('[完了] ログイン情報を保存しました。次回は userDataDir のセッションが使えます。');
