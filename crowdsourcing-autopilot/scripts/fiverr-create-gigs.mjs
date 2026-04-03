import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import readline from 'readline';

// --- YAML Load ---
const yamlPath = path.resolve('./data/fiverr-gigs.yaml');
const { gigs } = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
console.log(`[INIT] Loaded ${gigs.length} gigs from fiverr-gigs.yaml`);

// --- Readline helper ---
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// --- Browser ---
const browser = await puppeteer.launch({
  headless: false,
  userDataDir: '/tmp/puppeteer-fiverr-profile',
  args: ['--window-size=1280,900', '--window-position=0,0'],
  defaultViewport: { width: 1280, height: 900 },
  slowMo: 80,
});

const page = (await browser.pages())[0];

// --- Navigate to Fiverr ---
console.log('[1] Navigating to Fiverr...');
await page.goto('https://www.fiverr.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// --- Login check ---
const isLoggedIn = await page.evaluate(() => {
  return !document.querySelector('[data-testid="join_button"]') &&
    !document.body.innerText.includes('Join Fiverr');
}).catch(() => false);

if (!isLoggedIn) {
  console.log('[1] >>> ログインが必要です。ブラウザでログインしてEnterを押してください <<<');
  await prompt('ログイン完了後 Enter: ');
}

await page.screenshot({ path: '/tmp/fiverr-login-ok.png' });
console.log('[1] Session OK:', page.url());

// --- Helper: type into field ---
async function typeInto(selector, text, opts = {}) {
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.click(selector);
  await page.evaluate(sel => { document.querySelector(sel).value = ''; }, selector);
  await page.type(selector, text, { delay: 60, ...opts });
}

// --- Helper: screenshot ---
async function shot(gigId, step) {
  const p = `/tmp/fiverr-gig-${gigId}-step-${step}.png`;
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  [screenshot] ${p}`);
}

// --- Process each Gig ---
for (let i = 0; i < gigs.length; i++) {
  const gig = gigs[i];
  console.log(`\n========== GIG ${i + 1}/${gigs.length}: ${gig.id} ==========`);
  console.log(`  Title: ${gig.title}`);

  try {
    // === STEP 1: Navigate to Create Gig ===
    await page.goto('https://www.fiverr.com/manage_gigs/create', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 5000));

    // CAPTCHA check
    for (let j = 0; j < 6; j++) {
      const url = page.url();
      if (url.includes('manage_gigs/create') || url.includes('gig_wizard')) break;
      console.log(`  Waiting for page... (${j * 5}s)`);
      await new Promise(r => setTimeout(r, 5000));
    }
    await shot(gig.id, 1);

    // === STEP 2: Overview - Title ===
    console.log('  [Overview] Filling title...');
    try {
      const titleSel = [
        'input[placeholder*="title" i]',
        'input[name="title"]',
        '[data-testid="gig-title"] input',
        '#gig-title',
        'input[id*="title"]',
      ];
      let filled = false;
      for (const sel of titleSel) {
        const el = await page.$(sel);
        if (el) {
          await page.click(sel);
          await page.evaluate(s => { const e = document.querySelector(s); if(e) e.value = ''; }, sel);
          await page.type(sel, gig.title, { delay: 60 });
          filled = true;
          console.log(`  Title filled with: ${sel}`);
          break;
        }
      }
      if (!filled) console.log('  [WARN] Title field not found - fill manually');
    } catch (e) {
      console.log('  [WARN] Title error:', e.message);
    }
    await shot(gig.id, 2);

    // === STEP 3: Tags ===
    console.log('  [Overview] Filling tags...');
    try {
      const tagSel = [
        'input[placeholder*="tag" i]',
        'input[placeholder*="search tag" i]',
        '[data-testid="tags"] input',
      ];
      for (const sel of tagSel) {
        const el = await page.$(sel);
        if (el) {
          for (const tag of gig.search_tags.slice(0, 5)) {
            await page.click(sel);
            await page.type(sel, tag, { delay: 50 });
            await new Promise(r => setTimeout(r, 800));
            // Try selecting first dropdown option
            const optSel = ['.search-result:first-child', '[role="option"]:first-child', 'li[data-value]:first-child'];
            for (const o of optSel) {
              const opt = await page.$(o);
              if (opt) { await opt.click(); break; }
            }
            await new Promise(r => setTimeout(r, 500));
          }
          break;
        }
      }
    } catch (e) {
      console.log('  [WARN] Tags error:', e.message);
    }
    await shot(gig.id, 3);

    console.log(`
  ================================================================
  [GIG: ${gig.id}] Overview画面の入力内容を確認してください。
  - タイトル: ${gig.title}
  - カテゴリ: ${gig.category} > ${gig.subcategory}
  - タグ: ${gig.search_tags.join(', ')}

  カテゴリとタグはドロップダウンのため手動選択が必要な場合があります。
  完了後 "Save & Continue" をクリックし、次のステップに進んでください。
  ================================================================`);

    const proceed1 = await prompt('Overview完了後 Enter (スキップ: s): ');
    if (proceed1.trim().toLowerCase() === 's') {
      console.log('  Skipping to next gig...');
      continue;
    }

    // === STEP 4: Pricing ===
    console.log('  [Pricing] Filling packages...');
    await shot(gig.id, 4);
    const pkgs = [
      { key: 'basic', label: 'Basic' },
      { key: 'standard', label: 'Standard' },
      { key: 'premium', label: 'Premium' },
    ];

    for (const { key } of pkgs) {
      const pkg = gig.packages[key];
      if (!pkg) continue;
      console.log(`  Package ${key}: ${pkg.name} / $${pkg.price} / ${pkg.delivery_days}d`);
    }

    console.log(`
  ================================================================
  [GIG: ${gig.id}] Pricing画面を入力してください:

  Basic (${gig.packages.basic.name}):
    - Description: ${gig.packages.basic.description}
    - Delivery: ${gig.packages.basic.delivery_days} days
    - Price: $${gig.packages.basic.price}
    - Revisions: ${gig.packages.basic.revisions}

  Standard (${gig.packages.standard.name}):
    - Description: ${gig.packages.standard.description}
    - Delivery: ${gig.packages.standard.delivery_days} days
    - Price: $${gig.packages.standard.price}
    - Revisions: ${gig.packages.standard.revisions}

  Premium (${gig.packages.premium.name}):
    - Description: ${gig.packages.premium.description}
    - Delivery: ${gig.packages.premium.delivery_days} days
    - Price: $${gig.packages.premium.price}
    - Revisions: ${gig.packages.premium.revisions}

  入力後 "Save & Continue" をクリックしてください。
  ================================================================`);

    const proceed2 = await prompt('Pricing完了後 Enter (スキップ: s): ');
    if (proceed2.trim().toLowerCase() === 's') { continue; }

    // === STEP 5: Description ===
    console.log('  [Description] Copying content to clipboard...');
    await shot(gig.id, 5);

    console.log(`
  ================================================================
  [GIG: ${gig.id}] Description画面に以下を貼り付けてください:

---DESCRIPTION START---
${gig.description}
---DESCRIPTION END---

  FAQ:
${gig.faq.map((f, i) => `  Q${i+1}: ${f.q}\n  A${i+1}: ${f.a}`).join('\n\n')}

  入力後 "Save & Continue" をクリックしてください。
  ================================================================`);

    const proceed3 = await prompt('Description完了後 Enter (スキップ: s): ');
    if (proceed3.trim().toLowerCase() === 's') { continue; }

    // === STEP 6: Requirements ===
    await shot(gig.id, 6);
    console.log(`
  ================================================================
  [GIG: ${gig.id}] Requirements画面に以下の質問を追加してください:

${gig.requirements.map((r, i) => `  ${i+1}. ${r}`).join('\n')}

  入力後 "Save & Continue" をクリックしてください。
  ================================================================`);

    const proceed4 = await prompt('Requirements完了後 Enter (スキップ: s): ');
    if (proceed4.trim().toLowerCase() === 's') { continue; }

    // === STEP 7: Gallery ===
    await shot(gig.id, 7);
    console.log(`
  ================================================================
  [GIG: ${gig.id}] Gallery (画像アップロード) 画面です。
  必要に応じて画像をアップロードし、"Save & Continue" をクリックしてください。
  ================================================================`);

    const proceed5 = await prompt('Gallery完了後 Enter (スキップ: s, 公開: p): ');
    if (proceed5.trim().toLowerCase() === 's') { continue; }
    if (proceed5.trim().toLowerCase() === 'p') {
      console.log('  Publishing gig...');
      const pubSelectors = [
        'button[data-testid="publish-button"]',
        'button[aria-label*="publish" i]',
        'button:has-text("Publish")',
        '.submit-btn',
      ];
      for (const sel of pubSelectors) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); break; }
      }
      await new Promise(r => setTimeout(r, 3000));
      await shot(gig.id, 8);
    }

    console.log(`\n  [DONE] Gig "${gig.id}" completed!`);

    if (i < gigs.length - 1) {
      const next = await prompt(`\n次のGig (${gigs[i+1].id}) に進みますか？ (Enter: yes / s: skip all): `);
      if (next.trim().toLowerCase() === 's') {
        console.log('All done. Closing browser.');
        break;
      }
    }

  } catch (err) {
    console.error(`  [ERROR] Gig ${gig.id} failed:`, err.message);
    await page.screenshot({ path: `/tmp/fiverr-gig-${gig.id}-error.png`, fullPage: true });
    console.log(`  Error screenshot: /tmp/fiverr-gig-${gig.id}-error.png`);
    const skip = await prompt('次のGigに進みますか？ (Enter: yes / q: quit): ');
    if (skip.trim().toLowerCase() === 'q') break;
  }
}

console.log('\n[DONE] All gigs processed.');
await browser.close();
