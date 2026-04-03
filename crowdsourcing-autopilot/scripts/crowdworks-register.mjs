import puppeteer from 'puppeteer';
import readline from 'readline';

// パスワード取得
const CW_PASSWORD = process.env.CW_PASSWORD || await (async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('CW_PASSWORD: ', ans => { rl.close(); resolve(ans.trim()); });
  });
})();

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: '/tmp/puppeteer-crowdworks-profile',
  args: ['--window-size=1280,900', '--window-position=0,0'],
  defaultViewport: { width: 1280, height: 900 },
  slowMo: 60,
});

const page = (await browser.pages())[0];
let step = 1;

const ss = async (label) => {
  const path = `/tmp/cw-register-step-${step}-${label}.png`;
  await page.screenshot({ path });
  console.log(`[${step}] Screenshot: ${path}`);
  step++;
};

// ==============================
// [1] トップページ → 会員登録
// ==============================
console.log('[1] CrowdWorks トップ...');
await page.goto('https://crowdworks.jp/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));
await ss('top');

// 会員登録ボタン
try {
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a, button')];
    const reg = links.find(el => el.textContent.includes('会員登録') || el.textContent.includes('新規登録'));
    if (reg) reg.click();
  });
  console.log('[1] 会員登録クリック');
} catch(e) {
  console.log('[1] 会員登録ボタン見つからず:', e.message);
}
await new Promise(r => setTimeout(r, 4000));
await ss('register-page');

// ==============================
// [2] Google OAuth 優先
// ==============================
console.log('[2] Google OAuthを試みます...');
let oauthClicked = false;

try {
  oauthClicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('a, button')];
    const googleBtn = btns.find(el =>
      el.textContent.includes('Google') ||
      el.getAttribute('data-provider') === 'google' ||
      (el.href && el.href.includes('google'))
    );
    if (googleBtn) { googleBtn.click(); return true; }
    return false;
  });
} catch(e) {
  console.log('[2] Google OAuth検索エラー:', e.message);
}

if (oauthClicked) {
  console.log('[2] Googleボタンクリック。OAuthポップアップを待ちます...');
  await new Promise(r => setTimeout(r, 5000));

  // ポップアップハンドリング
  const pages = await browser.pages();
  const popup = pages.find(p => p !== page);
  if (popup) {
    console.log('[2] ポップアップ検出:', await popup.url());
    await new Promise(r => setTimeout(r, 3000));

    // Googleアカウント選択 (archbridge24@gmail.com)
    try {
      await popup.waitForSelector('[data-email], [data-identifier], div[data-authuser]', { timeout: 10000 });
      const selected = await popup.evaluate((email) => {
        const items = document.querySelectorAll('[data-email], li, div[role="listitem"]');
        for (const item of items) {
          if (item.textContent.includes(email)) {
            item.click();
            return true;
          }
        }
        return false;
      }, 'archbridge24@gmail.com');
      console.log('[2] アカウント選択:', selected);
    } catch(e) {
      console.log('[2] アカウント選択UI見つからず。手動操作してください。');
    }

    // CAPTCHA/承認待機（5分）
    console.log('[2] >>> CAPTCHA/承認が出たら操作してください。5分待ちます <<<');
    let oauthDone = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const popupPages = await browser.pages();
      if (!popupPages.includes(popup) || popup.isClosed()) {
        console.log('[2] ポップアップが閉じました（OAuth完了）');
        oauthDone = true;
        break;
      }
      if (i % 6 === 0) console.log(`[2] 待機中... ${i*5}s`);
    }
    if (!oauthDone) console.log('[2] ポップアップタイムアウト（続行）');
  } else {
    console.log('[2] ポップアップなし（同一ページ遷移かも）');
  }

  await new Promise(r => setTimeout(r, 5000));
  await ss('after-oauth');
} else {
  // ==============================
  // [2b] メール/パスワード登録フォールバック
  // ==============================
  console.log('[2b] Googleボタン未検出。メール登録フォールバック...');
  try {
    // メールアドレス入力
    await page.evaluate((email) => {
      const inputs = [...document.querySelectorAll('input[type=email], input[name*=email], input[placeholder*=メール]')];
      if (inputs[0]) {
        inputs[0].focus();
        inputs[0].value = email;
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 'archbridge24@gmail.com');

    // ユーザー名
    await page.evaluate((uname) => {
      const inputs = [...document.querySelectorAll('input[name*=name], input[name*=login], input[placeholder*=ユーザー]')];
      if (inputs[0]) {
        inputs[0].focus();
        inputs[0].value = uname;
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 'archbridge24');

    // パスワード
    await page.evaluate((pwd) => {
      const inputs = [...document.querySelectorAll('input[type=password]')];
      if (inputs[0]) {
        inputs[0].focus();
        inputs[0].value = pwd;
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (inputs[1]) {
        inputs[1].focus();
        inputs[1].value = pwd;
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, CW_PASSWORD);

    console.log('[2b] フォーム入力完了');
  } catch(e) {
    console.log('[2b] フォーム入力エラー:', e.message);
  }
  await ss('form-filled');

  // CAPTCHA待機
  console.log('[2b] >>> CAPTCHAが出たら操作してください。5分待ちます <<<');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const url = page.url();
    if (!url.includes('signup') && !url.includes('register') && !url.includes('entry')) {
      console.log('[2b] 登録完了（URLが変化）:', url);
      break;
    }
    if (i % 6 === 0) console.log(`[2b] 待機中... ${i*5}s`);
  }
  await ss('after-signup');
}

// ==============================
// [3] 利用方法選択: 受注側
// ==============================
console.log('[3] 利用方法選択（受注側）...');
await new Promise(r => setTimeout(r, 3000));

try {
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll('label, button, div[role=radio], input[type=radio]')];
    for (const el of elements) {
      const text = el.textContent || '';
      if (text.includes('受注') || text.includes('ワーカー') || text.includes('フリーランサー') || text.includes('仕事を受ける')) {
        el.click();
        return;
      }
    }
    // radio fallback
    document.querySelectorAll('input[type=radio]').forEach(r => {
      const label = (r.closest('label') || r.parentElement)?.textContent || '';
      if (label.includes('受注') || label.includes('ワーカー')) r.click();
    });
  });
  console.log('[3] 受注側選択');
} catch(e) {
  console.log('[3] 受注側選択エラー:', e.message);
}
await new Promise(r => setTimeout(r, 2000));
await ss('worker-selected');

// 次へ/続ける
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, input[type=submit]')];
  const next = btns.find(b => {
    const t = b.textContent.toLowerCase();
    return t.includes('次') || t.includes('続') || t.includes('next') || t.includes('continue') || t.includes('登録');
  });
  if (next) next.click();
});
await new Promise(r => setTimeout(r, 4000));
await ss('after-worker-select');

// ==============================
// [4] プロフィール基本情報
// ==============================
console.log('[4] プロフィール基本情報...');

// 職種選択
try {
  await page.evaluate(() => {
    const checkTargets = ['IT', 'プログラミング', '翻訳', '通訳'];
    document.querySelectorAll('input[type=checkbox], label').forEach(el => {
      const text = el.textContent || el.value || '';
      if (checkTargets.some(t => text.includes(t))) {
        if (el.tagName === 'LABEL') el.click();
        else if (el.type === 'checkbox') el.click();
      }
    });
  });
  console.log('[4] 職種選択: IT・プログラミング、翻訳・通訳');
} catch(e) {
  console.log('[4] 職種選択エラー:', e.message);
}

// 生年月日（1993-01-15）
try {
  await page.evaluate(() => {
    const allInputs = [...document.querySelectorAll('input, select')];
    for (const el of allInputs) {
      const ctx = (el.name || el.id || el.placeholder || '').toLowerCase();
      if (ctx.includes('year') || ctx.includes('birth_year') || ctx.includes('生年')) {
        if (el.tagName === 'SELECT') {
          [...el.options].forEach(o => { if (o.value === '1993' || o.text === '1993') el.value = o.value; });
        } else {
          el.value = '1993';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (ctx.includes('month') || ctx.includes('birth_month') || ctx.includes('生月')) {
        if (el.tagName === 'SELECT') {
          [...el.options].forEach(o => { if (o.value === '1' || o.value === '01') el.value = o.value; });
        } else {
          el.value = '1';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (ctx.includes('day') || ctx.includes('birth_day') || ctx.includes('生日')) {
        if (el.tagName === 'SELECT') {
          [...el.options].forEach(o => { if (o.value === '15') el.value = o.value; });
        } else {
          el.value = '15';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  });
  console.log('[4] 生年月日入力: 1993-01-15');
} catch(e) {
  console.log('[4] 生年月日エラー:', e.message);
}

await new Promise(r => setTimeout(r, 2000));
await ss('profile-filled');

// 保存/次へ
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, input[type=submit]')];
  const save = btns.find(b => {
    const t = (b.textContent || b.value || '').toLowerCase();
    return t.includes('保存') || t.includes('次') || t.includes('続') || t.includes('完了') || t.includes('save') || t.includes('next');
  });
  if (save) save.click();
});
await new Promise(r => setTimeout(r, 5000));
await ss('after-profile');

// ==============================
// [5] ステップ完走ループ
// ==============================
console.log('[5] 残ステップを自動処理...');
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const url = page.url();
  console.log(`[5-${i}] URL:`, url);
  await ss(`loop-${i}`);

  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, input[type=submit]')];
    const next = btns.find(b => {
      const t = (b.textContent || b.value || '').trim().toLowerCase();
      return t.includes('次') || t.includes('続') || t.includes('完了') || t.includes('スキップ') ||
             t.includes('next') || t.includes('continue') || t.includes('skip') || t.includes('save');
    });
    if (next) { next.click(); return (next.textContent || next.value || '').trim(); }
    return null;
  });

  if (!clicked) {
    console.log(`[5-${i}] ボタンなし。完了とみなします`);
    break;
  }
  console.log(`[5-${i}] クリック:`, clicked);
}

// ==============================
// [6] 完了
// ==============================
console.log('\n[DONE] 登録フロー完了');
console.log('最終URL:', page.url());
await ss('final');

const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
rl2.question('\nプロフィール編集画面に移動しますか？ (y/n): ', async (ans) => {
  rl2.close();
  if (ans.trim().toLowerCase() === 'y') {
    await page.goto('https://crowdworks.jp/public/employees/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('プロフィール編集: https://crowdworks.jp/public/employees/new');
  }
  console.log('ブラウザを5分間開いたままにします...');
  await new Promise(r => setTimeout(r, 300000));
  await browser.close();
});
