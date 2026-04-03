import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });

// 新しいタブを開く
const page = await browser.newPage();

// まずログイン
console.log('[1] Going to login page...');
await page.goto('https://www.upwork.com/ab/account-security/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: '/tmp/up-01.png' });
console.log('[1] URL:', page.url());

// メール入力
try {
  await page.waitForSelector('#login_username', { timeout: 10000 });
  await page.type('#login_username', 'archbridge24@gmail.com', { delay: 80 });
  console.log('[1] Email typed');
  await new Promise(r => setTimeout(r, 1000));

  // Continue
  await page.click('#login_password_continue');
  console.log('[1] Clicked continue');
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/up-02.png' });

  // パスワード
  await page.waitForSelector('#login_password', { visible: true, timeout: 15000 });
  await page.type('#login_password', 'tk101019', { delay: 80 });
  console.log('[1] Password typed');
  await new Promise(r => setTimeout(r, 1000));

  // Login
  await page.click('#login_control_continue');
  console.log('[1] Clicked login');
  await new Promise(r => setTimeout(r, 10000));
  await page.screenshot({ path: '/tmp/up-03.png' });
  console.log('[1] After login:', page.url());

} catch(e) {
  console.log('[1] Login error:', e.message);
  await page.screenshot({ path: '/tmp/up-03-error.png' });
}

// ログインチェック
if (page.url().includes('login')) {
  console.log('[1] Still on login - CAPTCHA/2FA. Check browser. Waiting 120s...');
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    if (!page.url().includes('login')) {
      console.log('[1] Login success!');
      break;
    }
  }
}

// プロフィールページ
console.log('[2] Going to profile...');
await page.goto('https://www.upwork.com/freelancers/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: '/tmp/up-04-profile.png' });
console.log('[2] Profile URL:', page.url());
console.log('[2] Title:', await page.title());

// ページ構造取得
const info = await page.evaluate(() => {
  const result = { sections: [], buttons: [], inputs: [] };
  document.querySelectorAll('h1,h2,h3,h4,label').forEach(e => {
    const t = e.textContent.trim();
    if (t.length > 0 && t.length < 100) result.sections.push(t);
  });
  document.querySelectorAll('button,[role="button"]').forEach(e => {
    const t = e.textContent.trim();
    if (t.length > 0 && t.length < 60) result.buttons.push(t);
  });
  document.querySelectorAll('input:not([type=hidden]),textarea,select').forEach(e => {
    result.inputs.push({ id: e.id, name: e.name, type: e.type, ph: e.placeholder });
  });
  return result;
});

console.log('[2] Sections:', info.sections.slice(0, 20));
console.log('[2] Buttons:', info.buttons.slice(0, 20));
console.log('[2] Inputs:', info.inputs.slice(0, 10));

console.log('\n[DONE] Screenshots saved to /tmp/up-*.png');
browser.disconnect();
