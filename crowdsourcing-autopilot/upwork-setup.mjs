import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: '/tmp/puppeteer-upwork-profile',
  args: ['--window-size=1280,800', '--window-position=0,0'],
  defaultViewport: { width: 1280, height: 800 },
  slowMo: 50,
});

const page = (await browser.pages())[0];

console.log('[1] Login page...');
await page.goto('https://www.upwork.com/ab/account-security/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

try {
  await page.waitForSelector('#login_username', { timeout: 10000 });
  await page.type('#login_username', 'archbridge24@gmail.com', { delay: 80 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('#login_password_continue');
  console.log('[1] Email submitted');
} catch(e) {
  console.log('[1]', e.message);
}

console.log('[1] >>> CAPTCHAが出たらクリックしてください。5分待ちます <<<');

// パスワード画面 or ログイン完了を待つ
let loggedIn = false;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 5000));
  
  const hasPass = await page.evaluate(() => {
    const el = document.querySelector('#login_password');
    return el && el.offsetParent !== null;
  }).catch(() => false);
  
  if (hasPass) {
    console.log('[1] Password field! Filling...');
    await page.type('#login_password', 'tk101019', { delay: 80 });
    await new Promise(r => setTimeout(r, 500));
    await page.click('#login_control_continue');
    await new Promise(r => setTimeout(r, 10000));
    
    // ログイン後にまたCAPTCHA出るかも
    if (page.url().includes('login')) {
      console.log('[1] Another CAPTCHA after password. Please click it...');
      continue;
    }
    loggedIn = true;
    break;
  }
  
  if (!page.url().includes('login')) {
    loggedIn = true;
    console.log('[1] Logged in!');
    break;
  }
  
  if (i % 6 === 0) console.log(`[1] Waiting... ${i*5}s`);
}

if (!loggedIn) {
  console.log('[1] Timeout. Exiting.');
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: '/tmp/up-login-ok.png' });
console.log('[1] Login OK:', page.url());

// === PROFILE ===
console.log('[2] Profile page...');
await page.goto('https://www.upwork.com/freelancers/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 8000));

// CAPTCHAチェック
for (let i = 0; i < 12; i++) {
  const html = await page.content();
  if (html.includes('challenge') || html.includes('ロボット') || html.includes('captcha')) {
    console.log('[2] CAPTCHA on profile - please click...');
    await new Promise(r => setTimeout(r, 5000));
  } else break;
}

await page.screenshot({ path: '/tmp/up-profile.png' });
console.log('[2] URL:', page.url());

// Expert選択
console.log('[3] Selecting Expert...');
await page.evaluate(() => {
  document.querySelectorAll('div,label,span,p').forEach(e => {
    const t = e.textContent.trim();
    if (t === 'Expert' || t.startsWith('Expert')) {
      if (e.offsetParent) { e.click(); if(e.parentElement) e.parentElement.click(); }
    }
  });
  document.querySelectorAll('input[type="radio"]').forEach(r => {
    const l = (r.closest('label') || r.parentElement)?.textContent || '';
    if (l.includes('Expert')) r.click();
  });
});
await new Promise(r => setTimeout(r, 2000));

// 構造確認 + Save
const pageInfo = await page.evaluate(() => {
  const btns = [];
  document.querySelectorAll('button').forEach(b => {
    const t = b.textContent.trim();
    if (t && t.length < 60) btns.push(t);
  });
  return btns;
});
console.log('[3] Buttons:', pageInfo);

// Save/Next
await page.evaluate(() => {
  document.querySelectorAll('button').forEach(b => {
    const t = b.textContent.trim().toLowerCase();
    if (t.includes('save') || t.includes('next') || t.includes('continue')) b.click();
  });
});
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: '/tmp/up-after-save.png' });
console.log('[3] After save:', page.url());

// 次のステップを繰り返し処理
for (let step = 4; step <= 20; step++) {
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `/tmp/up-step-${step}.png` });
  
  // フォーム入力
  const filled = await page.evaluate((data) => {
    const results = [];
    const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),textarea');
    
    for (const inp of inputs) {
      const ctx = (inp.closest('label')?.textContent || inp.placeholder || inp.name || inp.id || '').toLowerCase();
      
      if ((ctx.includes('title') || ctx.includes('headline')) && !inp.value) {
        inp.focus(); inp.value = data.title;
        inp.dispatchEvent(new Event('input', {bubbles:true}));
        inp.dispatchEvent(new Event('change', {bubbles:true}));
        results.push('title');
      }
      if ((ctx.includes('overview') || ctx.includes('bio') || ctx.includes('description')) && !inp.value) {
        inp.focus(); inp.value = data.overview;
        inp.dispatchEvent(new Event('input', {bubbles:true}));
        inp.dispatchEvent(new Event('change', {bubbles:true}));
        results.push('overview');
      }
      if ((ctx.includes('rate') || ctx.includes('hourly')) && !inp.value) {
        inp.focus(); inp.value = '30';
        inp.dispatchEvent(new Event('input', {bubbles:true}));
        inp.dispatchEvent(new Event('change', {bubbles:true}));
        results.push('rate');
      }
    }
    return results;
  }, {
    title: 'Full-Stack Developer & Japanese Localization Specialist',
    overview: 'Japanese native speaker and full-stack developer with 5+ years of experience. I specialize in English-Japanese translation & localization, AI/LLM output quality evaluation, Japanese content writing, and web development with TypeScript, React, and cloud infrastructure. I combine native Japanese fluency with deep technical knowledge to deliver accurate, natural results. Based in Bali, available for flexible hours across time zones.'
  });
  
  if (filled.length) console.log(`[${step}] Filled:`, filled);
  
  // Save/Next/Continue
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const b of btns) {
      const t = b.textContent.trim().toLowerCase();
      if (t.includes('save') || t.includes('next') || t.includes('continue') || t.includes('submit')) {
        b.click(); return t;
      }
    }
    return null;
  });
  
  console.log(`[${step}] Clicked:`, clicked);
  if (!clicked) { console.log(`[${step}] No more buttons. Done.`); break; }
}

await page.screenshot({ path: '/tmp/up-final.png' });
console.log('\n[DONE] Screenshots in /tmp/up-*.png');
console.log('Browser open for 10 min.');
await new Promise(r => setTimeout(r, 600000));
